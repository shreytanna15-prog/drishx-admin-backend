import { randomBytes } from "crypto";
import { AttendanceMethod, UserRole } from "@prisma/client";
import { prisma } from "./prisma";

export const ATTENDANCE_TIMEZONE = "Asia/Kolkata";
/** QR token lifetime — WhatsApp screenshots go stale after this window. */
export const ATTENDANCE_TOKEN_TTL_MS = 5 * 60 * 1000;

const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function partsInTz(date: Date, timeZone: string) {
  let fmt = FORMATTER_CACHE.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    FORMATTER_CACHE.set(timeZone, fmt);
  }
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

/** Calendar date key YYYY-MM-DD in Asia/Kolkata. */
export function dateKeyInAttendanceTz(date: Date = new Date()): string {
  const p = partsInTz(date, ATTENDANCE_TIMEZONE);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** UTC midnight Date for a YYYY-MM-DD key (stable for @db.Date). */
export function dateFromKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function getTodayKey(now: Date = new Date()): string {
  return dateKeyInAttendanceTz(now);
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

function employeeSelect() {
  return {
    id: true,
    name: true,
    email: true,
    role: true,
    isActive: true,
  } as const;
}

export type AttendanceDayWithRecords = Awaited<
  ReturnType<typeof ensureAttendanceDay>
>;

/**
 * Ensure today's AttendanceDay exists and rotate the QR token when expired.
 */
export async function ensureAttendanceDay(now: Date = new Date()) {
  const dateKey = getTodayKey(now);
  const date = dateFromKey(dateKey);

  let day = await prisma.attendanceDay.findUnique({
    where: { date },
    include: {
      records: {
        include: {
          employee: { select: employeeSelect() },
          markedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { markedAt: "asc" },
      },
    },
  });

  if (!day) {
    day = await prisma.attendanceDay.create({
      data: {
        date,
        currentToken: newToken(),
        tokenExpiresAt: new Date(now.getTime() + ATTENDANCE_TOKEN_TTL_MS),
      },
      include: {
        records: {
          include: {
            employee: { select: employeeSelect() },
            markedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { markedAt: "asc" },
        },
      },
    });
    return day;
  }

  if (day.tokenExpiresAt.getTime() <= now.getTime()) {
    day = await prisma.attendanceDay.update({
      where: { id: day.id },
      data: {
        currentToken: newToken(),
        tokenExpiresAt: new Date(now.getTime() + ATTENDANCE_TOKEN_TTL_MS),
      },
      include: {
        records: {
          include: {
            employee: { select: employeeSelect() },
            markedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { markedAt: "asc" },
        },
      },
    });
  }

  return day;
}

/** Force a new token immediately (admin refresh). */
export async function refreshAttendanceToken(now: Date = new Date()) {
  const day = await ensureAttendanceDay(now);
  return prisma.attendanceDay.update({
    where: { id: day.id },
    data: {
      currentToken: newToken(),
      tokenExpiresAt: new Date(now.getTime() + ATTENDANCE_TOKEN_TTL_MS),
    },
    include: {
      records: {
        include: {
          employee: { select: employeeSelect() },
          markedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { markedAt: "asc" },
      },
    },
  });
}

export async function listActiveEmployees() {
  return prisma.user.findMany({
    where: { role: UserRole.EMPLOYEE, isActive: true },
    select: employeeSelect(),
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

export async function getDayRoster(dateKey: string) {
  const date = dateFromKey(dateKey);
  const day = await prisma.attendanceDay.findUnique({
    where: { date },
    include: {
      records: {
        include: {
          employee: { select: employeeSelect() },
          markedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { markedAt: "asc" },
      },
    },
  });

  const employees = await listActiveEmployees();
  const presentIds = new Set((day?.records ?? []).map((r) => r.employeeId));
  const present = day?.records ?? [];
  const absent = employees.filter((e) => !presentIds.has(e.id));

  return {
    date: dateKey,
    day: day
      ? {
          id: day.id,
          tokenExpiresAt: day.tokenExpiresAt.toISOString(),
        }
      : null,
    present,
    absent,
  };
}

export type MarkResult =
  | { ok: true; alreadyPresent: boolean; record: Awaited<ReturnType<typeof serializeRecord>> }
  | { ok: false; error: string; status: number };

async function serializeRecord(recordId: string) {
  return prisma.attendanceRecord.findUniqueOrThrow({
    where: { id: recordId },
    include: {
      employee: { select: employeeSelect() },
      markedBy: { select: { id: true, name: true, email: true } },
      day: { select: { id: true, date: true } },
    },
  });
}

export async function markPresentQr(params: {
  employeeId: string;
  token: string;
  now?: Date;
}): Promise<MarkResult> {
  const now = params.now ?? new Date();
  const employee = await prisma.user.findUnique({
    where: { id: params.employeeId },
    select: { id: true, role: true, isActive: true },
  });
  if (!employee || employee.role !== UserRole.EMPLOYEE) {
    return { ok: false, error: "Only employees can scan attendance.", status: 403 };
  }
  if (!employee.isActive) {
    return { ok: false, error: "Inactive employees cannot mark attendance.", status: 403 };
  }

  const day = await ensureAttendanceDay(now);
  if (day.currentToken !== params.token.trim()) {
    return {
      ok: false,
      error: "QR code expired or invalid. Ask admin to show the current office QR.",
      status: 400,
    };
  }
  if (day.tokenExpiresAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      error: "QR code expired. Ask admin to show the current office QR.",
      status: 400,
    };
  }

  const existing = await prisma.attendanceRecord.findUnique({
    where: {
      employeeId_dayId: { employeeId: params.employeeId, dayId: day.id },
    },
  });
  if (existing) {
    return {
      ok: true,
      alreadyPresent: true,
      record: await serializeRecord(existing.id),
    };
  }

  const created = await prisma.attendanceRecord.create({
    data: {
      dayId: day.id,
      employeeId: params.employeeId,
      status: "PRESENT",
      method: AttendanceMethod.QR_SCAN,
      markedAt: now,
    },
  });

  return {
    ok: true,
    alreadyPresent: false,
    record: await serializeRecord(created.id),
  };
}

export async function markPresentAdmin(params: {
  employeeId: string;
  adminId: string;
  dateKey?: string;
  now?: Date;
}): Promise<MarkResult> {
  const now = params.now ?? new Date();
  const dateKey = params.dateKey ?? getTodayKey(now);
  const date = dateFromKey(dateKey);

  const employee = await prisma.user.findUnique({
    where: { id: params.employeeId },
    select: { id: true, role: true, isActive: true },
  });
  if (!employee || employee.role !== UserRole.EMPLOYEE) {
    return { ok: false, error: "Employee not found.", status: 404 };
  }
  if (!employee.isActive) {
    return { ok: false, error: "Cannot mark an inactive employee present.", status: 400 };
  }

  let day = await prisma.attendanceDay.findUnique({ where: { date } });
  if (!day) {
    day = await prisma.attendanceDay.create({
      data: {
        date,
        currentToken: newToken(),
        tokenExpiresAt: new Date(now.getTime() + ATTENDANCE_TOKEN_TTL_MS),
      },
    });
  }

  const existing = await prisma.attendanceRecord.findUnique({
    where: {
      employeeId_dayId: { employeeId: params.employeeId, dayId: day.id },
    },
  });
  if (existing) {
    return {
      ok: true,
      alreadyPresent: true,
      record: await serializeRecord(existing.id),
    };
  }

  const created = await prisma.attendanceRecord.create({
    data: {
      dayId: day.id,
      employeeId: params.employeeId,
      status: "PRESENT",
      method: AttendanceMethod.BY_ADMIN,
      markedAt: now,
      markedById: params.adminId,
    },
  });

  return {
    ok: true,
    alreadyPresent: false,
    record: await serializeRecord(created.id),
  };
}

export async function getEmployeeMe(employeeId: string, now: Date = new Date()) {
  const todayKey = getTodayKey(now);
  const todayDate = dateFromKey(todayKey);
  const todayRecord = await prisma.attendanceRecord.findFirst({
    where: {
      employeeId,
      day: { date: todayDate },
    },
    include: {
      markedBy: { select: { id: true, name: true, email: true } },
      day: { select: { date: true } },
    },
  });

  const recent = await prisma.attendanceRecord.findMany({
    where: { employeeId },
    include: {
      day: { select: { date: true } },
      markedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { markedAt: "desc" },
    take: 60,
  });

  return {
    today: {
      date: todayKey,
      present: Boolean(todayRecord),
      record: todayRecord
        ? {
            id: todayRecord.id,
            method: todayRecord.method,
            markedAt: todayRecord.markedAt.toISOString(),
            markedBy: todayRecord.markedBy,
          }
        : null,
    },
    recent: recent.map((r) => ({
      id: r.id,
      date: dateKeyFromDbDate(r.day.date),
      method: r.method,
      markedAt: r.markedAt.toISOString(),
      markedBy: r.markedBy,
    })),
  };
}

function dateKeyFromDbDate(date: Date): string {
  // @db.Date comes back as UTC midnight of the calendar day
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export async function getCalendar(params: {
  year: number;
  month: number; // 1-12
  employeeId?: string | null;
}) {
  const { year, month, employeeId } = params;
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error("Invalid year or month.");
  }

  const startKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endKey = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const start = dateFromKey(startKey);
  const end = dateFromKey(endKey);

  const employees = employeeId
    ? await prisma.user.findMany({
        where: { id: employeeId, role: UserRole.EMPLOYEE },
        select: employeeSelect(),
      })
    : await listActiveEmployees();

  const days = await prisma.attendanceDay.findMany({
    where: { date: { gte: start, lte: end } },
    include: {
      records: {
        where: employeeId ? { employeeId } : undefined,
        select: {
          employeeId: true,
          method: true,
          markedAt: true,
        },
      },
    },
    orderBy: { date: "asc" },
  });

  const byDate: Record<
    string,
    { presentCount: number; employeeIds: string[]; methods: Record<string, string> }
  > = {};

  for (let d = 1; d <= lastDay; d++) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    byDate[key] = { presentCount: 0, employeeIds: [], methods: {} };
  }

  for (const day of days) {
    const key = dateKeyFromDbDate(day.date);
    if (!byDate[key]) continue;
    byDate[key].presentCount = day.records.length;
    byDate[key].employeeIds = day.records.map((r) => r.employeeId);
    for (const r of day.records) {
      byDate[key].methods[r.employeeId] = r.method;
    }
  }

  const totalEmployees = employees.length;
  const daysList = Object.entries(byDate).map(([date, info]) => ({
    date,
    presentCount: info.presentCount,
    absentCount: employeeId
      ? info.presentCount > 0
        ? 0
        : 1
      : Math.max(0, totalEmployees - info.presentCount),
    present: employeeId ? info.presentCount > 0 : undefined,
    employeeIds: info.employeeIds,
    methods: info.methods,
  }));

  return {
    year,
    month,
    timezone: ATTENDANCE_TIMEZONE,
    employees,
    days: daysList,
  };
}

export function serializeTodayPayload(day: AttendanceDayWithRecords, absent: Awaited<ReturnType<typeof listActiveEmployees>>) {
  const presentIds = new Set(day.records.map((r) => r.employeeId));
  return {
    date: dateKeyFromDbDate(day.date),
    token: day.currentToken,
    qrPayload: day.currentToken,
    tokenExpiresAt: day.tokenExpiresAt.toISOString(),
    tokenTtlSeconds: Math.round(ATTENDANCE_TOKEN_TTL_MS / 1000),
    timezone: ATTENDANCE_TIMEZONE,
    records: day.records.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employee: r.employee,
      status: r.status,
      method: r.method,
      markedAt: r.markedAt.toISOString(),
      markedBy: r.markedBy,
    })),
    absentEmployees: absent.filter((e) => !presentIds.has(e.id)),
  };
}
