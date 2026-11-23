/**
 * Client-safe stock adjustment helpers (no Prisma).
 * Available = onHand − reserved − blocked. Reserved is 0 until order cutover.
 */

export const CATALOG_STOCK_ADJUSTMENT_REASONS = [
  "physical_mismatch",
  "damaged",
  "counting_error",
  "wrong_entry",
  "other",
] as const;

export type CatalogStockAdjustmentReasonCode =
  (typeof CATALOG_STOCK_ADJUSTMENT_REASONS)[number];

export const CATALOG_STOCK_ADJUSTMENT_REASON_LABELS: Record<
  CatalogStockAdjustmentReasonCode,
  string
> = {
  physical_mismatch: "Physical count discrepancy",
  damaged: "Damaged / loss",
  counting_error: "Counting error",
  wrong_entry: "Wrong entry / wrong power correction",
  other: "Other",
};

export function isCatalogStockAdjustmentReason(
  value: string
): value is CatalogStockAdjustmentReasonCode {
  return (CATALOG_STOCK_ADJUSTMENT_REASONS as readonly string[]).includes(value);
}

export function computeAvailableQty(input: {
  onHand: number;
  blockedQty?: number;
  reservedQty?: number;
}): number {
  const blocked = Math.max(0, input.blockedQty ?? 0);
  const reserved = Math.max(0, input.reservedQty ?? 0);
  return input.onHand - reserved - blocked;
}

/**
 * Validate a counted-qty adjustment. Rejects negative on-hand and any result
 * that would make available < 0 (protects reserved/blocked).
 */
export function assessCatalogStockAdjustment(input: {
  qtyBefore: number;
  countedQty: number;
  blockedQty?: number;
  reservedQty?: number;
}):
  | {
      ok: true;
      qtyBefore: number;
      countedQty: number;
      qtyDelta: number;
      qtyAfter: number;
      availableBefore: number;
      availableAfter: number;
    }
  | { ok: false; code: string; message: string } {
  const qtyBefore = input.qtyBefore;
  const countedQty = input.countedQty;
  const blockedQty = Math.max(0, input.blockedQty ?? 0);
  const reservedQty = Math.max(0, input.reservedQty ?? 0);

  if (!Number.isSafeInteger(qtyBefore) || qtyBefore < 0) {
    return {
      ok: false,
      code: "INVALID_BEFORE",
      message: "Current on-hand must be a whole number ≥ 0.",
    };
  }
  if (!Number.isSafeInteger(countedQty) || countedQty < 0) {
    return {
      ok: false,
      code: "INVALID_COUNTED",
      message: "Counted / new quantity must be a whole number ≥ 0.",
    };
  }
  if (countedQty > 1_000_000) {
    return {
      ok: false,
      code: "COUNTED_TOO_LARGE",
      message: "Counted quantity is too large.",
    };
  }

  const qtyAfter = countedQty;
  const qtyDelta = qtyAfter - qtyBefore;
  const availableBefore = computeAvailableQty({
    onHand: qtyBefore,
    blockedQty,
    reservedQty,
  });
  const availableAfter = computeAvailableQty({
    onHand: qtyAfter,
    blockedQty,
    reservedQty,
  });

  if (availableAfter < 0) {
    return {
      ok: false,
      code: "NEGATIVE_AVAILABLE",
      message: `Adjustment would make available negative (on hand ${qtyAfter} − reserved ${reservedQty} − blocked ${blockedQty} = ${availableAfter}). Reduce reserved/blocked first, or enter a higher counted qty.`,
    };
  }

  return {
    ok: true,
    qtyBefore,
    countedQty,
    qtyDelta,
    qtyAfter,
    availableBefore,
    availableAfter,
  };
}
