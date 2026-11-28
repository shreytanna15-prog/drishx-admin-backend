/**
 * Pure helpers for Power-wise Inventory (no Prisma / I/O).
 * Spec: docs/stock-management/POWER-WISE-INVENTORY.md
 */

import type { CatalogMatrixSheet } from "@/app/lib/catalog/catalog-matrix";
import { catalogAvailable } from "@/app/lib/catalog/catalog-stock-position-core";
import { encodeStockLeafKey } from "@/app/lib/catalog/lens-product-stock-core";

export class PowerWiseStockError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "POWER_WISE_ERROR") {
    super(message);
    this.name = "PowerWiseStockError";
    this.status = status;
    this.code = code;
  }
}

export type PowerWiseMatrixCell = {
  onHand: number;
  reserved: number;
  available: number;
  blocked: number;
};

export type PowerWiseSearchableCard = {
  name: string;
  familyName: string;
  baseName: string;
  materialName: string | null;
  coatingName: string | null;
  colorName: string | null;
  diameterName: string | null;
  progressiveTypeName: string | null;
};

export type PowerWiseVariantFilterable = {
  skuCode: string;
  name: string;
  rangeLabel: string;
  axis: number | null;
  eye: string | null;
  addition: number | null;
};

export function zeroPowerWiseCell(): PowerWiseMatrixCell {
  return { onHand: 0, reserved: 0, available: 0, blocked: 0 };
}

/** Shared available formula for Power-wise cells. */
export function buildPowerWiseLeafCell(input: {
  onHand: number;
  blockedQty: number;
  reservedQty: number;
}): PowerWiseMatrixCell {
  return {
    onHand: input.onHand,
    reserved: input.reservedQty,
    available: catalogAvailable({
      onHand: input.onHand,
      blockedQty: input.blockedQty,
      reservedQty: input.reservedQty,
    }),
    blocked: input.blockedQty,
  };
}

export function buildPowerWiseProductName(
  parts: Array<string | null | undefined>
): string {
  return parts.filter(Boolean).join(" · ");
}

export function powerWiseProductMatchesQuery(
  card: PowerWiseSearchableCard,
  q: string
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    card.name,
    card.familyName,
    card.baseName,
    card.materialName,
    card.coatingName,
    card.colorName,
    card.diameterName,
    card.progressiveTypeName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

/** Valid matrix cells with no DB leaf → 0/0/0/0. */
export function fillMissingPowerWiseCells(
  sheets: CatalogMatrixSheet[],
  leaves: Record<string, PowerWiseMatrixCell>
): void {
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      for (const col of sheet.dataColumns) {
        const cell = row.cells[col.key];
        if (!cell?.allowed || !cell.present || !cell.variantId) continue;
        const key = encodeStockLeafKey(
          cell.variantId,
          cell.cellKey.sph,
          cell.cellKey.cyl
        );
        if (!leaves[key]) leaves[key] = zeroPowerWiseCell();
      }
    }
  }
}

export function filterPowerWiseVariants<T extends PowerWiseVariantFilterable>(
  rows: T[],
  filters: {
    q?: string;
    axis?: number;
    eye?: string;
    addition?: number;
  }
): T[] {
  let out = rows;
  const q = filters.q?.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (row) =>
        row.skuCode.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.rangeLabel.toLowerCase().includes(q)
    );
  }
  if (filters.axis != null && Number.isFinite(filters.axis)) {
    out = out.filter(
      (row) =>
        row.axis != null && Math.abs(row.axis - filters.axis!) < 1e-9
    );
  }
  if (filters.eye) {
    const eye = filters.eye.toUpperCase();
    out = out.filter((row) => (row.eye ?? "").toUpperCase() === eye);
  }
  if (filters.addition != null && Number.isFinite(filters.addition)) {
    out = out.filter(
      (row) =>
        row.addition != null &&
        Math.abs(row.addition - filters.addition!) < 1e-9
    );
  }
  return out;
}

/** Shortage = configured rules and available at/below threshold. */
export function isPowerWiseShortage(input: {
  available: number;
  minStock: number;
  targetStock: number;
}): boolean {
  return (
    (input.minStock > 0 || input.targetStock > 0) &&
    input.available <= input.minStock
  );
}
