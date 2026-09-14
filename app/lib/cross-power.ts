const CROSS_MIN_GAP = 0.25;
const POWER_STEP = 0.25;
const POWER_EPS = 1e-9;

function roundQuarter(value: number): number {
  return Math.round(value / POWER_STEP) * POWER_STEP;
}

function toPower(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveCylStartRange(value: unknown | null | undefined): number | null {
  const parsed = toPower(value);
  if (parsed === null || parsed >= -POWER_EPS) {
    return null;
  }
  return roundQuarter(parsed);
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

export function isAllowedCrossCombo(
  sph: number,
  cyl: number,
  cylStartRange?: number | null
): boolean {
  const roundedSph = roundQuarter(sph);
  const roundedCyl = roundQuarter(cyl);
  if (roundedSph < CROSS_MIN_GAP - POWER_EPS) {
    return false;
  }
  if (roundedCyl >= -POWER_EPS) {
    return false;
  }

  const start = resolveCylStartRange(cylStartRange);
  if (start !== null && roundedCyl > start + POWER_EPS) {
    return false;
  }

  return Math.abs(roundedCyl) - roundedSph >= CROSS_MIN_GAP - POWER_EPS;
}

export function resolveCrossPowerMeta(item: {
  crossPower?: unknown | null;
  sph?: unknown | null;
  cyl?: unknown | null;
  cylStartRange?: unknown | null;
  selectableRange?: {
    crossPower?: { maxCyl: number; cylStartRange?: number | null } | null;
  } | null;
}): { maxCyl: number; cylStartRange?: number | null } | null {
  if (item.selectableRange?.crossPower) {
    return item.selectableRange.crossPower;
  }

  const parsed = toPower(item.crossPower) ?? deriveCrossPowerFromPrescription(item);
  if (parsed === null || !Number.isFinite(parsed) || Math.abs(parsed) <= POWER_EPS) {
    return null;
  }

  return {
    maxCyl: roundQuarter(parsed),
    cylStartRange: resolveCylStartRange(item.cylStartRange),
  };
}
