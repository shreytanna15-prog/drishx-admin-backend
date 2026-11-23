/**
 * Client-safe stock leaf helpers (no Prisma / Node-only imports).
 */

import {
  type CatalogMatrixModel,
} from "@/app/lib/catalog/catalog-matrix";

const POWER_STEP = 0.25;
const POWER_EPS = 1e-9;

export class CatalogStockError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(
    message: string,
    status = 400,
    code = "CATALOG_STOCK_ERROR",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CatalogStockError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Round optical power to the 0.25 grid used by the catalog matrix. */
export function normalizeStockPower(value: number): number {
  if (!Number.isFinite(value)) {
    throw new CatalogStockError("Power must be a finite number.", 400, "INVALID_POWER");
  }
  return Math.round(value / POWER_STEP) * POWER_STEP;
}

export function encodeStockLeafKey(
  variantId: string,
  sph: number,
  cyl: number
): string {
  const s = normalizeStockPower(sph);
  const c = normalizeStockPower(cyl);
  return `${variantId}:${s.toFixed(2)}:${c.toFixed(2)}`;
}

export function validateCatalogStockQuantities(
  minStock: number,
  targetStock: number
): string | null {
  if (!Number.isSafeInteger(minStock) || minStock < 0 || minStock > 1_000_000) {
    return "Threshold must be a whole number ≥ 0.";
  }
  if (
    !Number.isSafeInteger(targetStock) ||
    targetStock < 0 ||
    targetStock > 1_000_000
  ) {
    return "Target must be a whole number ≥ 0.";
  }
  if (minStock > 0 && targetStock > 0 && minStock >= targetStock) {
    return "Threshold must be less than target when both are set.";
  }
  return null;
}

/**
 * True when a matrix cell is an allowed, present power that may receive
 * threshold/target edits (rejects Cross Style B gap-fail cells).
 */
export function assertCellEditableOnMatrix(
  matrix: CatalogMatrixModel,
  variantId: string,
  sph: number,
  cyl: number
): void {
  const ns = normalizeStockPower(sph);
  const nc = normalizeStockPower(cyl);
  for (const sheet of matrix.sheets) {
    for (const row of sheet.rows) {
      for (const cell of Object.values(row.cells)) {
        if (!cell.present || !cell.allowed) continue;
        if (cell.variantId !== variantId) continue;
        if (
          Math.abs(cell.cellKey.sph - ns) < POWER_EPS &&
          Math.abs(cell.cellKey.cyl - nc) < POWER_EPS
        ) {
          return;
        }
      }
    }
  }
  throw new CatalogStockError(
    `Power SPH ${ns.toFixed(2)} / CYL ${nc.toFixed(2)} is not an editable cell for this variant.`,
    400,
    "CELL_NOT_EDITABLE",
    { variantId, sph: ns, cyl: nc }
  );
}
