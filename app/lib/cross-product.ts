export const CROSS_MIN_GAP = 0.25;
const POWER_STEP = 0.25;
const POWER_EPS = 1e-9;

function toPower(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundQuarter(value: number): number {
  return Math.round(value / POWER_STEP) * POWER_STEP;
}

function generatePowerOptions(from: number, to: number): number[] {
  const a = roundQuarter(from);
  const b = roundQuarter(to);
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  const options: number[] = [];

  const isNegativeRange = high <= 0 || (low < 0 && high > 0);

  if (isNegativeRange) {
    let current = high;
    while (current >= low - POWER_STEP / 2) {
      options.push(roundQuarter(current));
      if (current <= low + POWER_STEP / 2) {
        break;
      }
      current = roundQuarter(current - POWER_STEP);
    }
    return options;
  }

  let current = low;
  while (current <= high + POWER_STEP / 2) {
    options.push(roundQuarter(current));
    if (current >= high - POWER_STEP / 2) {
      break;
    }
    current = roundQuarter(current + POWER_STEP);
  }
  return options;
}

/** True when the shop search term is the cross-product keyword only. */
export function isCrossProductSearchTerm(raw: string): boolean {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized === "cross";
}

function deriveCrossPowerFromPrescription(item: {
  sph?: unknown | null;
  cyl?: unknown | null;
}): number | null {
  const sph = toPower(item.sph);
  const cyl = toPower(item.cyl);
  if (sph === null || cyl === null) {
    return null;
  }

  const roundedSph = roundQuarter(sph);
  const roundedCyl = roundQuarter(cyl);
  if (
    roundedSph < CROSS_MIN_GAP - POWER_EPS ||
    roundedCyl >= -POWER_EPS ||
    Math.abs(roundedCyl) - roundedSph < CROSS_MIN_GAP - POWER_EPS
  ) {
    return null;
  }

  return roundedCyl;
}

/** Catalog cross rows — explicit `crossPower`, or legacy rows that match the same cross pattern. */
export function hasCrossPower(item: {
  crossPower?: unknown | null;
  sph?: unknown | null;
  cyl?: unknown | null;
}): boolean {
  const crossPower = toPower(item.crossPower);
  if (crossPower !== null && Math.abs(crossPower) > POWER_EPS) {
    return true;
  }
  return deriveCrossPowerFromPrescription(item) !== null;
}

export type CrossPowerRangeMeta = {
  maxCyl: number;
  cylStartRange?: number | null;
};

function resolveCylStartRange(value: unknown | null | undefined): number | null {
  const parsed = toPower(value);
  if (parsed === null || parsed >= -POWER_EPS) {
    return null;
  }
  return roundQuarter(parsed);
}

function resolveCrossCylCatalogUpper(cylStartRange?: number | null): number {
  const start = resolveCylStartRange(cylStartRange);
  return start ?? -CROSS_MIN_GAP;
}

function resolveCrossCylUpperForSph(
  sph: number,
  cylStartRange?: number | null
): number {
  const roundedSph = roundQuarter(sph);
  const sphUpper = roundQuarter(-(roundedSph + CROSS_MIN_GAP));
  const start = resolveCylStartRange(cylStartRange);
  if (start === null) {
    return sphUpper;
  }
  return Math.min(sphUpper, start);
}

/** CYL scroll options for cross products, from cylStartRange (or −0.25) → max CYL. */
export function computeCrossCylOptions(
  maxCyl: number,
  cylStartRange?: number | null
): number[] {
  const cylMax = roundQuarter(maxCyl);
  if (cylMax >= -POWER_EPS) {
    return [];
  }
  const cylUpper = resolveCrossCylCatalogUpper(cylStartRange);
  if (cylUpper < cylMax - POWER_EPS) {
    return [];
  }
  return generatePowerOptions(cylUpper, cylMax);
}

/**
 * Cross products always use positive SPH.
 * Rule: SPH from +0.25 up to (|CYL| − 0.25), e.g. CYL −2 → +0.25 … +1.75.
 */
export function computeCrossSphOptions(selectedCyl: number): number[] {
  const cyl = roundQuarter(selectedCyl);
  if (cyl >= -POWER_EPS) {
    return [];
  }

  const sphMax = roundQuarter(Math.abs(cyl) - CROSS_MIN_GAP);
  if (sphMax < CROSS_MIN_GAP - POWER_EPS) {
    return [];
  }
  return generatePowerOptions(CROSS_MIN_GAP, sphMax);
}

export function resolveCrossPowerMeta(item: {
  crossPower?: unknown | null;
  sph?: unknown | null;
  cyl?: unknown | null;
  cylStartRange?: unknown | null;
}): CrossPowerRangeMeta | null {
  const maxCyl = toPower(item.crossPower) ?? deriveCrossPowerFromPrescription(item);
  if (maxCyl === null || Math.abs(maxCyl) <= POWER_EPS) {
    return null;
  }
  return {
    maxCyl: roundQuarter(maxCyl),
    cylStartRange: resolveCylStartRange(item.cylStartRange),
  };
}

export function isAllowedCrossCombo(sph: number, cyl: number): boolean {
  const roundedSph = roundQuarter(sph);
  const roundedCyl = roundQuarter(cyl);
  const options = computeCrossSphOptions(roundedCyl);
  return options.some((value) => Math.abs(value - roundedSph) < POWER_EPS);
}

/**
 * Compound prescription pattern used for backfill / metadata (not shop "cross" search).
 * Positive SPH where CYL exceeds SPH by at least 0.25 (|CYL| − SPH for negative CYL).
 */
export function matchesCrossProduct(item: {
  sph?: unknown | null;
  cyl?: unknown | null;
  crossPower?: unknown | null;
}): boolean {
  if (hasCrossPower(item)) {
    return true;
  }

  const sph = toPower(item.sph);
  const cyl = toPower(item.cyl);
  if (sph === null || cyl === null || sph <= POWER_EPS) {
    return false;
  }

  const gap = cyl >= 0 ? cyl - sph : Math.abs(cyl) - sph;
  return gap >= CROSS_MIN_GAP - POWER_EPS;
}
