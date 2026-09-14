import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { PIECES_PER_PAIR } from "@/app/lib/lens-pricing";

type TxClient = Prisma.TransactionClient | typeof prisma;

/**
 * Returns the total gross cost (in ₹) for an order's lenses.
 *
 * Cost data is only captured on SingleVisionLens, KryptokLens and
 * ProgressiveLens. For other lens families (OriVision, Magnus, Bifocal) there
 * is no cost table, so they return 0 (margin protection is skipped by the
 * caller for orders without cost data).
 *
 * Lens costPrice is per pair; order.quantity is in pieces.
 */
export async function getOrderGrossCost(
  orderId: string,
  db: TxClient = prisma
): Promise<number> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      quantity: true,
      singleVisionLens: { select: { costPrice: true } },
      kryptokLens: { select: { costPrice: true } },
      progressiveLens: { select: { costPrice: true } },
    },
  });
  if (!order) return 0;

  const lens =
    order.singleVisionLens ??
    order.kryptokLens ??
    order.progressiveLens;

  if (!lens?.costPrice) return 0;

  const pieces = Number(order.quantity) || 1;
  const pairs = pieces / PIECES_PER_PAIR;
  return (Number(lens.costPrice) || 0) * pairs;
}
