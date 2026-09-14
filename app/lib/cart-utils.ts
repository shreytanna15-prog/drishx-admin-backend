export function parseNumericInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed === "+" || trimmed === ".") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatPowerLabel(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return "0.00";
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(2)}`;
}
