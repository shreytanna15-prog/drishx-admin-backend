import {
  LoyaltyTransactionStatus,
  LoyaltyTransactionType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { recomputeWallet } from "./wallet";

type TxClient = Prisma.TransactionClient | typeof prisma;

/**
 * Expire available points whose expiry date has passed. Runs a lazy sweep and
 * is safe to call repeatedly. Returns total points expired.
 */
export async function expirePoints(
  db: TxClient = prisma
): Promise<number> {
  const now = new Date();
  const expiring = await db.loyaltyTransaction.findMany({
    where: {
      status: LoyaltyTransactionStatus.AVAILABLE,
      expiresAt: { not: null, lte: now },
      type: {
        in: [
          LoyaltyTransactionType.POINTS_EARNED,
          LoyaltyTransactionType.ADVANCE_BONUS,
        ],
      },
      points: { gt: 0 },
    },
  });

  const byCustomer = new Map<string, number>();
  for (const t of expiring) {
    const amount = Number(t.points) || 0;
    if (amount <= 0) continue;
    await db.loyaltyTransaction.update({
      where: { id: t.id },
      data: { status: LoyaltyTransactionStatus.EXPIRED },
    });
    byCustomer.set(t.customerId, (byCustomer.get(t.customerId) || 0) + amount);
  }

  for (const [customerId, amount] of byCustomer) {
    await db.loyaltyTransaction.create({
      data: {
        customerId,
        type: LoyaltyTransactionType.POINTS_EXPIRED,
        points: -amount,
        balanceAfter: 0,
        status: LoyaltyTransactionStatus.EXPIRED,
        reason: "Points expired",
        createdAt: now,
      },
    });
    await recomputeWallet(customerId, db);
  }

  return Array.from(byCustomer.values()).reduce((a, b) => a + b, 0);
}
