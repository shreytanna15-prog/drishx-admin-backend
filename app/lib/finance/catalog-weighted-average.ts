import { Prisma } from "@prisma/client";

/** A null result means that the full physical balance cannot be valued honestly. */
export function nextCatalogWeightedAverageCost(input: {
  onHandBefore: number;
  averageBefore: Prisma.Decimal | number | null;
  acceptedQuantity: number;
  unitCost: Prisma.Decimal | number | null;
}): Prisma.Decimal | null {
  const { onHandBefore, averageBefore, acceptedQuantity, unitCost } = input;
  if (!Number.isInteger(onHandBefore) || onHandBefore < 0 ||
      !Number.isInteger(acceptedQuantity) || acceptedQuantity <= 0) {
    throw new Error("Invalid stock quantities for weighted-average cost.");
  }
  if (unitCost == null) return null;
  const cost = new Prisma.Decimal(unitCost);
  if (!cost.isFinite() || cost.isNegative()) throw new Error("Receipt unit cost must be non-negative.");
  if (onHandBefore === 0) return cost.toDecimalPlaces(4);
  if (averageBefore == null) return null;
  const previous = new Prisma.Decimal(averageBefore);
  if (!previous.isFinite() || previous.isNegative()) throw new Error("Invalid existing average cost.");
  return previous.mul(onHandBefore)
    .plus(cost.mul(acceptedQuantity))
    .div(onHandBefore + acceptedQuantity)
    .toDecimalPlaces(4);
}
