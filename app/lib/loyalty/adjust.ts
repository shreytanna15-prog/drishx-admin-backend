import {
  LoyaltyTransactionStatus,
  LoyaltyTransactionType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { roundMoney } from "@/app/lib/finance/tax-calc";
import { getOrCreateWallet, recomputeWallet } from "./wallet";

type TxClient = Prisma.TransactionClient | typeof prisma;

/**
 * Manually adjust a customer's loyalty points (admin only). Adjustments are
 * always audited, so callers must author the audit event afterward.
 *
 * @param points positive to credit, negative to debit.
 */
export async function adjustPoints(input: {
  customerId: string;
  points: number;
  reason: string;
  createdById: string;
  db?: TxClient;
}): Promise<number> {
  const db = input.db ?? prisma;
  const points = roundMoney(input.points);
  if (points === 0) throw new Error("Adjustment amount must be non-zero.");
  if (!input.reason?.trim()) {
    throw new Error("A reason is required for manual point adjustments.");
  }

  const wallet = await getOrCreateWallet(input.customerId, db);

  // Allow negative balance only via explicit admin adjustment; otherwise keep
  // debit within available.
  const available = Number(wallet.availablePoints) || 0;
  if (points < 0 && Math.abs(points) > available) {
    throw new Error(
      "Cannot debit more than the customer's available balance."
    );
  }

  await db.loyaltyTransaction.create({
    data: {
      customerId: input.customerId,
      type: LoyaltyTransactionType.POINTS_ADJUSTED,
      points,
      balanceAfter: 0,
      status: LoyaltyTransactionStatus.AVAILABLE,
      reason: input.reason,
      createdById: input.createdById,
      createdAt: new Date(),
    },
  });

  await recomputeWallet(input.customerId, db);
  return points;
}
