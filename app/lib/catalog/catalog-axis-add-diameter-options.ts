/**
 * Select universes for Axis / Addition / Diameter attribute masters.
 */

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].toSorted((a, b) => a - b);
}

/** 10…180 step 10, plus 45 and 135 (never negative). */
export const AXIS_SELECT_VALUES: number[] = uniqueSorted([
  ...Array.from({ length: 18 }, (_, i) => (i + 1) * 10),
  45,
  135,
]);

/** 0, then 0.25…6.00 step 0.25. */
export const ADDITION_SELECT_VALUES: number[] = (() => {
  const out: number[] = [0];
  for (let v = 0.25; v <= 6 + 1e-9; v += 0.25) {
    out.push(Number(v.toFixed(2)));
  }
  return out;
})();

/** 55…120 step 5 (mm). */
export const DIAMETER_SELECT_VALUES: number[] = Array.from(
  { length: Math.floor((120 - 55) / 5) + 1 },
  (_, i) => 55 + i * 5
);

export function formatAxisLabel(value: number): string {
  return String(Math.trunc(value));
}

export function formatAdditionLabel(value: number): string {
  const n = Number(value.toFixed(2));
  if (n === 0) return "0.00";
  const body = Math.abs(n).toFixed(2);
  return n > 0 ? `+${body}` : `-${body}`;
}

export function formatDiameterLabel(value: number): string {
  return `${Math.trunc(value)}mm`;
}

export function axisCodeFromValue(value: number): string {
  return `A${Math.trunc(value)}`;
}

export function additionCodeFromValue(value: number): string {
  const n = Number(value.toFixed(2));
  if (n === 0) return "ADD_0";
  const body = Math.abs(n).toFixed(2).replace(".", "P");
  return n > 0 ? `ADD_${body}` : `ADD_M${body}`;
}

export function diameterCodeFromValue(value: number): string {
  return `D${Math.trunc(value)}`;
}

export function isAllowedAxisValue(value: number): boolean {
  return (
    Number.isFinite(value) &&
    AXIS_SELECT_VALUES.includes(Math.trunc(value)) &&
    Math.trunc(value) === value
  );
}

export function isAllowedAdditionValue(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const n = Number(value.toFixed(2));
  return ADDITION_SELECT_VALUES.some((v) => Math.abs(v - n) < 1e-9);
}

export function isAllowedDiameterValue(value: number): boolean {
  return (
    Number.isFinite(value) &&
    DIAMETER_SELECT_VALUES.includes(Math.trunc(value)) &&
    Math.trunc(value) === value
  );
}

export function getAxisSelectOptions() {
  return AXIS_SELECT_VALUES.map((value) => ({
    value: String(value),
    label: formatAxisLabel(value),
  }));
}

export function getAdditionSelectOptions() {
  return ADDITION_SELECT_VALUES.map((value) => ({
    value: String(value),
    label: formatAdditionLabel(value),
  }));
}

export function getDiameterSelectOptions() {
  return DIAMETER_SELECT_VALUES.map((value) => ({
    value: String(value),
    label: formatDiameterLabel(value),
  }));
}
