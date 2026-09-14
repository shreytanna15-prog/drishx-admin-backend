import {
  LoyaltyTransactionStatus,
  LoyaltyTransactionType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { roundMoney } from "@/app/lib/finance/tax-calc";
import { getLoyaltySettings } from "./settings";
import { getOrCreateWallet, recomputeWallet } from "./wallet";

type TxClient = Prisma.TransactionClient | typeof prisma;

/**
 * Validate a redemption request against the customer's available balance and
 * the per-invoice redemption cap. Returns the max allowed points.
 */
export async function validateRedemption(input: {
  customerId: string;
  points: number;
  orderTaxable: number;
  db?: TxClient;
}): Promise<{ allowed: boolean; maxAllowed: number; message?: string }> {
  const db = input.db ?? prisma;
  const settings = await getLoyaltySettings();
  const wallet = await getOrCreateWallet(input.customerId, db);
  const available = Number(wallet.availablePoints) || 0;

  const capPct = Number(settings.maxRedemptionPct) || 5;
  const capAmount = roundMoney((input.orderTaxable * capPct) / 100);
  const maxAllowed = roundMoney(Math.min(available, capAmount));

  if ((input.points || 0) <= 0) {
    return { allowed: false, maxAllowed, message: "Enter an amount to redeem." };
  }
  if (input.points > maxAllowed) {
    return {
      allowed: false,
      maxAllowed,
      message: `You can redeem up to ${Math.floor(maxAllowed)} X Points here.`,
    };
  }
  return { allowed: true, maxAllowed };
}

/**
 * Deduct available loyalty points for an order after it is placed. Marks the
 * redeemed portion as ineligible to earn new points (handled by checkout
 * reducing the invoice taxable by this amount).
 */
export async function redeemPointsForOrder(input: {
  customerId: string;
  orderId: string;
  invoiceId: string;
  points: number;
  db?: TxClient;
}): Promise<number> {
  const db = input.db ?? prisma;
  const points = roundMoney(input.points);
  if (points <= 0) return 0;

  const wallet = await getOrCreateWallet(input.customerId, db);
  const available = Number(wallet.availablePoints) || 0;
  if (points > available) {
    throw new Error("Insufficient loyalty points.");
  }

  let remaining = points;
  // Deduct FIFO from AVAILABLE earning transactions.
  const availableTxns = await db.loyaltyTransaction.findMany({
    where: {
      customerId: input.customerId,
      status: LoyaltyTransactionStatus.AVAILABLE,
      type: {
        in: [
          LoyaltyTransactionType.POINTS_EARNED,
          LoyaltyTransactionType.ADVANCE_BONUS,
        ],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const t of availableTxns) {
    if (remaining <= 0) break;
    const take = Math.min(Number(t.points) || 0, remaining);
    if (take <= 0) continue;
    remaining = roundMoney(remaining - take);

    await db.loyaltyTransaction.update({
      where: { id: t.id },
      data: {
        points: (Number(t.points) || 0) - take,
        status:
          (Number(t.points) || 0) - take <= 0
            ? LoyaltyTransactionStatus.REDEEMED
            : t.status,
      },
    });
  }

  // Create the redemption ledger row for full audit visibility.
  await db.loyaltyTransaction.create({
    data: {
      customerId: input.customerId,
      orderId: input.orderId,
      invoiceId: input.invoiceId,
      type: LoyaltyTransactionType.POINTS_REDEEMED,
      points: -points,
      balanceAfter: 0,
      status: LoyaltyTransactionStatus.REDEEMED,
      reason: "Redeemed against order at checkout",
      createdAt: new Date(),
    },
  });

  await recomputeWallet(input.customerId, db);
  return points;
}

/**
 * Return redeemed points to a customer's wallet when their order is cancelled
 * or otherwise voided.
 */
export async function reverseRedemption(input: {
  customerId: string;
  orderId: string;
  invoiceId?: string | null;
  db?: TxClient;
}): Promise<number> {
  const db = input.db ?? prisma;
  const redeemed = await db.loyaltyTransaction.findMany({
    where: {
      customerId: input.customerId,
      orderId: input.orderId,
      type: LoyaltyTransactionType.POINTS_REDEEMED,
    },
  });

  let total = 0;
  for (const t of redeemed) {
    const amount = Math.abs(Number(t.points) || 0);
    if (amount <= 0) continue;
    total += amount;
  }

  if (total <= 0) return 0;

  await db.loyaltyTransaction.create({
    data: {
      customerId: input.customerId,
      orderId: input.orderId,
      invoiceId: input.invoiceId ?? null,
      type: LoyaltyTransactionType.POINTS_REVERSED,
      points: total,
      balanceAfter: 0,
      status: LoyaltyTransactionStatus.AVAILABLE,
      reason: "Redeemed points returned (order cancelled)",
      createdAt: new Date(),
    },
  });

  // Mark the original redemption rows as cancelled.
  await db.loyaltyTransaction.updateMany({
    where: {
      customerId: input.customerId,
      orderId: input.orderId,
      type: LoyaltyTransactionType.POINTS_REDEEMED,
      status: LoyaltyTransactionStatus.REDEEMED,
    },
    data: { status: LoyaltyTransactionStatus.CANCELLED },
  });

  await recomputeWallet(input.customerId, db);
  return total;
}

/**
 * Validate and resolve loyalty points to apply as an invoice discount at checkout.
 */
export async function resolveCheckoutRedemption(input: {
  customerId: string;
  redeemPoints?: unknown;
  orderGross: number;
  db?: TxClient;
}): Promise<{ loyaltyDiscount: number; error?: string }> {
  const settings = await getLoyaltySettings();
  const requested = roundMoney(Number(input.redeemPoints) || 0);
  if (requested <= 0) {
    return { loyaltyDiscount: 0 };
  }
  if (!settings.enabled) {
    return { loyaltyDiscount: 0, error: "Loyalty program is not available." };
  }

  const validation = await validateRedemption({
    customerId: input.customerId,
    points: requested,
    orderTaxable: roundMoney(input.orderGross),
    db: input.db,
  });
  if (!validation.allowed) {
    return {
      loyaltyDiscount: 0,
      error: validation.message ?? "Invalid redemption amount.",
    };
  }
  return { loyaltyDiscount: requested };
}

/** Deduct points after order + invoice are created (checkout already validated). */
export async function applyOrderRedemption(input: {
  customerId: string;
  orderId: string;
  invoiceId: string;
  loyaltyDiscount: number;
  db?: TxClient;
}): Promise<void> {
  const discount = roundMoney(input.loyaltyDiscount);
  if (discount <= 0) return;
  await redeemPointsForOrder({
    customerId: input.customerId,
    orderId: input.orderId,
    invoiceId: input.invoiceId,
    points: discount,
    db: input.db,
  });
}
