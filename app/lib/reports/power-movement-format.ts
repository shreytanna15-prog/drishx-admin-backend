/**
 * Pure helpers for RW-06 power movement reports (fast / slow / dead / unsold).
 *
 * Approved working definitions (developer-approved; client confirmation pending):
 * - Fast/Slow: rolling window (default 90 days in UI); thresholds admin-entered.
 * - Slow: positive sold qty only (zeros belong in Unsold/Dead).
 * - Unsold: onHand > 0 and zero sales in selected period.
 * - Dead: onHand > 0, zero sales in preceding 180 days, and sufficient history.
 */

export const DEFAULT_MOVEMENT_WINDOW_DAYS = 90;
export const DEAD_POWERS_LOOKBACK_DAYS = 180;

export type PowerMovementRow = {
  lensType: string;
  lensId: string;
  label: string;
  power: string;
  onHand: number;
  soldQty: number;
  /** Catalog/SKU introduction time — used for Dead history eligibility. */
  introducedAt: Date | null;
};

export type PowerMovementMode = "fast" | "slow" | "dead" | "unsold";

export type DeadEligibility = "DEAD" | "INSUFFICIENT_HISTORY";

/** Aggregate sold quantities keyed by `${lensType}::${lensId}`. */
export function aggregateSoldQtyByLens(
  lines: Array<{
    lensType: string | null;
    lensId: string | null;
    quantity: number;
  }>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    if (!line.lensType || !line.lensId) continue;
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty === 0) continue;
    const key = `${line.lensType}::${line.lensId}`;
    map.set(key, (map.get(key) ?? 0) + qty);
  }
  return map;
}

/** Net sales = issued sales − returned qty (same lens), floored at 0. */
export function netSoldQty(sold: number, returned: number): number {
  const s = Number.isFinite(sold) ? sold : 0;
  const r = Number.isFinite(returned) ? Math.max(0, returned) : 0;
  return Math.max(0, s - r);
}

export function powerMovementKey(lensType: string, lensId: string): string {
  return `${lensType}::${lensId}`;
}

export function hasSufficientDeadHistory(
  introducedAt: Date | null,
  lookbackDays: number,
  now: Date = new Date()
): boolean {
  if (!introducedAt) return false;
  const ms = lookbackDays * 24 * 60 * 60 * 1000;
  return introducedAt.getTime() <= now.getTime() - ms;
}

export function classifyDeadPower(
  row: Pick<PowerMovementRow, "onHand" | "soldQty" | "introducedAt">,
  lookbackDays: number = DEAD_POWERS_LOOKBACK_DAYS,
  now: Date = new Date()
): DeadEligibility | null {
  if (!(row.onHand > 0) || row.soldQty !== 0) return null;
  if (!hasSufficientDeadHistory(row.introducedAt, lookbackDays, now)) {
    return "INSUFFICIENT_HISTORY";
  }
  return "DEAD";
}

/**
 * Classify rows for a movement report.
 * - unsold: onHand > 0 and soldQty === 0 (selected period)
 * - dead: onHand > 0, soldQty === 0 over 180d window; split Dead vs Insufficient History
 * - fast: soldQty >= minUnits (required)
 * - slow: onHand > 0 and 0 < soldQty <= maxUnits (required)
 */
export function selectPowerMovementRows(
  rows: PowerMovementRow[],
  mode: PowerMovementMode,
  thresholds?: { minUnits?: number; maxUnits?: number },
  options?: { now?: Date; deadLookbackDays?: number }
): Array<PowerMovementRow & { eligibility?: DeadEligibility }> {
  if (mode === "unsold") {
    return rows
      .filter((r) => r.onHand > 0 && r.soldQty === 0)
      .toSorted(
        (a, b) =>
          b.onHand - a.onHand ||
          a.label.localeCompare(b.label) ||
          a.power.localeCompare(b.power)
      );
  }

  if (mode === "dead") {
    const now = options?.now ?? new Date();
    const lookback = options?.deadLookbackDays ?? DEAD_POWERS_LOOKBACK_DAYS;
    const out: Array<PowerMovementRow & { eligibility: DeadEligibility }> = [];
    for (const r of rows) {
      const elig = classifyDeadPower(r, lookback, now);
      if (!elig) continue;
      out.push({ ...r, eligibility: elig });
    }
    return out.toSorted((a, b) => {
      const ao = a.eligibility === "DEAD" ? 0 : 1;
      const bo = b.eligibility === "DEAD" ? 0 : 1;
      return (
        ao - bo ||
        b.onHand - a.onHand ||
        a.label.localeCompare(b.label)
      );
    });
  }

  if (mode === "fast") {
    const min = thresholds?.minUnits;
    if (min == null || !Number.isFinite(min) || min < 0) {
      throw new Error("FAST_THRESHOLD_REQUIRED");
    }
    return rows
      .filter((r) => r.soldQty >= min)
      .toSorted(
        (a, b) =>
          b.soldQty - a.soldQty ||
          a.label.localeCompare(b.label) ||
          a.power.localeCompare(b.power)
      );
  }

  const max = thresholds?.maxUnits;
  if (max == null || !Number.isFinite(max) || max < 0) {
    throw new Error("SLOW_THRESHOLD_REQUIRED");
  }
  return rows
    .filter((r) => r.onHand > 0 && r.soldQty > 0 && r.soldQty <= max)
    .toSorted(
      (a, b) =>
        a.soldQty - b.soldQty ||
        b.onHand - a.onHand ||
        a.label.localeCompare(b.label)
    );
}

export function parseNonNegativeNumber(
  raw: string | number | null | undefined
): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Rolling inclusive calendar window ending today (local). */
export function rollingDateKeys(
  days: number,
  now: Date = new Date()
): { fromKey: string; toKey: string } {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (Math.max(1, days) - 1));
  start.setHours(0, 0, 0, 0);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { fromKey: fmt(start), toKey: fmt(end) };
}

export const POWER_MOVEMENT_COLUMNS = [
  { key: "lensType", label: "Lens type" },
  { key: "label", label: "Product" },
  { key: "power", label: "Power" },
  { key: "onHand", label: "On hand", align: "right" as const },
  { key: "soldQty", label: "Sold (period)", align: "right" as const },
];

export const DEAD_POWERS_COLUMNS = [
  ...POWER_MOVEMENT_COLUMNS,
  { key: "eligibility", label: "Eligibility" },
];
