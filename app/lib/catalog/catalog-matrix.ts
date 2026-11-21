/**
 * Family-aware catalog power matrix — pure, client-safe.
 *
 * Mirrors the client Excel sheets: each sheet/block is its own table with
 * explicit stub columns (SPH / CYL / Axis) and data columns (ADD, or RE/LE ×
 * ADD for progressive). Sheets are stacked, never tabbed.
 *
 * Cells are presence-only for stock placeholders (_ / _ / _). Stable cellKey
 * matches the future LensProductPower identity.
 */

import { isAllowedCrossCombo } from "../cross-power";
import { isAllowedCompoundCombo } from "../wholesale-powers";
import { steppedRange } from "./lens-product-range";

const POWER_EPS = 1e-9;
const POWER_STEP = 0.25;

export type CatalogMatrixSheetKind =
  | "sph-cyl"
  | "sphere"
  | "cyl-axis"
  | "compound"
  | "cross";

export type CatalogMatrixPowerShape =
  | "sphere"
  | "cyl-axis"
  | "compound";

export type CatalogMatrixCellKey = {
  sph: number;
  cyl: number;
  add: number | null;
  axis: number | null;
  eye: string | null;
};

export type CatalogMatrixVariantInput = {
  id: string;
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  axis: number | null;
  eye: string | null;
  /** ADD value from addition master; null if family/variant has none. */
  add: number | null;
};

export type CatalogMatrixFamilyCaps = {
  supportsAdd: boolean;
  supportsAxis: boolean;
  supportsEye: boolean;
};

export type CatalogMatrixStubKey = "sph" | "cyl" | "axis";

export type CatalogMatrixStubColumn = {
  key: CatalogMatrixStubKey;
  label: string;
};

export type CatalogMatrixDataColumn = {
  key: string;
  label: string;
  add: number | null;
  eye: string | null;
  /** Present only on SV sheets, where the data axis is CYL. */
  cyl?: number | null;
};

export type CatalogMatrixCell = {
  present: boolean;
  /**
   * Optical combo allowed on this sheet. Cross Style B keeps the full
   * +SPH/−CYL rectangle but sets `allowed: false` when the gap rule fails
   * (`|CYL| − SPH ≥ 0.25`) — UI must not offer an editable triad there.
   */
  allowed: boolean;
  variantId: string | null;
  cellKey: CatalogMatrixCellKey;
};

export type CatalogMatrixRow = {
  key: string;
  /** Stub values keyed by stub column. */
  stub: Partial<Record<CatalogMatrixStubKey, string>>;
  /** Data cells keyed by data column key. */
  cells: Record<string, CatalogMatrixCell>;
};

export type CatalogMatrixSheet = {
  kind: CatalogMatrixSheetKind;
  key: string;
  title: string;
  subtitle: string;
  /** Left, frozen columns: only dimensions that exist for this sheet. */
  stubColumns: CatalogMatrixStubColumn[];
  /** What the right-hand columns represent. */
  dataAxis: "cyl" | "add";
  dataColumns: CatalogMatrixDataColumn[];
  rows: CatalogMatrixRow[];
  /** cells[rowKey][dataColumnKey] — convenience mirror of row.cells. */
  cells: Record<string, Record<string, CatalogMatrixCell>>;
};

export type CatalogMatrixModel = {
  sheets: CatalogMatrixSheet[];
};

export type BuildCatalogMatrixOptions = {
  /** Family code/name used in sheet titles (e.g. KRYPTOK). */
  familyLabel?: string | null;
};

function roundQuarter(value: number): number {
  return Math.round(value / POWER_STEP) * POWER_STEP;
}

/** Signed optical power label: +4.25, -2.00, 0.00. */
export function formatMatrixPower(value: number): string {
  const rounded = roundQuarter(value);
  if (Math.abs(rounded) < POWER_EPS) return "0.00";
  const sign = rounded > 0 ? "+" : "-";
  return `${sign}${Math.abs(rounded).toFixed(2)}`;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < POWER_EPS;
}

function isPlano(value: number): boolean {
  return Math.abs(value) < POWER_EPS;
}

/** Cross territory: +SPH with −CYL (gap rule applied on Cross sheet only). */
function isCrossQuadrant(sph: number, cyl: number): boolean {
  return sph > POWER_EPS && cyl < -POWER_EPS;
}

function bandHasNonPlano(min: number, max: number): boolean {
  return !isPlano(min) || !isPlano(max);
}

/**
 * Matrix power order: sign is display only — sort by absolute magnitude
 * ascending (0.25 before 1.00 whether + or −). Same magnitude → signed value.
 */
export function comparePowerMagnitude(a: number, b: number): number {
  const ra = roundQuarter(a);
  const rb = roundQuarter(b);
  const aa = Math.abs(ra);
  const bb = Math.abs(rb);
  if (Math.abs(aa - bb) > POWER_EPS) return aa - bb;
  return ra - rb;
}

/** @deprecated Prefer comparePowerMagnitude for matrix SPH/CYL order. */
export function compareOpticalPowers(a: number, b: number): number {
  return comparePowerMagnitude(a, b);
}

/** 0.25 steps from bounds, ordered by magnitude (sign ignored for ranking). */
function steppedPowersSorted(min: number, max: number): number[] {
  return steppedRange(min, max).toSorted(comparePowerMagnitude);
}

export function classifyVariantPowerShape(
  variant: Pick<
    CatalogMatrixVariantInput,
    "sphMin" | "sphMax" | "cylMin" | "cylMax"
  >
): CatalogMatrixPowerShape {
  const sphActive = bandHasNonPlano(variant.sphMin, variant.sphMax);
  const cylActive = bandHasNonPlano(variant.cylMin, variant.cylMax);
  // Pure sphere, or plano/plano (0.00/0.00) — compound sheets skip plano cells.
  if (!cylActive) return "sphere";
  if (!sphActive && cylActive) return "cyl-axis";
  return "compound";
}

function inInclusiveRange(value: number, min: number, max: number): boolean {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const v = roundQuarter(value);
  return v >= lo - POWER_EPS && v <= hi + POWER_EPS;
}

function normalizeEye(eye: string | null): "RE" | "LE" | "—" {
  if (!eye) return "—";
  const upper = eye.trim().toUpperCase();
  if (upper === "RIGHT" || upper === "RE") return "RE";
  if (upper === "LEFT" || upper === "LE") return "LE";
  return "—";
}

function eyeValueFromLabel(label: string): string | null {
  if (label === "RE") return "RIGHT";
  if (label === "LE") return "LEFT";
  return null;
}

function addLabel(add: number | null): string {
  return add == null ? "—" : formatMatrixPower(add);
}

function uniqueSortedPowers(values: number[]): number[] {
  const map = new Map<string, number>();
  for (const v of values) {
    const r = roundQuarter(v);
    map.set(r.toFixed(2), r);
  }
  return [...map.values()].toSorted(comparePowerMagnitude);
}

function rangeText(min: number, max: number): string {
  return `${formatMatrixPower(Math.min(min, max))} to ${formatMatrixPower(
    Math.max(min, max)
  )}`;
}

function rangeSubtitle(group: {
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
}): string {
  return `SPH ${rangeText(group.sphMin, group.sphMax)} · CYL ${rangeText(
    group.cylMin,
    group.cylMax
  )}`;
}

function rangeKeyOf(v: {
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
}): string {
  return `${v.sphMin}|${v.sphMax}|${v.cylMin}|${v.cylMax}`;
}

function variantCovers(
  variant: CatalogMatrixVariantInput,
  sph: number,
  cyl: number
): boolean {
  return (
    inInclusiveRange(sph, variant.sphMin, variant.sphMax) &&
    inInclusiveRange(cyl, variant.cylMin, variant.cylMax)
  );
}

function variantMatchesColumn(
  variant: CatalogMatrixVariantInput,
  column: CatalogMatrixDataColumn,
  withEye: boolean
): boolean {
  if (column.add == null) {
    if (variant.add != null) return false;
  } else if (variant.add == null || !nearlyEqual(variant.add, column.add)) {
    return false;
  }
  if (withEye && normalizeEye(variant.eye) !== column.eye) {
    return false;
  }
  return true;
}

type AddEntry = { key: string; add: number | null };

function buildAddEntries(
  variants: CatalogMatrixVariantInput[]
): AddEntry[] {
  const seen = new Map<string, number | null>();
  for (const v of variants) {
    const key = v.add == null ? "none" : v.add.toFixed(2);
    if (!seen.has(key)) seen.set(key, v.add);
  }
  return [...seen.entries()]
    .map(([key, add]) => ({ key, add }))
    .sort((a, b) => {
      if (a.add == null && b.add == null) return 0;
      if (a.add == null) return 1;
      if (b.add == null) return -1;
      return a.add - b.add;
    });
}

function buildAddColumns(
  variants: CatalogMatrixVariantInput[],
  withEye: boolean
): CatalogMatrixDataColumn[] {
  const entries = buildAddEntries(variants);

  if (!withEye) {
    return entries.map((entry) => ({
      key: `add:${entry.key}`,
      label: `ADD ${addLabel(entry.add)}`,
      add: entry.add,
      eye: null,
    }));
  }

  const eyes = new Set<string>();
  for (const v of variants) eyes.add(normalizeEye(v.eye));
  const eyeOrder = (["RE", "LE"] as const).filter((e) => eyes.has(e));
  for (const eye of [...eyes].sort()) {
    if (eye !== "RE" && eye !== "LE") eyeOrder.push(eye as "RE" | "LE");
  }

  const columns: CatalogMatrixDataColumn[] = [];
  for (const eye of eyeOrder) {
    for (const entry of entries) {
      columns.push({
        key: `eye:${eye}|add:${entry.key}`,
        label: `${eye} ${addLabel(entry.add)}`,
        add: entry.add,
        eye,
      });
    }
  }
  return columns;
}

type VariantGroup = {
  key: string;
  shape: CatalogMatrixPowerShape;
  axis: number | null;
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  variants: CatalogMatrixVariantInput[];
};

function groupVariants(
  variants: CatalogMatrixVariantInput[]
): VariantGroup[] {
  const groups = new Map<string, VariantGroup>();
  for (const variant of variants) {
    const shape = classifyVariantPowerShape(variant);
    const axis = shape === "sphere" ? null : variant.axis;
    // One sheet per axis — never merge 45° / 135° (or any other axes).
    const axisGroup = axis ?? "none";
    const key = `${shape}|${rangeKeyOf(variant)}|axis:${axisGroup}`;
    const existing = groups.get(key);
    if (existing) {
      existing.variants.push(variant);
      continue;
    }
    groups.set(key, {
      key,
      shape,
      axis,
      sphMin: variant.sphMin,
      sphMax: variant.sphMax,
      cylMin: variant.cylMin,
      cylMax: variant.cylMax,
      variants: [variant],
    });
  }

  const shapeRank: Record<CatalogMatrixPowerShape, number> = {
    sphere: 0,
    "cyl-axis": 1,
    compound: 2,
  };

  return [...groups.values()].sort((a, b) => {
    if (a.shape !== b.shape) return shapeRank[a.shape] - shapeRank[b.shape];
    if (a.shape === "sphere") {
      return (
        Math.min(a.sphMin, a.sphMax) - Math.min(b.sphMin, b.sphMax) ||
        Math.max(a.sphMin, a.sphMax) - Math.max(b.sphMin, b.sphMax)
      );
    }
    // Axis blocks: 180 → 90 (largest first); null axes last.
    const aa = groupAxes(a)[0] ?? -1;
    const bb = groupAxes(b)[0] ?? -1;
    if (aa !== bb) return bb - aa;
    // CYL-first, then SPH (matches compound/cross row order).
    return (
      Math.min(a.cylMin, a.cylMax) - Math.min(b.cylMin, b.cylMax) ||
      Math.min(a.sphMin, a.sphMax) - Math.min(b.sphMin, b.sphMax)
    );
  });
}

function groupAxes(group: VariantGroup): Array<number | null> {
  const axes = [...new Set(group.variants.map((v) => v.axis))];
  return axes.sort((a, b) => (b ?? -1) - (a ?? -1));
}

function groupAxisLabel(group: VariantGroup): string {
  return groupAxes(group).map((axis) => `${axis}°`).join(" / ");
}

function emptyCell(
  cellKey: CatalogMatrixCellKey,
  allowed = true
): CatalogMatrixCell {
  return { present: false, allowed, variantId: null, cellKey };
}

function coveredCell(
  cellKey: CatalogMatrixCellKey,
  variantId: string,
  allowed = true
): CatalogMatrixCell {
  if (!allowed) {
    return emptyCell(cellKey, false);
  }
  return { present: true, allowed: true, variantId, cellKey };
}

/** SV-style SPH rows × CYL columns. */
function buildSphCylSheet(
  group: VariantGroup,
  familyLabel: string | null
): CatalogMatrixSheet {
  const sphValues = steppedPowersSorted(group.sphMin, group.sphMax);
  const cylValues = uniqueSortedPowers(
    group.variants.flatMap((v) => steppedRange(v.cylMin, v.cylMax))
  );
  const dataColumns: CatalogMatrixDataColumn[] = cylValues.map((cyl) => ({
    key: `cyl:${cyl.toFixed(2)}`,
    label: formatMatrixPower(cyl),
    add: null,
    eye: null,
    cyl,
  }));

  const rows: CatalogMatrixRow[] = sphValues.map((sph) => {
    const key = `sph:${sph.toFixed(2)}`;
    const cells: Record<string, CatalogMatrixCell> = {};
    for (const column of dataColumns) {
      const cyl = column.cyl ?? 0;
      const cellKey: CatalogMatrixCellKey = {
        sph,
        cyl,
        add: null,
        axis: null,
        eye: null,
      };
      const variant = group.variants.find((v) =>
        variantCovers(v, sph, cyl)
      );
      // SV single sheet mixes compound + cross quadrants: Style B on +SPH/−CYL.
      const allowed = isCrossQuadrant(sph, cyl)
        ? isAllowedCrossCombo(sph, cyl)
        : true;
      cells[column.key] = variant
        ? coveredCell(cellKey, variant.id, allowed)
        : emptyCell(cellKey, allowed);
    }
    return { key, stub: { sph: formatMatrixPower(sph) }, cells };
  });

  const cells: Record<string, Record<string, CatalogMatrixCell>> = {};
  for (const row of rows) cells[row.key] = row.cells;

  const title = familyLabel ? `${familyLabel} · SPH × CYL` : "SPH × CYL";

  return {
    kind: "sph-cyl",
    key: `sph-cyl|${group.key}`,
    title,
    subtitle: rangeSubtitle(group),
    stubColumns: [{ key: "sph", label: "SPH" }],
    dataAxis: "cyl",
    dataColumns,
    rows,
    cells,
  };
}

/** Sphere: SPH rows, ADD (or RE/LE × ADD) columns. No CYL/Axis columns. */
function buildSphereSheet(
  group: VariantGroup,
  withEye: boolean,
  familyLabel: string | null
): CatalogMatrixSheet {
  const sphValues = steppedPowersSorted(group.sphMin, group.sphMax);
  const dataColumns = buildAddColumns(group.variants, withEye);

  const rows: CatalogMatrixRow[] = sphValues.map((sph) => {
    const key = `sph:${sph.toFixed(2)}`;
    const cells: Record<string, CatalogMatrixCell> = {};
    for (const column of dataColumns) {
      const cellKey: CatalogMatrixCellKey = {
        sph,
        cyl: 0,
        add: column.add,
        axis: null,
        eye: withEye ? eyeValueFromLabel(column.eye ?? "—") : null,
      };
      const variant = group.variants.find(
        (v) =>
          variantCovers(v, sph, 0) &&
          variantMatchesColumn(v, column, withEye)
      );
      cells[column.key] = variant
        ? coveredCell(cellKey, variant.id)
        : emptyCell(cellKey);
    }
    return { key, stub: { sph: formatMatrixPower(sph) }, cells };
  });

  const cells: Record<string, Record<string, CatalogMatrixCell>> = {};
  for (const row of rows) cells[row.key] = row.cells;

  const extreme = group.sphMin < 0 ? group.sphMin : group.sphMax;
  const title = `${familyLabel ?? "Sphere"} : ${formatMatrixPower(
    extreme
  )} SPH`;

  return {
    kind: "sphere",
    key: `sphere|${group.key}`,
    title,
    subtitle: rangeSubtitle(group),
    stubColumns: [{ key: "sph", label: "SPH" }],
    dataAxis: "add",
    dataColumns,
    rows,
    cells,
  };
}

/** CYL + Axis: CYL/Axis stub columns, ADD (or RE/LE × ADD) columns. */
function buildCylAxisSheet(
  group: VariantGroup,
  withEye: boolean,
  familyLabel: string | null
): CatalogMatrixSheet {
  const cylValues = steppedPowersSorted(group.cylMin, group.cylMax);
  const dataColumns = buildAddColumns(group.variants, withEye);
  const axes = groupAxes(group);
  const showAxis = axes.some((axis) => axis != null);

  const stubColumns: CatalogMatrixStubColumn[] = [
    { key: "cyl", label: "CYL" },
  ];
  if (showAxis) stubColumns.push({ key: "axis", label: "Axis" });

  const rows: CatalogMatrixRow[] = axes.flatMap((axis) => cylValues.map((cyl) => {
    const key = `cyl:${cyl.toFixed(2)}|axis:${axis ?? "none"}`;
    const cells: Record<string, CatalogMatrixCell> = {};
    for (const column of dataColumns) {
      const cellKey: CatalogMatrixCellKey = {
        sph: 0,
        cyl,
        add: column.add,
        axis,
        eye: withEye ? eyeValueFromLabel(column.eye ?? "—") : null,
      };
      const variant = group.variants.find(
        (v) =>
          v.axis === axis && variantCovers(v, 0, cyl) &&
          variantMatchesColumn(v, column, withEye)
      );
      cells[column.key] = variant
        ? coveredCell(cellKey, variant.id)
        : emptyCell(cellKey);
    }
    return {
      key,
      stub: {
        cyl: formatMatrixPower(cyl),
        ...(showAxis
          ? { axis: axis == null ? "—" : String(axis) }
          : {}),
      },
      cells,
    };
  }));

  const cells: Record<string, Record<string, CatalogMatrixCell>> = {};
  for (const row of rows) cells[row.key] = row.cells;

  const title = showAxis
    ? `${familyLabel ?? "CYL + Axis"} · Axis ${groupAxisLabel(group)}`
    : `${familyLabel ?? "CYL + Axis"}`;

  return {
    kind: "cyl-axis",
    key: `cyl-axis|${group.key}`,
    title,
    subtitle: rangeSubtitle(group),
    stubColumns,
    dataAxis: "add",
    dataColumns,
    rows,
    cells,
  };
}

function signLabel(points: Array<{ sph: number; cyl: number }>): string {
  if (points.every((p) => p.sph < 0 && p.cyl < 0)) return "--";
  if (points.every((p) => p.sph > 0 && p.cyl > 0)) return "++";
  return "±";
}

function buildCompoundSheet(
  group: VariantGroup,
  withEye: boolean,
  kind: "compound" | "cross",
  familyLabel: string | null
): CatalogMatrixSheet | null {
  const sphValues = steppedPowersSorted(group.sphMin, group.sphMax);
  const cylValues = steppedPowersSorted(group.cylMin, group.cylMax);
  const dataColumns = buildAddColumns(group.variants, withEye);

  // CYL-major row order (outer CYL, inner SPH); both axes magnitude-sorted.
  // Cross Style B: full +SPH/−CYL rectangle; gap-fail → allowed:false.
  // Compound never owns the cross quadrant (valid or gap-fail) — KT/V2 parity with SV.
  const points: Array<{ sph: number; cyl: number; allowed: boolean }> = [];
  for (const cyl of cylValues) {
    for (const sph of sphValues) {
      if (isPlano(sph) || isPlano(cyl)) continue;
      if (kind === "cross") {
        if (!isCrossQuadrant(sph, cyl)) continue;
        points.push({ sph, cyl, allowed: isAllowedCrossCombo(sph, cyl) });
      } else {
        if (isCrossQuadrant(sph, cyl)) continue;
        if (!isAllowedCompoundCombo(sph, cyl)) continue;
        points.push({ sph, cyl, allowed: true });
      }
    }
  }
  if (points.length === 0) return null;
  // Cross sheet with only disabled cells is still useful (shows the X diagonal).
  if (kind === "compound" && !points.some((p) => p.allowed)) return null;

  const axes = groupAxes(group);
  const showAxis = axes.some((axis) => axis != null);
  const stubColumns: CatalogMatrixStubColumn[] = [
    { key: "sph", label: "SPH" },
    { key: "cyl", label: "CYL" },
  ];
  if (showAxis) stubColumns.push({ key: "axis", label: "Axis" });

  const rows: CatalogMatrixRow[] = axes.flatMap((axis) =>
    points.map(({ sph, cyl, allowed }) => {
      const key = `sph:${sph.toFixed(2)}|cyl:${cyl.toFixed(2)}|axis:${
        axis ?? "none"
      }`;
      const cells: Record<string, CatalogMatrixCell> = {};
      for (const column of dataColumns) {
        const cellKey: CatalogMatrixCellKey = {
          sph,
          cyl,
          add: column.add,
          axis,
          eye: withEye ? eyeValueFromLabel(column.eye ?? "—") : null,
        };
        const variant =
          allowed
            ? group.variants.find(
                (v) =>
                  v.axis === axis &&
                  variantCovers(v, sph, cyl) &&
                  variantMatchesColumn(v, column, withEye)
              )
            : undefined;
        cells[column.key] = variant
          ? coveredCell(cellKey, variant.id, allowed)
          : emptyCell(cellKey, allowed);
      }
      return {
        key,
        stub: {
          sph: formatMatrixPower(sph),
          cyl: formatMatrixPower(cyl),
          ...(showAxis
            ? { axis: axis == null ? "—" : String(axis) }
            : {}),
        },
        cells,
      };
    })
  );

  const cells: Record<string, Record<string, CatalogMatrixCell>> = {};
  for (const row of rows) cells[row.key] = row.cells;

  const label = kind === "cross" ? "Cross" : "Compound";
  const sign =
    kind === "cross" ? "" : ` ${signLabel(points.map(({ sph, cyl }) => ({ sph, cyl })))}`;
  const title = showAxis
    ? `${familyLabel ?? label} · ${label}${sign} · Axis ${groupAxisLabel(group)}`
    : `${familyLabel ?? label} · ${label}${sign}`;

  return {
    kind,
    key: `${kind}|${group.key}`,
    title,
    subtitle: rangeSubtitle(group),
    stubColumns,
    dataAxis: "add",
    dataColumns,
    rows,
    cells,
  };
}

/** Map API variants into composer input. */
export function toCatalogMatrixVariants(
  variants: Array<{
    id: string;
    sphMin: number;
    sphMax: number;
    cylMin: number;
    cylMax: number;
    axis: number | null;
    eye: string | null;
    addition?: { value: number | null } | null;
    addMin?: number | null;
  }>
): CatalogMatrixVariantInput[] {
  return variants.map((v) => ({
    id: v.id,
    sphMin: v.sphMin,
    sphMax: v.sphMax,
    cylMin: v.cylMin,
    cylMax: v.cylMax,
    axis: v.axis,
    eye: v.eye,
    add:
      v.addition?.value != null
        ? Number(v.addition.value)
        : v.addMin != null
          ? Number(v.addMin)
          : null,
  }));
}

/**
 * Build family-aware matrix sheets from parent product variants.
 * Every sheet is a separate Excel-like block; the UI stacks them.
 */
export function buildCatalogMatrix(
  variants: CatalogMatrixVariantInput[],
  family: CatalogMatrixFamilyCaps,
  options: BuildCatalogMatrixOptions = {}
): CatalogMatrixModel {
  if (variants.length === 0) {
    return { sheets: [] };
  }

  const familyLabel = options.familyLabel ?? null;

  if (!family.supportsAdd) {
    const groups = groupVariants(variants);
    return {
      sheets: groups.map((group) => buildSphCylSheet(group, familyLabel)),
    };
  }

  const withEye = family.supportsEye;
  const groups = groupVariants(variants);
  const sheets: CatalogMatrixSheet[] = [];

  for (const group of groups) {
    if (group.shape === "sphere") {
      sheets.push(buildSphereSheet(group, withEye, familyLabel));
      continue;
    }
    if (group.shape === "cyl-axis") {
      sheets.push(buildCylAxisSheet(group, withEye, familyLabel));
      continue;
    }
    const compound = buildCompoundSheet(
      group,
      withEye,
      "compound",
      familyLabel
    );
    if (compound) sheets.push(compound);
    const cross = buildCompoundSheet(group, withEye, "cross", familyLabel);
    if (cross) sheets.push(cross);
  }

  const kindRank: Record<CatalogMatrixSheetKind, number> = {
    "sph-cyl": 0,
    sphere: 1,
    "cyl-axis": 2,
    compound: 3,
    cross: 4,
  };
  sheets.sort((a, b) => kindRank[a.kind] - kindRank[b.kind]);

  return { sheets };
}

export function catalogMatrixCellCovers(
  variant: CatalogMatrixVariantInput,
  key: CatalogMatrixCellKey
): boolean {
  if (!inInclusiveRange(key.sph, variant.sphMin, variant.sphMax)) return false;
  if (!inInclusiveRange(key.cyl, variant.cylMin, variant.cylMax)) return false;
  if (key.axis != null || variant.axis != null) {
    if (key.axis !== variant.axis) return false;
  }
  if (key.eye != null || variant.eye != null) {
    if ((key.eye ?? null) !== (variant.eye ?? null)) return false;
  }
  if (key.add != null || variant.add != null) {
    if (
      key.add == null ||
      variant.add == null ||
      !nearlyEqual(key.add, variant.add)
    ) {
      return false;
    }
  }
  return true;
}
