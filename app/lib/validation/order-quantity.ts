import { z } from "zod";

export const PIECES_PER_PAIR = 2;
export const MIN_PAIR_QUANTITY = 0.5;

const PAIR_EPS = 1e-9;

export function isMultipleOfHalf(value: number): boolean {
  if (!Number.isFinite(value)) {
    return false;
  }
  const doubled = value * 2;
  return Math.abs(doubled - Math.round(doubled)) < PAIR_EPS;
}

export function isValidPairQuantity(pairs: number): boolean {
  return (
    Number.isFinite(pairs) &&
    pairs >= MIN_PAIR_QUANTITY - PAIR_EPS &&
    isMultipleOfHalf(pairs)
  );
}

export const pairQuantitySchema = z.number().refine(isValidPairQuantity, {
  message: "Enter quantity in 0.5 pair steps (0.5, 1, 1.5, …). Minimum is 0.5.",
});

export function piecesFromPairs(pairs: number): number {
  if (!isValidPairQuantity(pairs)) {
    return 0;
  }
  return Math.round(pairs * PIECES_PER_PAIR);
}

export function piecesFromDisplayQuantity(
  displayQty: number,
  unit: "piece" | "pair" = "pair"
): number {
  if (unit === "piece") {
    if (!Number.isFinite(displayQty) || displayQty < 1) {
      return 0;
    }
    return Math.round(displayQty);
  }
  return piecesFromPairs(displayQty);
}
