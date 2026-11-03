/**
 * RC-03 admin power-range pickers (SPH/CYL bounds).
 *
 * Option universe −40 … +8 (same ordering style as mobile power selects):
 *  - −40 → −16 : step 0.5
 *  - after −16 → +4 : step 0.25 (−15.75 …)
 *  - after +4 → +8 : step 0.5 (+4.5 …)
 *
 * Pure module — safe for client and server (no prisma / React).
 */

export const POWER_OPTION_MIN = -40;
export const POWER_OPTION_MAX = 8;

/** Work in quarter-diopter integers to avoid float drift. */
const Q = 4;

function buildPowerSelectValues(): number[] {
  const out: number[] = [];
  // −40 … −16 step 0.5  (in quarters: -160 … -64 step 2)
  for (let q = POWER_OPTION_MIN * Q; q <= -16 * Q; q += 2) out.push(q / Q);
  // −15.75 … +4 step 0.25 (in quarters: -63 … 16 step 1)
  for (let q = -16 * Q + 1; q <= 4 * Q; q += 1) out.push(q / Q);
  // +4.5 … +8 step 0.5 (in quarters: 18 … 32 step 2)
  for (let q = 4 * Q + 2; q <= POWER_OPTION_MAX * Q; q += 2) out.push(q / Q);
  return out;
}

/** Ascending numeric values allowed for power-range bounds. */
export const POWER_SELECT_VALUES: readonly number[] = Object.freeze(
  buildPowerSelectValues()
);

const POWER_SELECT_SET: ReadonlySet<number> = new Set(
  POWER_SELECT_VALUES.map((v) => normalizePowerValue(v))
);

/** Round to 2 decimals and normalize −0 → 0. */
export function normalizePowerValue(value: number): number {
  const n = Number(Number(value).toFixed(2));
  return Object.is(n, -0) ? 0 : n;
}

/** True when the value is on the allowed −40…+8 stepped grid. */
export function isAllowedPowerValue(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  return POWER_SELECT_SET.has(normalizePowerValue(value));
}

/** `-6` → `-6.00`, `2` → `+2.00`, `0` → `0.00`. */
export function formatPowerLabel(value: number): string {
  const v = normalizePowerValue(value);
  if (v === 0) return "0.00";
  return `${v > 0 ? "+" : "-"}${Math.abs(v).toFixed(2)}`;
}

export type PowerSelectOption = { value: string; label: string };

/** Select options (string values for `<select>`), ascending. */
export function getPowerSelectOptions(): PowerSelectOption[] {
  return POWER_SELECT_VALUES.map((v) => ({
    value: String(normalizePowerValue(v)),
    label: formatPowerLabel(v),
  }));
}

/** SPH display label: `-6.00/+2.00` (min/max). */
export function formatPowerRangeLabel(sphMin: number, sphMax: number): string {
  const lo = Math.min(sphMin, sphMax);
  const hi = Math.max(sphMin, sphMax);
  return `${formatPowerLabel(lo)}/${formatPowerLabel(hi)}`;
}

/**
 * CYL summary shown beside SPH label, e.g. `Cyl 0.00/-2.00`.
 * Minus-cyl ranges list the zero-side bound first.
 */
export function formatCylSummary(cylMin: number, cylMax: number): string {
  const lo = Math.min(cylMin, cylMax);
  const hi = Math.max(cylMin, cylMax);
  const a = hi <= 0 ? hi : lo;
  const b = hi <= 0 ? lo : hi;
  return `Cyl ${formatPowerLabel(a)}/${formatPowerLabel(b)}`;
}

export type PowerRangeBounds = {
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
};

/**
 * Returns an error message when bounds are invalid, otherwise `null`.
 * Bounds must be on the stepped grid and min ≤ max for both axes.
 */
export function validatePowerRangeBounds(b: PowerRangeBounds): string | null {
  const entries: [string, number][] = [
    ["sphMin", b.sphMin],
    ["sphMax", b.sphMax],
    ["cylMin", b.cylMin],
    ["cylMax", b.cylMax],
  ];
  for (const [label, value] of entries) {
    if (!isAllowedPowerValue(value)) {
      return `${label} must be a power between ${POWER_OPTION_MIN} and +${POWER_OPTION_MAX} on the allowed step grid.`;
    }
  }
  if (b.sphMin > b.sphMax) return "sphMin must be less than or equal to sphMax.";
  if (b.cylMin > b.cylMax) return "cylMin must be less than or equal to cylMax.";
  return null;
}
