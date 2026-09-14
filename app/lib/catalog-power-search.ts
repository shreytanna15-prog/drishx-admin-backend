import { POWER_STEP, type PowerRangeLens } from "./lens-power-range";
import {
  isSameSphCylPower,
  powerDistance,
  toPowerNumber,
  type SphCylPower,
} from "./power-distance";

/** Max combined |Δsph|+|Δcyl| for nearest catalog power matches. */
export const CATALOG_POWER_MAX_DISTANCE = 0.5;

export type PowerMatchMode = "exact" | "nearest" | "range";

export type PowerMatchMeta = {
  mode: PowerMatchMode;
  querySph: number;
  queryCyl: number | null;
};

export type CatalogPowerScore = {
  distance: number;
  mode: PowerMatchMode;
};

function roundQuarter(value: number): number {
  return Math.round(value / POWER_STEP) * POWER_STEP;
}

function resolveAxisStart(value: unknown | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const n = toPowerNumber(value);
  return n === null ? 0 : roundQuarter(n);
}

function resolveAxisEnd(value: unknown | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const n = toPowerNumber(value);
  return n === null ? null : roundQuarter(n);
}

function valueInAxisRange(target: number, start: number, end: number): boolean {
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  return target >= low - 1e-9 && target <= high + 1e-9;
}

/** True when the lens selectable axis range includes the target SPH/CYL. */
export function powerInSelectableRange(
  lens: PowerRangeLens,
  target: SphCylPower
): boolean {
  const sphEnd = resolveAxisEnd(lens.sph);
  if (sphEnd === null) {
    return false;
  }
  const sphStart = resolveAxisStart(lens.sphStartRange);
  if (!valueInAxisRange(target.sph, sphStart, sphEnd)) {
    return false;
  }

  const cylEnd = resolveAxisEnd(lens.cyl);
  if (target.cyl === null) {
    // Sph-only query: accept sph-only lenses, or compounds whose cyl range includes 0.
    if (cylEnd === null) {
      return true;
    }
    const cylStart = resolveAxisStart(lens.cylStartRange);
    return valueInAxisRange(0, cylStart, cylEnd);
  }

  if (cylEnd === null) {
    // Lens has no cyl; only match when target cyl is effectively plano.
    return Math.abs(target.cyl) < 1e-9;
  }

  const cylStart = resolveAxisStart(lens.cylStartRange);
  return valueInAxisRange(target.cyl, cylStart, cylEnd);
}

function endpointPower(lens: PowerRangeLens): SphCylPower | null {
  const sph = toPowerNumber(lens.sph);
  if (sph === null) {
    return null;
  }
  return { sph, cyl: toPowerNumber(lens.cyl) };
}

/**
 * Score a catalog row against a searched SPH/CYL.
 * Prefer exact endpoint, then range coverage, then nearest within max distance.
 * Returns null when the row should be excluded.
 */
export function scoreCatalogPowerMatch(
  lens: PowerRangeLens,
  target: SphCylPower,
  maxDistance = CATALOG_POWER_MAX_DISTANCE
): CatalogPowerScore | null {
  const endpoint = endpointPower(lens);
  if (endpoint && isSameSphCylPower(endpoint, target)) {
    return { distance: 0, mode: "exact" };
  }

  if (powerInSelectableRange(lens, target)) {
    return { distance: 0, mode: "range" };
  }

  if (!endpoint) {
    return null;
  }

  const distance = powerDistance(endpoint, target);
  if (distance > maxDistance + 1e-9) {
    return null;
  }

  return { distance, mode: "nearest" };
}

/** Rank scored rows: lower distance first; exact before range before nearest at equal distance. */
export function compareCatalogPowerScores(
  a: CatalogPowerScore,
  b: CatalogPowerScore
): number {
  const byDistance = a.distance - b.distance;
  if (Math.abs(byDistance) > 1e-9) {
    return byDistance;
  }
  const order: Record<PowerMatchMode, number> = {
    exact: 0,
    range: 1,
    nearest: 2,
  };
  return order[a.mode] - order[b.mode];
}

export function resolvePowerMatchMeta(
  scores: CatalogPowerScore[],
  target: SphCylPower
): PowerMatchMeta | null {
  if (scores.length === 0) {
    return null;
  }
  const hasExact = scores.some((s) => s.mode === "exact");
  if (hasExact) {
    return { mode: "exact", querySph: target.sph, queryCyl: target.cyl };
  }
  const hasRange = scores.some((s) => s.mode === "range");
  if (hasRange) {
    return { mode: "range", querySph: target.sph, queryCyl: target.cyl };
  }
  return { mode: "nearest", querySph: target.sph, queryCyl: target.cyl };
}

/**
 * Prisma OR filter: endpoint within ±maxDistance on each axis,
 * or axis ranges that can contain the target power.
 */
export function buildNearOrRangePowerWhere(
  target: SphCylPower,
  maxDistance = CATALOG_POWER_MAX_DISTANCE
): Record<string, unknown> {
  const sphLow = target.sph - maxDistance;
  const sphHigh = target.sph + maxDistance;
  const cylTarget = target.cyl ?? 0;
  const cylLow = cylTarget - maxDistance;
  const cylHigh = cylTarget + maxDistance;

  const nearEndpoint: Record<string, unknown> = {
    AND: [
      { sph: { gte: sphLow, lte: sphHigh } },
      target.cyl === null
        ? {
            OR: [
              { cyl: null },
              { cyl: { gte: cylLow, lte: cylHigh } },
            ],
          }
        : {
            OR: [
              { cyl: { gte: cylLow, lte: cylHigh } },
              // Plano-cyl rows when searching near-zero cyl
              ...(Math.abs(cylTarget) <= maxDistance + 1e-9
                ? [{ cyl: null }]
                : []),
            ],
          },
    ],
  };

  const sphRangeCovers: Record<string, unknown>[] = [
    {
      AND: [
        { sphStartRange: { lte: target.sph } },
        { sph: { gte: target.sph } },
      ],
    },
    {
      AND: [{ sph: { lte: target.sph } }, { sphStartRange: { gte: target.sph } }],
    },
    // Default start 0 when sphStartRange is null
    {
      AND: [
        { sphStartRange: null },
        { sph: { gte: Math.min(0, target.sph) } },
        { sph: { lte: Math.max(0, target.sph) } },
      ],
    },
  ];

  const cylRangeCovers: Record<string, unknown>[] =
    target.cyl === null
      ? [
          { cyl: null },
          {
            AND: [
              { cylStartRange: { lte: 0 } },
              { cyl: { gte: 0 } },
            ],
          },
          {
            AND: [{ cyl: { lte: 0 } }, { cylStartRange: { gte: 0 } }],
          },
          {
            AND: [
              { cylStartRange: null },
              { cyl: { gte: Math.min(0, 0) } },
              { cyl: { lte: Math.max(0, 0) } },
            ],
          },
        ]
      : [
          {
            AND: [
              { cylStartRange: { lte: target.cyl } },
              { cyl: { gte: target.cyl } },
            ],
          },
          {
            AND: [
              { cyl: { lte: target.cyl } },
              { cylStartRange: { gte: target.cyl } },
            ],
          },
          {
            AND: [
              { cylStartRange: null },
              { cyl: { gte: Math.min(0, target.cyl) } },
              { cyl: { lte: Math.max(0, target.cyl) } },
            ],
          },
          ...(Math.abs(target.cyl) < 1e-9 ? [{ cyl: null }] : []),
        ];

  const rangeCover: Record<string, unknown> = {
    AND: [{ OR: sphRangeCovers }, { OR: cylRangeCovers }],
  };

  return {
    OR: [nearEndpoint, rangeCover],
  };
}

export function formatPowerQueryLabel(target: SphCylPower): string {
  if (target.cyl === null) {
    return `${formatDiopter(target.sph)}/—`;
  }
  return `${formatDiopter(target.sph)}/${formatDiopter(target.cyl)}`;
}

function formatDiopter(value: number): string {
  if (Math.abs(value) < 1e-9) {
    return "0";
  }
  const fixed = value.toFixed(2);
  return fixed.replace(/0+$/, "").replace(/\.$/, "");
}
