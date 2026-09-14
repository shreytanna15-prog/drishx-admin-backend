import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";

type TxClient = Prisma.TransactionClient | typeof prisma;

/** Get (or lazily create) a customer's wallet. */
export async function getOrCreateWallet(
  customerId: string,
  db: TxClient = prisma
) {
  const existing = await db.loyaltyWallet.findUnique({
    where: { customerId },
  });
  if (existing) return existing;
  return db.loyaltyWallet.create({ data: { customerId } });
}

/**
 * Recompute a customer's wallet from its transaction ledger. Used to keep
 * available/pending totals correct after any earn/redeem/reverse/expire.
 */
export async function recomputeWallet(
  customerId: string,
  db: TxClient = prisma
) {
  const txns = await db.loyaltyTransaction.findMany({
    where: { customerId },
    select: {
      type: true,
      status: true,
      points: true,
    },
  });

  let available = 0;
  let pending = 0;
  let totalEarned = 0;
  let totalRedeemed = 0;
  let totalExpired = 0;
  let totalReversed = 0;

  for (const t of txns) {
    const p = Number(t.points) || 0;
    if (t.status === "AVAILABLE" || t.status === "REDEEMED") {
      // Redeemed points were once available; subtract reverse/expire separately.
      if (t.type === "POINTS_EARNED" || t.type === "ADVANCE_BONUS") {
        totalEarned += p;
      }
      if (t.type === "POINTS_REDEEMED") {
        totalRedeemed += Math.abs(p);
      }
      if (t.type === "POINTS_EXPIRED") {
        totalExpired += Math.abs(p);
      }
      if (t.type === "POINTS_REVERSED") {
        totalReversed += Math.abs(p);
      }
    }
    if (t.status === "AVAILABLE") {
      available += p;
    } else if (t.status === "PENDING") {
      pending += p;
    }
  }

  await db.loyaltyWallet.upsert({
    where: { customerId },
    create: { customerId, availablePoints: available, pendingPoints: pending },
    update: {
      availablePoints: available,
      pendingPoints: pending,
      totalEarned,
      totalRedeemed,
      totalExpired,
      totalReversed,
    },
  });

  return {
    availablePoints: available,
    pendingPoints: pending,
    totalEarned,
    totalRedeemed,
    totalExpired,
    totalReversed,
  };
}

/** Points expiring within 30 days (for "expiring soon" display). */
export async function getExpiringWithinDays(
  customerId: string,
  days: number,
  db: TxClient = prisma
) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const rows = await db.loyaltyTransaction.findMany({
    where: {
      customerId,
      status: "AVAILABLE",
      expiresAt: { not: null, lte: cutoff },
    },
    select: { points: true },
  });
  return rows.reduce((sum, r) => sum + (Number(r.points) || 0), 0);
}
