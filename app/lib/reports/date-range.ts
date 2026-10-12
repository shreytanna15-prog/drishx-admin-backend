import {
  financialYearBounds,
  getFinancialYear,
} from "@/app/lib/finance/financial-year";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Cap inclusive calendar days for date-range reports to protect DB load. */
export const REPORT_MAX_RANGE_DAYS = 366;

export type ParsedDateRange = {
  from: Date;
  to: Date;
  fromKey: string;
  toKey: string;
};

function parseDateOnly(value: string, endOfDay: boolean): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map((p) => Number.parseInt(p, 10));
  if (!y || !m || !d) return null;
  if (endOfDay) return new Date(y, m - 1, d, 23, 59, 59, 999);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Resolve from/to for reports. Defaults to current FY when both omitted.
 * Returns an error message when invalid.
 */
export function resolveReportDateRange(input: {
  from?: string | null;
  to?: string | null;
  fy?: string | null;
}): { ok: true; range: ParsedDateRange } | { ok: false; error: string } {
  const fromRaw = input.from?.trim() || "";
  const toRaw = input.to?.trim() || "";

  if (!fromRaw && !toRaw) {
    const fy = input.fy?.trim() || getFinancialYear();
    const { start, end } = financialYearBounds(fy);
    return {
      ok: true,
      range: {
        from: start,
        to: end,
        fromKey: formatDateKey(start),
        toKey: formatDateKey(end),
      },
    };
  }

  if (!fromRaw || !toRaw) {
    return {
      ok: false,
      error: "Both from and to dates are required (YYYY-MM-DD), or omit both for the financial year.",
    };
  }

  const from = parseDateOnly(fromRaw, false);
  const to = parseDateOnly(toRaw, true);
  if (!from || !to) {
    return { ok: false, error: "Invalid from/to date. Use YYYY-MM-DD." };
  }
  if (from.getTime() > to.getTime()) {
    return { ok: false, error: "from must be on or before to." };
  }

  const days =
    Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (days > REPORT_MAX_RANGE_DAYS) {
    return {
      ok: false,
      error: `Date range cannot exceed ${REPORT_MAX_RANGE_DAYS} days.`,
    };
  }

  return {
    ok: true,
    range: {
      from,
      to,
      fromKey: fromRaw,
      toKey: toRaw,
    },
  };
}
