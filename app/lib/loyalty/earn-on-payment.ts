import {
  LoyaltyTransactionStatus,
  LoyaltyTransactionType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getLoyaltySettings } from "./settings";
import { computeOrderLoyalty, type LoyaltyRateKind } from "./calculate";
import { getOrCreateWallet, recomputeWallet } from "./wallet";

type TxClient = Prisma.TransactionClient | typeof prisma;

/**
 * Award pending loyalty points when an invoice becomes fully PAID.
 *
 * Returns the number of points awarded (0 if none / blocked / duplicate).
 * Idempotent: an invoice can never earn twice (fraud guard).
 */
export async function earnPointsOnPayment(input: {
  customerId: string;
  orderId: string;
  invoiceId: string;
  taxableAmount: number;
  rateKind: LoyaltyRateKind;
  db?: TxClient;
}): Promise<number> {
  const db = input.db ?? prisma;

  const settings = await getLoyaltySettings();
  if (!settings.enabled) return 0;

  // Idempotency guard: already earned for this invoice?
  const existing = await db.loyaltyTransaction.findFirst({
    where: {
      invoiceId: input.invoiceId,
      type: {
        in: [
          LoyaltyTransactionType.POINTS_EARNED,
          LoyaltyTransactionType.ADVANCE_BONUS,
        ],
      },
    },
    select: { id: true },
  });
  if (existing) return 0;

  const { points, reason } = await computeOrderLoyalty({
    orderId: input.orderId,
    taxableAmount: input.taxableAmount,
    rateKind: input.rateKind,
    settings,
  });

  if (points <= 0) return 0;
  void reason;

  const wallet = await getOrCreateWallet(input.customerId, db);

  // Compute pending running total (balance = pending contribution).
  const pendingTotal = Number(wallet.pendingPoints) || 0;

  const baseRate = Number(settings.baseRatePct) / 100;
  const advanceBonus = Number(settings.advanceBonusPct) / 100;
  const effectiveRate =
    input.rateKind === "advance" ? baseRate + advanceBonus : baseRate;
  // Allocate earned points between EARNED and ADVANCE_BONUS rows for clarity.
  const basePoints =
    input.rateKind === "advance"
      ? Math.round((Number(input.taxableAmount) * baseRate) * 100) / 100
      : points;

  await db.loyaltyWallet.update({
    where: { id: wallet.id },
    data: { pendingPoints: pendingTotal + points },
  });

  const txnCreate = {
    customerId: input.customerId,
    orderId: input.orderId,
    invoiceId: input.invoiceId,
    status: LoyaltyTransactionStatus.PENDING,
    createdAt: new Date(),
  };

  if (input.rateKind === "advance" && points > basePoints) {
    const bonus = Math.round((points - basePoints) * 100) / 100;
    // Base row
    const baseBalance = pendingTotal + basePoints;
    await db.loyaltyTransaction.create({
      data: {
        ...txnCreate,
        type: LoyaltyTransactionType.POINTS_EARNED,
        points: basePoints,
        balanceAfter: baseBalance,
        reason: "Earned on full advance payment (base rate)",
      },
    });
    // Bonus row
    await db.loyaltyTransaction.create({
      data: {
        ...txnCreate,
        type: LoyaltyTransactionType.ADVANCE_BONUS,
        points: bonus,
        balanceAfter: baseBalance + bonus,
        reason: "Advance payment bonus",
      },
    });
  } else {
    await db.loyaltyTransaction.create({
      data: {
        ...txnCreate,
        type: LoyaltyTransactionType.POINTS_EARNED,
        points,
        balanceAfter: pendingTotal + points,
        reason:
          input.rateKind === "advance"
            ? "Earned on full advance payment"
            : "Earned on full payment",
      },
    });
  }

  // Refresh wallet running totals from ledger.
  await recomputeWallet(input.customerId, db);

  return points;
}
