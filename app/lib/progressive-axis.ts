/**
 * Axis values from the progressive wholesale price sheet:
 * - ST.CYL: +cyl → 180°, -cyl → 90° (e.g. ST.CYL+2 180*, -2 90*)
 * - COMP: +sph/+cyl → 180°, -sph/-cyl → 90° (e.g. COMP +2/+1, COMP -2/-1 90*)
 */
export function resolveProgressiveAxis(
  sph: string | null | undefined,
  cyl: string | null | undefined
): number | null {
  if (cyl == null || cyl === "") return null;

  const cylN = Number.parseFloat(cyl);
  if (!Number.isFinite(cylN) || Math.abs(cylN) < 1e-9) return null;

  const sphN = sph != null && sph !== "" ? Number.parseFloat(sph) : 0;
  const hasSph = Number.isFinite(sphN) && Math.abs(sphN) > 1e-9;

  if (!hasSph) {
    return cylN > 0 ? 180 : 90;
  }

  if (sphN > 0 && cylN > 0) return 180;
  if (sphN < 0 && cylN < 0) return 90;
  if (cylN < 0) return 90;
  if (cylN > 0) return 180;

  return null;
}

export function applyProgressiveAxis<
  T extends { sph: string; cyl: string | null; axis: number | null },
>(row: T): T {
  if (row.axis != null) return row;
  const axis = resolveProgressiveAxis(row.sph, row.cyl);
  return axis == null ? row : { ...row, axis };
}
