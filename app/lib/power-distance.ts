/** Shared SPH/CYL distance helpers for catalog search, related lenses, and alternates. */

export type SphCylPower = {
  sph: number;
  cyl: number | null;
};

export function toPowerNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeCylForDistance(cyl: number | null | undefined): number {
  return cyl === null || cyl === undefined ? 0 : cyl;
}

/** Combined diopter distance: |Δsph| + |Δcyl| (null cyl treated as 0). */
export function powerDistance(a: SphCylPower, b: SphCylPower): number {
  return (
    Math.abs(a.sph - b.sph) +
    Math.abs(normalizeCylForDistance(a.cyl) - normalizeCylForDistance(b.cyl))
  );
}

export function isSameSphCylPower(a: SphCylPower, b: SphCylPower): boolean {
  return (
    Math.abs(a.sph - b.sph) < 1e-9 &&
    Math.abs(normalizeCylForDistance(a.cyl) - normalizeCylForDistance(b.cyl)) < 1e-9
  );
}
