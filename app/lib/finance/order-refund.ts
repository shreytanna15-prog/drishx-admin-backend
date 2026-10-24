/**
 * Phase F — OrderRefund create on cancel + payout recording.
 */

import {
  OrderRefundStatus,
  PaymentMode,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { postCustomerLedgerRefundPayout } from "./customer-ledger";
import {
  REFUND_MONEY_EPS,
  computeRefundAmountDue,
  refundStatusAfterPayout,
  remainingRefundDue,
} from "./order-refund-math";
import { roundMoney } from "./tax-calc";

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * After cancel settles a paid invoice, ensure an OrderRefund DUE row exists.
 * Idempotent when refund already exists for the order.
 */
export async function ensureOrderRefundOnCancel(input: {
  orderId: string;
  customerId: string;
  invoiceAmountPaid: number;
  tx: Prisma.TransactionClient;
}): Promise<{ created: boolean; refundId: string | null; amountDue: number }> {
  const amountDue = computeRefundAmountDue(input.invoiceAmountPaid);
  if (amountDue <= REFUND_MONEY_EPS) {
    return { created: false, refundId: null, amountDue: 0 };
  }

  const existing = await input.tx.orderRefund.findUnique({
    where: { orderId: input.orderId },
    select: { id: true },
  });
  if (existing) {
    return { created: false, refundId: existing.id, amountDue };
  }

  const refund = await input.tx.orderRefund.create({
    data: {
      orderId: input.orderId,
      customerId: input.customerId,
      amountDue,
      amountPaid: 0,
      status: OrderRefundStatus.DUE,
    },
  });
  return { created: true, refundId: refund.id, amountDue };
}

export async function getOrderRefundSummary(orderId: string, db: Db = prisma) {
  const refund = await db.orderRefund.findUnique({
    where: { orderId },
    include: {
      payouts: { orderBy: { paidAt: "desc" } },
    },
  });
  if (!refund) return null;
  return {
    id: refund.id,
    orderId: refund.orderId,
    customerId: refund.customerId,
    amountDue: Number(refund.amountDue),
    amountPaid: Number(refund.amountPaid),
    remaining: remainingRefundDue(
      Number(refund.amountDue),
      Number(refund.amountPaid)
    ),
    status: refund.status,
    createdAt: refund.createdAt,
    updatedAt: refund.updatedAt,
    payouts: refund.payouts.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      mode: p.mode,
      paidAt: p.paidAt,
      reference: p.reference,
      notes: p.notes,
      recordedById: p.recordedById,
      createdAt: p.createdAt,
    })),
  };
}

export async function recordOrderRefundPayout(input: {
  orderId: string;
  amount: number;
  mode: PaymentMode;
  paidAt: Date;
  reference?: string | null;
  notes?: string | null;
  recordedById?: string | null;
  tx?: Prisma.TransactionClient;
}) {
  const amount = roundMoney(input.amount);
  if (amount <= REFUND_MONEY_EPS) {
    throw new Error("Payout amount must be greater than zero.");
  }
  if (!Object.values(PaymentMode).includes(input.mode)) {
    throw new Error("Invalid payment mode.");
  }

  const run = async (db: Prisma.TransactionClient) => {
    const refund = await db.orderRefund.findUnique({
      where: { orderId: input.orderId },
    });
    if (!refund) {
      throw new Error("No refund due for this order.");
    }
    if (refund.status === OrderRefundStatus.CANCELLED) {
      throw new Error("Refund was cancelled.");
    }
    if (refund.status === OrderRefundStatus.PAID) {
      throw new Error("Refund is already fully paid.");
    }

    const remaining = remainingRefundDue(
      Number(refund.amountDue),
      Number(refund.amountPaid)
    );
    if (amount > remaining + REFUND_MONEY_EPS) {
      throw new Error(
        `Payout exceeds remaining refund due (${remaining.toFixed(2)}).`
      );
    }

    const payout = await db.orderRefundPayout.create({
      data: {
        refundId: refund.id,
        amount,
        mode: input.mode,
        paidAt: input.paidAt,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        recordedById: input.recordedById ?? null,
      },
    });

    const nextPaid = roundMoney(Number(refund.amountPaid) + amount);
    const nextStatus = refundStatusAfterPayout(
      Number(refund.amountDue),
      nextPaid
    ) as OrderRefundStatus;

    await db.orderRefund.update({
      where: { id: refund.id },
      data: {
        amountPaid: nextPaid,
        status: nextStatus,
      },
    });

    // Clear customer credit created when the invoice was voided on cancel.
    await postCustomerLedgerRefundPayout({
      customerId: refund.customerId,
      amount,
      description: `Refund payout for order ${input.orderId}${
        input.reference ? ` (${input.reference})` : ""
      }`,
      invoiceId: null,
      tx: db,
    });

    return { payoutId: payout.id, amountPaid: nextPaid, status: nextStatus };
  };

  if (input.tx) return run(input.tx);
  return prisma.$transaction(run);
}
