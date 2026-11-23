/**
 * RC-03 admin power-range pickers (SPH/CYL bounds).
 *
 * SPH: −40 … +30
 * CYL: −8 … +8
 * Create/edit form step: 0.25 or 0.5 per axis (SPH and CYL each have their own
 * step control; options regenerate independently).
 *
 * Pure module — safe for client and server (no prisma / React).
 */

export const SPH_OPTION_MIN = -40;
export const SPH_OPTION_MAX = 30;
export const CYL_OPTION_MIN = -8;
export const CYL_OPTION_MAX = 8;

/** @deprecated Prefer SPH_OPTION_MIN / CYL_OPTION_MIN. */
export const POWER_OPTION_MIN = SPH_OPTION_MIN;
/** @deprecated Prefer SPH_OPTION_MAX. */
export const POWER_OPTION_MAX = SPH_OPTION_MAX;

export const POWER_STEPS = [0.25, 0.5] as const;
export type PowerStep = (typeof POWER_STEPS)[number];
export type PowerAxis = "sph" | "cyl";

/** Work in quarter-diopter integers to avoid float drift. */
const Q = 4;

/** Round to 2 decimals and normalize −0 → 0. */
export function normalizePowerValue(value: number): number {
  const n = Number(Number(value).toFixed(2));
  return Object.is(n, -0) ? 0 : n;
}

function axisBounds(axis: PowerAxis): { min: number; max: number } {
  return axis === "cyl"
    ? { min: CYL_OPTION_MIN, max: CYL_OPTION_MAX }
    : { min: SPH_OPTION_MIN, max: SPH_OPTION_MAX };
}

/** Inclusive stepped values from min→max at the given step. */
export function buildSteppedPowerValues(
  min: number,
  max: number,
  step: PowerStep
): number[] {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const stepQ = Math.round(step * Q);
  if (stepQ <= 0) return [];
  const startQ = Math.round(lo * Q);
  const endQ = Math.round(hi * Q);
  const out: number[] = [];
  for (let q = startQ; q <= endQ; q += stepQ) {
    out.push(normalizePowerValue(q / Q));
  }
  return out;
}

export function isAllowedPowerStep(step: number): step is PowerStep {
  return POWER_STEPS.some((s) => Math.abs(s - step) < 1e-9);
}

/** True when value sits on the 0.25 grid inside the axis range. */
export function isAllowedPowerValue(
  value: number,
  axis: PowerAxis = "sph"
): boolean {
  if (!Number.isFinite(value)) return false;
  const v = normalizePowerValue(value);
  const { min, max } = axisBounds(axis);
  if (v < min - 1e-9 || v > max + 1e-9) return false;
  const q = Math.round(v * Q);
  return Math.abs(q / Q - v) < 1e-9;
}

/** `-6` → `-6.00`, `2` → `+2.00`, `0` → `0.00`. */
export function formatPowerLabel(value: number): string {
  const v = normalizePowerValue(value);
  if (v === 0) return "0.00";
  return `${v > 0 ? "+" : "-"}${Math.abs(v).toFixed(2)}`;
}

export type PowerSelectOption = { value: string; label: string };

/**
 * Select options for SPH or CYL at the chosen step.
 * Defaults: SPH, step 0.25 (widest catalog list).
 */
export function getPowerSelectOptions(opts?: {
  axis?: PowerAxis;
  step?: PowerStep;
}): PowerSelectOption[] {
  const axis = opts?.axis ?? "sph";
  const step = opts?.step ?? 0.25;
  const { min, max } = axisBounds(axis);
  return buildSteppedPowerValues(min, max, step).map((v) => ({
    value: String(normalizePowerValue(v)),
    label: formatPowerLabel(v),
  }));
}

/** Full SPH list at 0.25 — kept for older call sites that expect a flat array. */
export const POWER_SELECT_VALUES: readonly number[] = Object.freeze(
  buildSteppedPowerValues(SPH_OPTION_MIN, SPH_OPTION_MAX, 0.25)
);

/**
 * Bound with larger absolute value (sign preserved).
 * Used for compact UI/name labels: `{max_SPH}/{max_CYL}`.
 */
export function extremePowerBound(a: number, b: number): number {
  const na = normalizePowerValue(a);
  const nb = normalizePowerValue(b);
  const aa = Math.abs(na);
  const bb = Math.abs(nb);
  if (aa > bb) return na;
  if (bb > aa) return nb;
  if (na === 0) return nb;
  if (nb === 0) return na;
  return na;
}

/**
 * Attribute-page span: values as stored (no min/max sort), e.g. `0.00 to -6.00`.
 */
export function formatPowerRangeSpan(a: number, b: number): string {
  return `${formatPowerLabel(a)} to ${formatPowerLabel(b)}`;
}

/**
 * Compact SPH/CYL label for names + catalog UI (not attribute table, not SKU):
 * e.g. `+4.00/+2.00`, `-6.00/-4.00`.
 */
export function formatPowerRangeCompact(
  sphMin: number,
  sphMax: number,
  cylMin: number,
  cylMax: number
): string {
  return `${formatPowerLabel(extremePowerBound(sphMin, sphMax))}/${formatPowerLabel(extremePowerBound(cylMin, cylMax))}`;
}

/** @deprecated Prefer formatPowerRangeSpan (attrs) or formatPowerRangeCompact (UI/name). */
export function formatPowerRangeLabel(sphMin: number, sphMax: number): string {
  return formatPowerRangeSpan(sphMin, sphMax);
}

/** @deprecated Prefer formatPowerRangeSpan for attribute CYL column. */
export function formatCylSummary(cylMin: number, cylMax: number): string {
  return formatPowerRangeSpan(cylMin, cylMax);
}

export type PowerRangeBounds = {
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
};

/**
 * Returns an error message when bounds are invalid, otherwise `null`.
 * SPH −40…+30, CYL −8…+8, both on the 0.25 grid. Field order is not compared
 * (admin may enter 0.00 then −6.00).
 */
export function validatePowerRangeBounds(b: PowerRangeBounds): string | null {
  const sphEntries: [string, number][] = [
    ["sphMin", b.sphMin],
    ["sphMax", b.sphMax],
  ];
  for (const [label, value] of sphEntries) {
    if (!isAllowedPowerValue(value, "sph")) {
      return `${label} must be a power between ${SPH_OPTION_MIN} and +${SPH_OPTION_MAX} on a 0.25 step.`;
    }
  }
  const cylEntries: [string, number][] = [
    ["cylMin", b.cylMin],
    ["cylMax", b.cylMax],
  ];
  for (const [label, value] of cylEntries) {
    if (!isAllowedPowerValue(value, "cyl")) {
      return `${label} must be a power between ${CYL_OPTION_MIN} and +${CYL_OPTION_MAX} on a 0.25 step.`;
    }
  }
  return null;
}

/** Snap a stored bound onto the selected step grid (nearest, clamped to axis). */
export function snapPowerToStep(
  value: number,
  axis: PowerAxis,
  step: PowerStep
): number {
  const { min, max } = axisBounds(axis);
  const v = normalizePowerValue(value);
  const snapped = normalizePowerValue(Math.round(v / step) * step);
  if (snapped < min) return min;
  if (snapped > max) return max;
  return snapped;
}
