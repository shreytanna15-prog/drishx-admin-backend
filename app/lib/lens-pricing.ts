export const PIECES_PER_PAIR = 2;

/** Catalog / DB lens price is per pair (2 pieces). Order quantity is stored in pieces. */
export function orderTotalFromPairPrice(pairPrice: number, pieceQuantity: number): number {
  if (!Number.isFinite(pairPrice) || !Number.isFinite(pieceQuantity) || pieceQuantity < 1) {
    return 0;
  }
  return Number(pairPrice) * (pieceQuantity / PIECES_PER_PAIR);
}
