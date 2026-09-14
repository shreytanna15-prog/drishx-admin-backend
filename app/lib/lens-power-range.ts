import {
  computeCrossCylOptions,
  computeCrossSphOptions,
  CROSS_MIN_GAP,
  hasCrossPower,
  resolveCrossPowerMeta,
  type CrossPowerRangeMeta,
} from "./cross-product";

/** Prescription power step (diopters). */
export const POWER_STEP = 0.25;

export type PowerAxisRange = {
  min: number;
  max: number;
  options: number[];
};

export type SelectableRange = {
  sph: PowerAxisRange;
  cyl: PowerAxisRange | null;
  crossPower?: CrossPowerRangeMeta | null;
};

/** Minimum fields shared by Single Vision, Kryptok, and Progressive range logic. */
export type PowerRangeLens = {
  id: string;
  sph: unknown;
  sphStartRange?: unknown | null;
  cyl: unknown | null;
  cylStartRange?: unknown | null;
  crossPower?: unknown | null;
  price: unknown;
};

export type SingleVisionPowerLens = PowerRangeLens & {
  category: string | null;
  brand: string;
  item: string | null;
  index: unknown;
  coating: string;
};

function toNumber(value: unknown): number {
  return Number(value);
}

function roundQuarter(value: number): number {
  return Math.round(value / POWER_STEP) * POWER_STEP;
}

function productKey(lens: SingleVisionPowerLens): string {
  return [
    lens.category ?? "",
    lens.brand,
    lens.item ?? "",
    roundQuarter(toNumber(lens.index)),
    lens.coating,
  ].join("|");
}

function resolveAxisStart(value: unknown | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return roundQuarter(toNumber(value));
}

function resolveAxisEnd(value: unknown | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return roundQuarter(toNumber(value));
}

/**
 * Build scroll options between two bounds (0.25 steps).
 * Negative ranges: high → low (e.g. 0, -0.25, …, -6).
 * Positive ranges: low → high (e.g. +2, +2.25, …, +6).
 */
export function generatePowerOptions(from: number, to: number): number[] {
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

function computeBoundsForLens(lens: PowerRangeLens): {
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  hasCyl: boolean;
} {
  if (hasCrossPower(lens)) {
    const meta = resolveCrossPowerMeta(lens);
    if (!meta) {
      return { sphMin: 0, sphMax: 0, cylMin: 0, cylMax: 0, hasCyl: false };
    }
    const cylOptions = computeCrossCylOptions(meta.maxCyl, meta.cylStartRange);
    const sphOptions = computeCrossSphOptions(meta.maxCyl);
    return {
      sphMin: sphOptions[0] ?? 0,
      sphMax: sphOptions[sphOptions.length - 1] ?? 0,
      cylMin: cylOptions[cylOptions.length - 1] ?? meta.maxCyl,
      cylMax: cylOptions[0] ?? -CROSS_MIN_GAP,
      hasCyl: cylOptions.length > 0,
    };
  }

  const sphMax = resolveAxisEnd(lens.sph) ?? 0;
  const sphMin = resolveAxisStart(lens.sphStartRange);
  const cylEnd = resolveAxisEnd(lens.cyl);
  const hasCyl = cylEnd !== null;
  const cylMax = hasCyl ? cylEnd! : 0;
  const cylMin = hasCyl ? resolveAxisStart(lens.cylStartRange) : 0;

  return { sphMin, sphMax, cylMin, cylMax, hasCyl };
}

function hasMeaningfulPower(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  return Math.abs(toNumber(value)) > 1e-9;
}

function isCompoundPowerLens(lens: PowerRangeLens): boolean {
  return hasMeaningfulPower(lens.sph) && lens.cyl !== null && lens.cyl !== undefined && hasMeaningfulPower(lens.cyl);
}

function dropPlanoFromOptions(options: number[]): number[] {
  const filtered = options.filter((value) => Math.abs(value) > 1e-9);
  return filtered.length > 0 ? filtered : options;
}

function stripPlanoFromAxis(axis: PowerAxisRange): PowerAxisRange {
  const options = dropPlanoFromOptions(axis.options);
  if (options.length === 0) {
    return axis;
  }
  return {
    min: options[0]!,
    max: options[options.length - 1]!,
    options,
  };
}

/** Compound cards (both SPH and CYL) cannot select 0.00 on either axis. */
export function applyCompoundNoPlano(
  lens: PowerRangeLens,
  range: SelectableRange
): SelectableRange {
  if (!isCompoundPowerLens(lens)) {
    return range;
  }

  return {
    sph: stripPlanoFromAxis(range.sph),
    cyl: range.cyl ? stripPlanoFromAxis(range.cyl) : null,
  };
}

/** @deprecated Use applyCompoundNoPlano */
export const applyKryptokCompoundNoPlano = applyCompoundNoPlano;

export function computeSelectableRange(
  lens: PowerRangeLens,
  _productLenses: PowerRangeLens[]
): SelectableRange {
  if (hasCrossPower(lens)) {
    const meta = resolveCrossPowerMeta(lens);
    if (!meta) {
      return { sph: { min: 0, max: 0, options: [0] }, cyl: null, crossPower: null };
    }

    const cylOptions = computeCrossCylOptions(meta.maxCyl, meta.cylStartRange);
    const sphOptions = computeCrossSphOptions(meta.maxCyl);

    return {
      sph: {
        min: sphOptions[0] ?? 0,
        max: sphOptions[sphOptions.length - 1] ?? 0,
        options: sphOptions,
      },
      cyl: cylOptions.length
        ? {
            min: cylOptions[cylOptions.length - 1]!,
            max: cylOptions[0]!,
            options: cylOptions,
          }
        : null,
      crossPower: meta,
    };
  }

  const bounds = computeBoundsForLens(lens);
  const sph: PowerAxisRange = {
    min: bounds.sphMin,
    max: bounds.sphMax,
    options: generatePowerOptions(bounds.sphMin, bounds.sphMax),
  };

  if (!bounds.hasCyl) {
    return { sph, cyl: null };
  }

  const cyl: PowerAxisRange = {
    min: bounds.cylMin,
    max: bounds.cylMax,
    options: generatePowerOptions(bounds.cylMin, bounds.cylMax),
  };

  return { sph, cyl };
}

export function computeKryptokSelectableRange(
  lens: PowerRangeLens,
  productLenses: PowerRangeLens[]
): SelectableRange {
  return applyCompoundNoPlano(lens, computeSelectableRange(lens, productLenses));
}

export function computeProgressiveSelectableRange(
  lens: PowerRangeLens,
  productLenses: PowerRangeLens[]
): SelectableRange {
  return applyCompoundNoPlano(lens, computeSelectableRange(lens, productLenses));
}

export function computeSelectableRangesForLenses(
  lenses: SingleVisionPowerLens[]
): Map<string, SelectableRange> {
  return computeSelectableRangesForLensGroups(lenses, productKey);
}

export function computeSelectableRangesForLensGroups<T extends PowerRangeLens>(
  lenses: T[],
  groupKey: (lens: T) => string
): Map<string, SelectableRange> {
  const byProduct = new Map<string, T[]>();

  for (const lens of lenses) {
    const key = groupKey(lens);
    const group = byProduct.get(key) ?? [];
    group.push(lens);
    byProduct.set(key, group);
  }

  const result = new Map<string, SelectableRange>();

  for (const group of byProduct.values()) {
    for (const lens of group) {
      result.set(lens.id, computeSelectableRange(lens, group));
    }
  }

  return result;
}

export function kryptokProductKey(lens: {
  category: string | null;
  brand: string | null;
  coating: string | null;
}): string {
  return [lens.category ?? "", lens.brand ?? "", lens.coating ?? ""].join("|");
}

export function progressiveProductKey(lens: {
  category: string | null;
  brand: string;
  item: string;
  index: unknown;
  type: string;
  coating: string;
}): string {
  return [
    lens.category ?? "",
    lens.brand,
    lens.item,
    roundQuarter(toNumber(lens.index)),
    lens.type,
    lens.coating,
  ].join("|");
}

export function productKeyFromLens(lens: SingleVisionPowerLens): string {
  return productKey(lens);
}
