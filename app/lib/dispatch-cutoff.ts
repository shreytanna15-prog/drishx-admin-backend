import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Dispatch cutoff — single, admin-configurable daily time that decides,
 * at order placement time, which courier day an order belongs to.
 * Orders placed after the cutoff are deferred to the next working day.
 */
export const DISPATCH_CUTOFF_SETTING_KEY = "dispatchCutoff";

export type DispatchCutoffSettings = {
  enabled: boolean;
  /** 24h "HH:MM" in the configured timezone. */
  time: string;
  /** IANA timezone (e.g. "Asia/Kolkata"). */
  timezone: string;
  /** Skip Sat/Sun when deferring to the next day. */
  skipWeekends: boolean;
};

export const DEFAULT_DISPATCH_CUTOFF_SETTINGS: DispatchCutoffSettings = {
  enabled: true,
  time: "19:30",
  timezone: "Asia/Kolkata",
  skipWeekends: true,
};

const TIME_24H_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

/** Calendar date key ("YYYY-MM-DD") of `date` in the given timezone. */
export function dateKeyInTz(date: Date, timeZone: string): string {
  const p = partsInTz(date, timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** UTC midnight of a calendar date — stable, timezone-independent instant. */
function utcMidnightInTz(date: Date, timeZone: string): Date {
  const p = partsInTz(date, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

function nextWorkingDate(date: Date, skipWeekends: boolean): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  while (skipWeekends && (next.getUTCDay() === 0 || next.getUTCDay() === 6)) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function normalizeTime(raw: unknown): string {
  if (typeof raw === "string" && TIME_24H_RE.test(raw)) return raw;
  return DEFAULT_DISPATCH_CUTOFF_SETTINGS.time;
}

function normalizeSettings(raw: unknown): DispatchCutoffSettings {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    enabled:
      typeof obj.enabled === "boolean"
        ? obj.enabled
        : DEFAULT_DISPATCH_CUTOFF_SETTINGS.enabled,
    time: normalizeTime(obj.time),
    timezone:
      typeof obj.timezone === "string" && obj.timezone.trim()
        ? obj.timezone.trim()
        : DEFAULT_DISPATCH_CUTOFF_SETTINGS.timezone,
    skipWeekends:
      typeof obj.skipWeekends === "boolean"
        ? obj.skipWeekends
        : DEFAULT_DISPATCH_CUTOFF_SETTINGS.skipWeekends,
  };
}

export async function getDispatchCutoffSettings(): Promise<DispatchCutoffSettings> {
  const row = await prisma.appSetting.findUnique({
    where: { key: DISPATCH_CUTOFF_SETTING_KEY },
  });
  if (!row) return { ...DEFAULT_DISPATCH_CUTOFF_SETTINGS };
  return normalizeSettings(row.value);
}

export async function setDispatchCutoffSettings(
  input: Partial<DispatchCutoffSettings>
): Promise<DispatchCutoffSettings> {
  const current = await getDispatchCutoffSettings();
  const next = normalizeSettings({ ...current, ...input });

  await prisma.appSetting.upsert({
    where: { key: DISPATCH_CUTOFF_SETTING_KEY },
    create: { key: DISPATCH_CUTOFF_SETTING_KEY, value: next },
    update: { value: next },
  });

  return next;
}

export type CutoffSlot = {
  /** null when the cutoff was disabled at order placement (no gate applies). */
  dispatchDate: Date | null;
  cutoffDeferred: boolean;
};

/**
 * Decide the courier slot at order placement time.
 * Snapshot semantics: later setting changes never rewrite an existing order's slot.
 */
export function resolveDispatchDate(
  now: Date,
  settings: DispatchCutoffSettings
): CutoffSlot {
  if (!settings.enabled) {
    return { dispatchDate: null, cutoffDeferred: false };
  }

  const p = partsInTz(now, settings.timezone);
  const [cutoffHour, cutoffMinute] = settings.time.split(":").map(Number);
  const nowMinutes = p.hour * 60 + p.minute;
  const cutoffMinutes = cutoffHour * 60 + cutoffMinute;

  if (nowMinutes < cutoffMinutes) {
    return { dispatchDate: utcMidnightInTz(now, settings.timezone), cutoffDeferred: false };
  }

  const today = utcMidnightInTz(now, settings.timezone);
  return {
    dispatchDate: nextWorkingDate(today, settings.skipWeekends),
    cutoffDeferred: true,
  };
}

/** One-call helper for the order-creation paths. */
export async function dispatchSlotForNow(
  now: Date = new Date()
): Promise<CutoffSlot> {
  const settings = await getDispatchCutoffSettings();
  return resolveDispatchDate(now, settings);
}

export type DispatchOverrideStamp = {
  overriddenById: string;
  overriddenAt: string;
  reason: string | null;
};

export function buildDispatchOverrideStamp(
  overriddenById: string,
  reason: string | null
): Prisma.InputJsonValue {
  return {
    overriddenById,
    overriddenAt: new Date().toISOString(),
    reason,
  } as unknown as Prisma.InputJsonValue;
}

type DispatchableOrder = {
  dispatchDate?: Date | null;
  dispatchOverrideStamp?: unknown;
};

export type DispatchGateResult = { ok: true } | { ok: false; error: string };

/** True when the order is currently held behind the dispatch cutoff. */
export function isOrderDeferred(
  order: DispatchableOrder,
  now: Date,
  timeZone: string
): boolean {
  if (order.dispatchOverrideStamp) return false;
  if (!order.dispatchDate) return false;
  return dateKeyInTz(order.dispatchDate, timeZone) > dateKeyInTz(now, timeZone);
}

/**
 * Hard gate on the courier handover: rejects dispatching an order whose
 * dispatch date has not arrived, unless a super admin has overridden it.
 */
export async function assertDispatchAllowed(
  order: DispatchableOrder,
  settings?: DispatchCutoffSettings,
  now: Date = new Date()
): Promise<DispatchGateResult> {
  if (order.dispatchOverrideStamp) return { ok: true };
  if (!order.dispatchDate) return { ok: true };

  const cfg = settings ?? (await getDispatchCutoffSettings());
  if (isOrderDeferred(order, now, cfg.timezone)) {
    return {
      ok: false,
      error: `Order placed after the ${cfg.time} dispatch cutoff — dispatch starts on ${dateKeyInTz(order.dispatchDate, cfg.timezone)}. An admin can move it forward.`,
    };
  }
  return { ok: true };
}