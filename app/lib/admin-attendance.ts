import { adminFetch } from "@/app/lib/admin-api";

export type AttendanceEmployeeBrief = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  isActive: boolean;
};

export type AttendanceRecordRow = {
  id: string;
  employeeId: string;
  employee: AttendanceEmployeeBrief;
  status: string;
  method: "QR_SCAN" | "BY_ADMIN";
  markedAt: string;
  markedBy: { id: string; name: string | null; email: string } | null;
};

export type AttendanceTodayPayload = {
  date: string;
  token: string;
  qrPayload: string;
  tokenExpiresAt: string;
  tokenTtlSeconds: number;
  timezone: string;
  records: AttendanceRecordRow[];
  absentEmployees: AttendanceEmployeeBrief[];
};

export type AttendanceCalendarDay = {
  date: string;
  presentCount: number;
  absentCount: number;
  employeeIds: string[];
};

export type AttendanceCalendarPayload = {
  year: number;
  month: number;
  timezone: string;
  employees: AttendanceEmployeeBrief[];
  days: AttendanceCalendarDay[];
};

export type AttendanceDayDetail = {
  date: string;
  present: AttendanceRecordRow[];
  absent: AttendanceEmployeeBrief[];
};

export async function getAttendanceToday(): Promise<AttendanceTodayPayload> {
  return adminFetch<AttendanceTodayPayload>("/api/attendance/today");
}

export async function refreshAttendanceTodayToken(): Promise<AttendanceTodayPayload> {
  return adminFetch<AttendanceTodayPayload>("/api/attendance/today/refresh", {
    method: "POST",
  });
}

export async function getAttendanceCalendar(params: {
  year: number;
  month: number;
  employeeId?: string;
}): Promise<AttendanceCalendarPayload> {
  const qs = new URLSearchParams({
    year: String(params.year),
    month: String(params.month),
  });
  if (params.employeeId) qs.set("employeeId", params.employeeId);
  return adminFetch<AttendanceCalendarPayload>(
    `/api/attendance/calendar?${qs.toString()}`
  );
}

export async function markAttendanceManual(input: {
  employeeId: string;
  date?: string;
}): Promise<{ alreadyPresent: boolean; message: string }> {
  return adminFetch<{ alreadyPresent: boolean; message: string }>(
    "/api/attendance/manual",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function getAttendanceDayDetail(
  dateKey: string
): Promise<AttendanceDayDetail> {
  return adminFetch<AttendanceDayDetail>(
    `/api/attendance/day?date=${encodeURIComponent(dateKey)}`
  );
}
