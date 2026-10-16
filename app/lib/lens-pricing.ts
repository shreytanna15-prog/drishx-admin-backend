export const PIECES_PER_PAIR = 2;

/** Catalog / DB lens price is per pair (2 pieces). Order quantity is stored in pieces. */
export function orderTotalFromPairPrice(
  pairPrice: number,
  pieceQuantity: number
): number {
  if (
    !Number.isFinite(pairPrice) ||
    !Number.isFinite(pieceQuantity) ||
    pieceQuantity < 1
  ) {
    return 0;
  }
  return Number(pairPrice) * (pieceQuantity / PIECES_PER_PAIR);
}

/**
 * Invoice line inputs that reconcile with checkout: piece quantity × per-piece
 * rate equals `orderTotalFromPairPrice(pairPrice, pieceQuantity)`.
 *
 * Catalog `Order.unitPrice` is a pair price; `Order.quantity` is pieces.
 * Storing a per-piece unit price keeps line qty aligned with the order while
 * ensuring qty × unitPrice matches the order gross before tax.
 */
export function invoiceLineFromPairPrice(
  pairPrice: number,
  pieceQuantity: number
): { quantity: number; unitPrice: number; lineGross: number } {
  const quantity =
    Number.isFinite(pieceQuantity) && pieceQuantity > 0 ? Number(pieceQuantity) : 0;
  const lineGross = orderTotalFromPairPrice(Number(pairPrice) || 0, quantity || 0);
  if (quantity <= 0) {
    return { quantity: 0, unitPrice: 0, lineGross: 0 };
  }
  return {
    quantity,
    unitPrice: lineGross / quantity,
    lineGross,
  };
}
