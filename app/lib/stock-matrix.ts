/**
 * Power-wise stock matrix (RW-08 Phase C) — pure, client-safe.
 *
 * Identity: one cell = one catalog leaf (`lensType` + `lensId`). Today a leaf
 * is a power BAND (sphStartRange…sph × cylStartRange…cyl, see
 * docs/how-to-add-lens-data.md); when a leaf covers a single power (start =
 * end) the band label is just that power, so the same grid becomes a true
 * per-power SPH × CYL matrix once the catalog generates single-power leaves.
 *
 * Current stock is display-only here. Only threshold (minStock) and target
 * (targetStock) are editable, and they persist to ReorderRule.
 */

export const POWER_STEP = 0.25;

export type MatrixRule = {
  id: string;
  minStock: number;
  targetStock: number;
  autoProcure: boolean;
  isActive: boolean;
  updatedAt: string;
};

export type MatrixLensRow = {
  lensId: string;
  sph: number | null;
  sphStartRange: number | null;
  cyl: number | null;
  cylStartRange: number | null;
  crossPower: number | null;
  add: number | null;
  axis: number | null;
  eye: string | null;
  onHand: number;
  reserved: number;
  /** Outstanding qty on approved, not-closed POs. */
  onOrder: number;
  openPurchaseOrder: { id: string; publicId: string } | null;
  rule: MatrixRule | null;
};

export type PowerBand = {
  key: string;
  label: string;
  start: number | null;
  end: number | null;
};

export type CellState =
  | "NO_RULE"
  | "INACTIVE"
  | "BELOW_THRESHOLD"
  | "OK";

export type MatrixCell = MatrixLensRow & {
  available: number;
  state: CellState;
  powerLabel: string;
};

export type MatrixSection = {
  key: string;
  label: string | null;
  sphBands: PowerBand[];
  cylBands: PowerBand[];
  cells: Record<string, MatrixCell[]>;
};

export type ProductMatrix = {
  sections: MatrixSection[];
  totals: {
    leaves: number;
    onHand: number;
    withRule: number;
    belowThreshold: number;
    /** Grid positions holding more than one leaf (data overlap to review). */
    overlappingCells: number;
  };
};

function roundQuarter(value: number): number {
  return Math.round(value / POWER_STEP) * POWER_STEP;
}

/** Signed optical power label: +4.25, -2.00, 0.00. */
export function formatPower(value: number): string {
  const rounded = roundQuarter(value);
  if (Math.abs(rounded) < 1e-9) return "0.00";
  const sign = rounded > 0 ? "+" : "-";
  return `${sign}${Math.abs(rounded).toFixed(2)}`;
}

/**
 * Band for one axis. `start` null means the band starts at plano (0), matching
 * the catalog convention used by power selection.
 */
export function axisBand(
  start: number | null,
  end: number | null,
  prefix: string
): PowerBand {
  if (end === null) {
    return { key: `${prefix}:none`, label: "—", start: null, end: null };
  }
  const e = roundQuarter(end);
  const s = start === null ? 0 : roundQuarter(start);
  const key = `${prefix}:${s.toFixed(2)}:${e.toFixed(2)}`;
  const label = Math.abs(s - e) < 1e-9 ? formatPower(e) : `${formatPower(s)} to ${formatPower(e)}`;
  return { key, label, start: s, end: e };
}

/**
 * Optical ordering: plano/minus bands first, from plano outward; then plus
 * bands from plano outward. Works for mixed-sign bands (e.g. -2.00 to +2.00).
 */
export function compareBands(a: PowerBand, b: PowerBand): number {
  const rank = (band: PowerBand) => {
    if (band.end === null || band.start === null) return [2, 0, 0];
    const mid = (band.start + band.end) / 2;
    const near = Math.min(Math.abs(band.start), Math.abs(band.end));
    return [mid <= 0 ? 0 : 1, near, Math.abs(mid)];
  };
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i]! - rb[i]!;
  }
  return a.key.localeCompare(b.key);
}

function sectionFor(row: MatrixLensRow): { key: string; label: string | null } {
  const parts: string[] = [];
  if (row.add !== null && Math.abs(row.add) > 1e-9) parts.push(`ADD ${formatPower(row.add)}`);
  if (row.axis !== null) parts.push(`Axis ${row.axis}°`);
  if (row.eye) parts.push(`Eye ${row.eye}`);
  return parts.length
    ? { key: parts.join("|"), label: parts.join(" · ") }
    : { key: "default", label: null };
}

export function cellKey(sphKey: string, cylKey: string): string {
  return `${sphKey}|${cylKey}`;
}

export function rowPowerLabel(row: MatrixLensRow): string {
  if (row.crossPower !== null) return `Cross ${formatPower(row.crossPower)}`;
  const sph = axisBand(row.sphStartRange, row.sph, "s");
  const cyl = axisBand(row.cylStartRange, row.cyl, "c");
  const parts = [`SPH ${sph.label}`];
  if (cyl.end !== null) parts.push(`CYL ${cyl.label}`);
  return parts.join(" / ");
}

/** Reorder engine semantics: a rule fires when available ≤ threshold. */
export function cellState(row: { rule: MatrixRule | null; available: number }): CellState {
  if (!row.rule) return "NO_RULE";
  if (!row.rule.isActive || !row.rule.autoProcure) return "INACTIVE";
  return row.available <= row.rule.minStock ? "BELOW_THRESHOLD" : "OK";
}

export function buildProductMatrix(rows: MatrixLensRow[]): ProductMatrix {
  const sections = new Map<
    string,
    {
      label: string | null;
      sph: Map<string, PowerBand>;
      cyl: Map<string, PowerBand>;
      cells: Record<string, MatrixCell[]>;
    }
  >();
  const totals = { leaves: 0, onHand: 0, withRule: 0, belowThreshold: 0, overlappingCells: 0 };

  for (const row of rows) {
    const section = sectionFor(row);
    let bucket = sections.get(section.key);
    if (!bucket) {
      bucket = { label: section.label, sph: new Map(), cyl: new Map(), cells: {} };
      sections.set(section.key, bucket);
    }
    let sphBand: PowerBand;
    let cylBand: PowerBand;
    if (row.crossPower !== null) {
      sphBand = { key: "s:cross", label: "Cross", start: null, end: null };
      const v = roundQuarter(row.crossPower);
      cylBand = { key: `x:${v.toFixed(2)}`, label: `Cross ${formatPower(v)}`, start: null, end: null };
    } else {
      sphBand = axisBand(row.sphStartRange, row.sph, "s");
      cylBand = axisBand(row.cylStartRange, row.cyl, "c");
    }
    bucket.sph.set(sphBand.key, sphBand);
    bucket.cyl.set(cylBand.key, cylBand);

    const available = Math.max(0, row.onHand - row.reserved);
    const cell: MatrixCell = {
      ...row,
      available,
      state: cellState({ rule: row.rule, available }),
      powerLabel: rowPowerLabel(row),
    };
    const key = cellKey(sphBand.key, cylBand.key);
    (bucket.cells[key] ??= []).push(cell);

    totals.leaves += 1;
    totals.onHand += row.onHand;
    if (row.rule) totals.withRule += 1;
    if (cell.state === "BELOW_THRESHOLD") totals.belowThreshold += 1;
  }

  const out: MatrixSection[] = [];
  for (const [key, bucket] of sections) {
    for (const list of Object.values(bucket.cells)) {
      if (list.length > 1) totals.overlappingCells += 1;
    }
    out.push({
      key,
      label: bucket.label,
      sphBands: [...bucket.sph.values()].sort(compareBands),
      cylBands: [...bucket.cyl.values()].sort(compareBands),
      cells: bucket.cells,
    });
  }
  out.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "", undefined, { numeric: true }));
  return { sections: out, totals };
}

export type MatrixEdit = {
  lensId: string;
  minStock: number;
  targetStock: number;
  /** updatedAt of the rule the user edited; null when creating a new rule. */
  expectedUpdatedAt: string | null;
};

/** Parse a threshold/target input. "" = not entered (null); else whole ≥ 0. */
export function parseQuantityInput(raw: string): { value: number | null; error: string | null } {
  const text = raw.trim();
  if (text === "") return { value: null, error: null };
  if (!/^\d+$/.test(text)) return { value: null, error: "Whole number ≥ 0" };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > 1_000_000) {
    return { value: null, error: "Too large" };
  }
  return { value, error: null };
}

/** Same constraints as ReorderRule validation (threshold < target). */
export function validateMatrixQuantities(
  minStock: number | null,
  targetStock: number | null
): string | null {
  if (minStock === null && targetStock === null) return "Enter threshold and target";
  if (minStock === null) return "Enter a threshold";
  if (targetStock === null) return "Enter a target";
  if (!Number.isInteger(minStock) || minStock < 0) return "Threshold must be a whole number ≥ 0";
  if (!Number.isInteger(targetStock) || targetStock < 0) return "Target must be a whole number ≥ 0";
  if (targetStock <= minStock) return "Target must be greater than threshold";
  return null;
}

export const MAX_MATRIX_EDITS_PER_SAVE = 500;

/** Server-side validation of a matrix save payload. */
export function parseMatrixEdits(raw: unknown):
  | { ok: true; edits: MatrixEdit[] }
  | { ok: false; error: string; cellErrors?: Record<string, string> } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "No changes to save." };
  }
  if (raw.length > MAX_MATRIX_EDITS_PER_SAVE) {
    return { ok: false, error: `Too many changes in one save (max ${MAX_MATRIX_EDITS_PER_SAVE}).` };
  }
  const edits: MatrixEdit[] = [];
  const cellErrors: Record<string, string> = {};
  const seen = new Set<string>();
  for (const item of raw) {
    const row = (item ?? {}) as Record<string, unknown>;
    const lensId = typeof row.lensId === "string" ? row.lensId.trim() : "";
    if (!lensId) return { ok: false, error: "Each change needs a lensId." };
    if (seen.has(lensId)) return { ok: false, error: "Duplicate power in one save." };
    seen.add(lensId);
    const minStock = typeof row.minStock === "number" ? row.minStock : Number.NaN;
    const targetStock = typeof row.targetStock === "number" ? row.targetStock : Number.NaN;
    const error = validateMatrixQuantities(
      Number.isFinite(minStock) ? minStock : null,
      Number.isFinite(targetStock) ? targetStock : null
    );
    if (error) {
      cellErrors[lensId] = error;
      continue;
    }
    const expected =
      typeof row.expectedUpdatedAt === "string" && row.expectedUpdatedAt
        ? row.expectedUpdatedAt
        : null;
    edits.push({ lensId, minStock, targetStock, expectedUpdatedAt: expected });
  }
  if (Object.keys(cellErrors).length) {
    return { ok: false, error: "Some cells have invalid values.", cellErrors };
  }
  return { ok: true, edits };
}

/**
 * Optimistic concurrency: an edit conflicts when the stored rule changed (or
 * was created/removed) since the user loaded the matrix.
 */
export function findRuleConflicts(
  edits: MatrixEdit[],
  current: Map<string, { updatedAt: string } | null>
): string[] {
  const conflicts: string[] = [];
  for (const edit of edits) {
    const rule = current.get(edit.lensId) ?? null;
    const now = rule?.updatedAt ?? null;
    if (now !== edit.expectedUpdatedAt) conflicts.push(edit.lensId);
  }
  return conflicts;
}

/** Product grouping key, serialized for URLs. */
export type MatrixProductKey = Record<string, string | number | null>;

export function encodeProductKey(key: MatrixProductKey): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

export function decodeProductKey(raw: string): MatrixProductKey | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      if (value !== null && typeof value !== "string" && typeof value !== "number") return null;
    }
    return parsed as MatrixProductKey;
  } catch {
    return null;
  }
}
