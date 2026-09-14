import {
  LoyaltyTransactionStatus,
  LoyaltyTransactionType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { roundMoney } from "@/app/lib/finance/tax-calc";
import { recomputeWallet } from "./wallet";

type TxClient = Prisma.TransactionClient | typeof prisma;

/**
 * Reverse loyalty points proportionally when an order's goods are returned or a
 * credit note reduces the invoice.
 *
 * @param originalTaxable  taxable value the original points were based on
 * @param returnedTaxable  taxable value being returned / credited
 * @param pointsEarned     points originally earned for this order (positive)
 * @param reason           human reason (e.g. "Return RM-…", "Credit note CN-…")
 */
export async function reverseOrderLoyalty(input: {
  customerId: string;
  orderId: string;
  invoiceId?: string | null;
  creditNoteId?: string | null;
  returnRequestId?: string | null;
  originalTaxable: number;
  returnedTaxable: number;
  pointsEarned: number;
  reason: string;
  db?: TxClient;
}): Promise<number> {
  const db = input.db ?? prisma;
  const ratio =
    input.originalTaxable > 0
      ? input.returnedTaxable / input.originalTaxable
      : 0;
  const reversePoints = roundMoney((input.pointsEarned || 0) * ratio);
  if (reversePoints <= 0) return 0;

  const wallet = await db.loyaltyWallet.findUnique({
    where: { customerId: input.customerId },
  });
  if (!wallet) return 0;

  // Reverse from AVAILABLE first, then any remaining pending.
  let remaining = reversePoints;

  const availableEarn = await db.loyaltyTransaction.findMany({
    where: {
      customerId: input.customerId,
      orderId: input.orderId,
      status: LoyaltyTransactionStatus.AVAILABLE,
      type: {
        in: [
          LoyaltyTransactionType.POINTS_EARNED,
          LoyaltyTransactionType.ADVANCE_BONUS,
        ],
      },
      points: { gt: 0 },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const t of availableEarn) {
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
            ? LoyaltyTransactionStatus.REVERSED
            : t.status,
      },
    });
  }

  const pendingEarn = await db.loyaltyTransaction.findMany({
    where: {
      customerId: input.customerId,
      orderId: input.orderId,
      status: LoyaltyTransactionStatus.PENDING,
      type: {
        in: [
          LoyaltyTransactionType.POINTS_EARNED,
          LoyaltyTransactionType.ADVANCE_BONUS,
        ],
      },
      points: { gt: 0 },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const t of pendingEarn) {
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
            ? LoyaltyTransactionStatus.CANCELLED
            : t.status,
      },
    });
  }

  // Any remainder not covered by live earnings becomes a negative adjustment
  // (customer had already spent the points).
  if (remaining > 0) {
    await db.loyaltyTransaction.create({
      data: {
        customerId: input.customerId,
        orderId: input.orderId,
        invoiceId: input.invoiceId ?? null,
        creditNoteId: input.creditNoteId ?? null,
        returnRequestId: input.returnRequestId ?? null,
        type: LoyaltyTransactionType.POINTS_REVERSED,
        points: -Math.round(remaining * 100) / 100,
        balanceAfter: 0,
        status: LoyaltyTransactionStatus.AVAILABLE,
        reason: input.reason,
        createdAt: new Date(),
      },
    });
  }

  await recomputeWallet(input.customerId, db);
  return reversePoints;
}

/**
 * Convenience hook for return flows: reverses points proportionally using the
 * original order's earned points and invoice taxable, given a returned value.
 */
export async function reverseForReturn(input: {
  customerId: string;
  orderId: string;
  invoiceId?: string | null;
  returnRequestId?: string | null;
  returnedTaxable: number;
  reason: string;
  db?: TxClient;
}): Promise<number> {
  const db = input.db ?? prisma;

  const earnings = await db.loyaltyTransaction.findMany({
    where: {
      customerId: input.customerId,
      orderId: input.orderId,
      type: {
        in: [
          LoyaltyTransactionType.POINTS_EARNED,
          LoyaltyTransactionType.ADVANCE_BONUS,
        ],
      },
      points: { gt: 0 },
    },
  });
  const pointsEarned = earnings.reduce(
    (sum, t) => sum + (Number(t.points) || 0),
    0
  );
  if (pointsEarned <= 0) return 0;

  // Original taxable base for the order's invoice.
  let originalTaxable = 0;
  if (input.invoiceId) {
    const invoice = await db.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { taxableAmount: true },
    });
    originalTaxable = Number(invoice?.taxableAmount) || 0;
  }
  if (originalTaxable <= 0) return 0;

  return reverseOrderLoyalty({
    customerId: input.customerId,
    orderId: input.orderId,
    invoiceId: input.invoiceId ?? null,
    returnRequestId: input.returnRequestId ?? null,
    originalTaxable,
    returnedTaxable: Math.min(input.returnedTaxable, originalTaxable),
    pointsEarned,
    reason: input.reason,
    db,
  });
}
