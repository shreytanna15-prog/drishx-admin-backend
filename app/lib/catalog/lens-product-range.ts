/** Inclusive 0.25 stepped values from min→max (normalized to 2 decimals). */
export function steppedRange(min: number, max: number, step = 0.25): number[] {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const out: number[] = [];
  const start = Math.round(lo / step) * step;
  for (let v = start; v <= hi + 1e-9; v += step) {
    out.push(Number(v.toFixed(2)));
  }
  if (out.length === 0) out.push(Number(lo.toFixed(2)));
  return out;
}
