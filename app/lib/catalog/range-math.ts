/**
 * RW-09 catalog range math.
 *
 * Option 1B (new products): a range expands to exact-power leaves — one DB row
 * per sellable SPH×CYL cell with sphStartRange=sph and cylStartRange=cyl so
 * stock-matrix / RW-08 treat each cell as an independent SKU.
 *
 * Legacy bands (how-to-add-lens-data.md): one row with sphStartRange…sph covering
 * many selectable powers sharing one quantity — preserved via backfill as
 * CatalogLeafStorage.LEGACY_BAND, never auto-split.
 */

import { POWER_STEP, generatePowerOptions } from "../lens-power-range";

export { POWER_STEP, generatePowerOptions };

const EPS = 1e-9;

export type AxisBounds = {
  start: number;
  end: number;
};

export type SphCylRangeBounds = {
  sph: AxisBounds;
  cyl: AxisBounds | null;
};

export type CatalogRangeSpec = SphCylRangeBounds & {
  add?: number | null;
  axis?: number | null;
  eye?: string | null;
};

export type PowerCell = {
  sph: number;
  cyl: number | null;
};

function roundQuarter(value: number): number {
  return Math.round(value / POWER_STEP) * POWER_STEP;
}

export function normalizeAxisBounds(start: number, end: number): AxisBounds {
  return {
    start: roundQuarter(start),
    end: roundQuarter(end),
  };
}

/** Inclusive 0.25-step options for one axis (uses shop generatePowerOptions). */
export function axisPowerOptions(bounds: AxisBounds): number[] {
  return generatePowerOptions(bounds.start, bounds.end);
}

function isCompoundMeaningful(range: SphCylRangeBounds): boolean {
  if (!range.cyl) return false;
  const sphMeaningful =
    Math.abs(range.sph.end) > EPS || Math.abs(range.sph.start) > EPS;
  const cylMeaningful =
    Math.abs(range.cyl.end) > EPS || Math.abs(range.cyl.start) > EPS;
  return sphMeaningful && cylMeaningful;
}

/**
 * Enumerate sellable SPH×CYL cells for a range (same rules as countMatrixPowers).
 * Compound ranges exclude plano (0) on either axis to match applyCompoundNoPlano.
 */
export function enumeratePowerCells(range: SphCylRangeBounds): PowerCell[] {
  let sphOpts = axisPowerOptions(range.sph);
  if (!range.cyl) {
    return sphOpts.map((sph) => ({ sph, cyl: null }));
  }
  let cylOpts = axisPowerOptions(range.cyl);
  if (isCompoundMeaningful(range)) {
    const sphFiltered = sphOpts.filter((v) => Math.abs(v) > EPS);
    const cylFiltered = cylOpts.filter((v) => Math.abs(v) > EPS);
    if (sphFiltered.length > 0) sphOpts = sphFiltered;
    if (cylFiltered.length > 0) cylOpts = cylFiltered;
  }
  const cells: PowerCell[] = [];
  for (const sph of sphOpts) {
    for (const cyl of cylOpts) {
      cells.push({ sph, cyl });
    }
  }
  return cells;
}

export function countMatrixPowers(range: SphCylRangeBounds): number {
  return enumeratePowerCells(range).length;
}

/** Display label like `-6×2` or `+4×2` from absolute magnitude of ends. */
export function formatRangeLabel(range: SphCylRangeBounds): string {
  const sphMag = Math.abs(range.sph.end);
  const sphSign = range.sph.end < -EPS ? "-" : range.sph.end > EPS ? "+" : "";
  const sphPart = `${sphSign}${trimNum(sphMag)}`;
  if (!range.cyl) {
    return sphPart;
  }
  const cylMag = Math.abs(range.cyl.end);
  return `${sphPart}×${trimNum(cylMag)}`;
}

function trimNum(n: number): string {
  const r = roundQuarter(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
}

export function axesOverlap(a: AxisBounds, b: AxisBounds): boolean {
  const aLow = Math.min(a.start, a.end);
  const aHigh = Math.max(a.start, a.end);
  const bLow = Math.min(b.start, b.end);
  const bHigh = Math.max(b.start, b.end);
  return aLow <= bHigh + EPS && bLow <= aHigh + EPS;
}

export function rangesOverlap(a: SphCylRangeBounds, b: SphCylRangeBounds): boolean {
  if (!axesOverlap(a.sph, b.sph)) return false;
  const aCyl = a.cyl ?? { start: 0, end: 0 };
  const bCyl = b.cyl ?? { start: 0, end: 0 };
  return axesOverlap(aCyl, bCyl);
}

/**
 * True when an exact power cell falls inside a band/range coverage
 * (shared boundary counts). Used for legacy vs new conflict checks.
 */
export function cellOverlapsRange(
  cell: PowerCell,
  range: SphCylRangeBounds
): boolean {
  const cellBounds: SphCylRangeBounds = {
    sph: { start: cell.sph, end: cell.sph },
    cyl:
      cell.cyl == null
        ? null
        : { start: cell.cyl, end: cell.cyl },
  };
  return rangesOverlap(cellBounds, range);
}

export type OverlapSuggestion = {
  conflictingLabel: string;
  message: string;
  suggestedSphStart: number | null;
  suggestedBounds: SphCylRangeBounds | null;
};

export function suggestNonOverlappingBounds(
  requested: SphCylRangeBounds,
  conflicting: SphCylRangeBounds,
  conflictingLabel: string
): OverlapSuggestion {
  const confSphEnd = conflicting.sph.end;
  const confSphStart = conflicting.sph.start;
  const reqSphEnd = requested.sph.end;

  if (confSphEnd < -EPS && reqSphEnd < confSphEnd - EPS) {
    const suggestedSphStart = roundQuarter(confSphEnd - POWER_STEP);
    const suggested: SphCylRangeBounds = {
      sph: normalizeAxisBounds(suggestedSphStart, reqSphEnd),
      cyl: requested.cyl
        ? normalizeAxisBounds(requested.cyl.start, requested.cyl.end)
        : null,
    };
    if (!rangesOverlap(suggested, conflicting)) {
      return {
        conflictingLabel,
        message: `Overlaps existing ${conflictingLabel} (SPH ${confSphStart}…${confSphEnd}). Suggested SPH start: ${suggestedSphStart} (chain after existing end − ${POWER_STEP}).`,
        suggestedSphStart,
        suggestedBounds: suggested,
      };
    }
  }

  const confHigh = Math.max(confSphStart, confSphEnd);
  const suggestedSphStart = roundQuarter(confHigh + POWER_STEP);
  const suggested: SphCylRangeBounds = {
    sph: normalizeAxisBounds(suggestedSphStart, reqSphEnd),
    cyl: requested.cyl
      ? normalizeAxisBounds(requested.cyl.start, requested.cyl.end)
      : null,
  };

  if (
    Math.min(suggested.sph.start, suggested.sph.end) <=
      Math.max(suggested.sph.start, suggested.sph.end) + EPS &&
    !rangesOverlap(suggested, conflicting)
  ) {
    return {
      conflictingLabel,
      message: `Overlaps existing ${conflictingLabel}. Suggested SPH start: ${suggestedSphStart}.`,
      suggestedSphStart,
      suggestedBounds: suggested,
    };
  }

  return {
    conflictingLabel,
    message: `Overlaps existing ${conflictingLabel} (SPH ${confSphStart}…${confSphEnd}). Adjust bounds so SPH×CYL coverage does not intersect.`,
    suggestedSphStart: null,
    suggestedBounds: null,
  };
}

export const MAX_MATRIX_POWERS = 5000;

export function assertRangeSizeAllowed(range: SphCylRangeBounds): void {
  const count = countMatrixPowers(range);
  if (count <= 0) {
    throw new Error("Range produces no selectable powers. Check SPH/CYL bounds.");
  }
  if (count > MAX_MATRIX_POWERS) {
    throw new Error(
      `Range would cover ${count} powers (max ${MAX_MATRIX_POWERS}). Narrow the bounds.`
    );
  }
}

export function buildMatrixPreview(range: SphCylRangeBounds) {
  assertRangeSizeAllowed(range);
  const cells = enumeratePowerCells(range);
  const sphOptions = axisPowerOptions(range.sph);
  return {
    label: formatRangeLabel(range),
    powerCount: cells.length,
    sphOptions,
    cylOptions: range.cyl ? axisPowerOptions(range.cyl) : [],
    sampleCells: cells.slice(0, 12),
  };
}

/** Legacy band field mapping (sph/cyl = ends). Used only for LEGACY_BAND backfill. */
export function toLensBandFields(range: SphCylRangeBounds) {
  return {
    sph: range.sph.end,
    sphStartRange: range.sph.start,
    cyl: range.cyl ? range.cyl.end : null,
    cylStartRange: range.cyl ? range.cyl.start : null,
  };
}

/**
 * Exact-power leaf fields for Option 1B.
 * start = end so stock-matrix labels a single power and qty is independent.
 */
export function toExactPowerLeafFields(cell: PowerCell) {
  return {
    sph: cell.sph,
    sphStartRange: cell.sph,
    cyl: cell.cyl,
    cylStartRange: cell.cyl,
  };
}

/**
 * Infer coverage bounds from an existing lens row (band or exact power).
 * Missing starts default toward 0 (shop convention).
 */
export function lensRowToBounds(row: {
  sph: number | null;
  sphStartRange?: number | null;
  cyl: number | null;
  cylStartRange?: number | null;
  crossPower?: number | null;
}): SphCylRangeBounds | null {
  if (row.crossPower != null && Number.isFinite(row.crossPower)) {
    // Cross SKUs are not SPH×CYL band ranges for overlap with compound generates.
    return null;
  }
  if (row.sph == null || !Number.isFinite(row.sph)) {
    return null;
  }
  const sphEnd = roundQuarter(row.sph);
  const sphStart =
    row.sphStartRange != null && Number.isFinite(row.sphStartRange)
      ? roundQuarter(row.sphStartRange)
      : 0;
  const cylEnd =
    row.cyl != null && Number.isFinite(row.cyl) ? roundQuarter(row.cyl) : null;
  const cylStart =
    cylEnd == null
      ? null
      : row.cylStartRange != null && Number.isFinite(row.cylStartRange)
        ? roundQuarter(row.cylStartRange)
        : 0;
  return {
    sph: normalizeAxisBounds(sphStart, sphEnd),
    cyl:
      cylEnd == null || cylStart == null
        ? null
        : normalizeAxisBounds(cylStart, cylEnd),
  };
}
