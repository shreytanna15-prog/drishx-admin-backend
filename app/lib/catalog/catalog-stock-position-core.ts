/**
 * Stock S4 — pure catalog position + reorder math (no Prisma).
 */

import { computeAvailableQty } from "@/app/lib/catalog/catalog-stock-adjustment-core";
import { calculateRequiredQuantity } from "@/app/lib/procurement-rules";

/** Reserved stays 0 until order/checkout cutover (CLIENT-FOLLOW-ONS). */
export const CATALOG_RESERVED_QTY_UNTIL_CUTOVER = 0;

export function catalogAvailable(input: {
  onHand: number;
  blockedQty: number;
  reservedQty?: number;
}): number {
  return computeAvailableQty({
    onHand: input.onHand,
    reservedQty: input.reservedQty ?? CATALOG_RESERVED_QTY_UNTIL_CUTOVER,
    blockedQty: input.blockedQty,
  });
}

/**
 * CLIENT-PLAN §8.1 required qty.
 * unreservedShortage defaults to 0 until order lines bind to leaves.
 */
export function calculateCatalogRequiredQuantity(input: {
  available: number;
  targetStock: number;
  incoming: number;
  unreservedShortage?: number;
  moq?: number | null;
}): number {
  const fromTarget = calculateRequiredQuantity({
    available: input.available,
    targetStock: input.targetStock,
    incoming: input.incoming,
    moq: null,
  });
  const shortage = Math.max(
    0,
    Math.trunc((input.unreservedShortage ?? 0) - input.incoming)
  );
  let required = Math.max(fromTarget, shortage);
  const moq = input.moq ?? null;
  if (required > 0 && moq && moq > 0) {
    required = Math.ceil(required / moq) * moq;
  }
  return required;
}

/** Raise a new requirement when available ≤ threshold (and no open PO). */
export function shouldRaiseCatalogReorder(input: {
  available: number;
  minStock: number;
  targetStock: number;
  openPoExists: boolean;
}): { raise: boolean; reason: string } {
  if (input.openPoExists) {
    return {
      raise: false,
      reason: "Open purchase order already covers this leaf.",
    };
  }
  if (input.targetStock <= 0 && input.minStock <= 0) {
    return {
      raise: false,
      reason: "No threshold/target configured on this leaf.",
    };
  }
  if (input.available > input.minStock) {
    return {
      raise: false,
      reason: `Available ${input.available} is above threshold ${input.minStock}.`,
    };
  }
  return { raise: true, reason: "Available at or below threshold." };
}
