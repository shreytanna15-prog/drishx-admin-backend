import {
  InvoiceStatus,
  PaymentClaimStatus,
  PaymentMode,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { nextPaymentNumber } from "./invoice-number";
import { postCustomerLedgerPayment } from "./customer-ledger";
import { postCustomerPaymentJournal } from "./journal";
import { roundMoney } from "./tax-calc";
import { earnPointsOnPayment } from "@/app/lib/loyalty/earn-on-payment";
import {
  AuditAction,
  AuditModule,
  recordAuditEvent,
} from "@/app/lib/audit";

function invoicePaidStatus(outstanding: number, total: number): InvoiceStatus {
  if (outstanding <= 0.009) return InvoiceStatus.PAID;
  if (outstanding < total - 0.009) return InvoiceStatus.PARTIALLY_PAID;
  return InvoiceStatus.ISSUED;
}

export async function recordCustomerPayment(input: {
  customerId: string;
  amount: number;
  mode: PaymentMode;
  reference?: string | null;
  notes?: string | null;
  paidAt?: Date;
  recordedById?: string | null;
  claimId?: string | null;
  /** invoiceId → amount to allocate */
  allocations?: Array<{ invoiceId: string; amount: number }>;
  auditActorUserId?: string | null;
}) {
  const amount = roundMoney(input.amount);
  if (amount <= 0) throw new Error("Payment amount must be positive.");

  const { number: paymentNumber } = await nextPaymentNumber();

  const result = await prisma.$transaction(async (tx) => {
    let remaining = amount;
    const allocationRows: Array<{ invoiceId: string; amount: number }> = [];

    const explicit = input.allocations?.filter((a) => a.amount > 0) ?? [];
    if (explicit.length > 0) {
      for (const a of explicit) {
        const inv = await tx.invoice.findFirst({
          where: { id: a.invoiceId, userId: input.customerId },
        });
        if (!inv) throw new Error(`Invoice not found: ${a.invoiceId}`);
        const apply = roundMoney(
          Math.min(a.amount, Number(inv.amountOutstanding), remaining)
        );
        if (apply <= 0) continue;
        allocationRows.push({ invoiceId: inv.id, amount: apply });
        remaining = roundMoney(remaining - apply);
      }
    } else {
      // Auto-allocate FIFO to outstanding invoices
      const invoices = await tx.invoice.findMany({
        where: {
          userId: input.customerId,
          status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
          amountOutstanding: { gt: 0 },
        },
        orderBy: { issuedAt: "asc" },
      });
      for (const inv of invoices) {
        if (remaining <= 0) break;
        const apply = roundMoney(
          Math.min(Number(inv.amountOutstanding), remaining)
        );
        allocationRows.push({ invoiceId: inv.id, amount: apply });
        remaining = roundMoney(remaining - apply);
      }
    }

    const payment = await tx.payment.create({
      data: {
        paymentNumber: paymentNumber,
        customerId: input.customerId,
        amount,
        mode: input.mode,
        reference: input.reference ?? undefined,
        notes: input.notes ?? undefined,
        paidAt: input.paidAt ?? new Date(),
        unallocatedAmount: remaining,
        claimId: input.claimId ?? undefined,
        recordedById: input.recordedById ?? undefined,
        allocations: {
          create: allocationRows.map((a) => ({
            invoiceId: a.invoiceId,
            amount: a.amount,
          })),
        },
      },
    });

    const fullyPaidInvoices: Array<{ invoiceId: string; orderId: string; taxableAmount: number }> = [];

    for (const a of allocationRows) {
      const inv = await tx.invoice.findUniqueOrThrow({
        where: { id: a.invoiceId },
      });
      const amountPaid = roundMoney(Number(inv.amountPaid) + a.amount);
      const amountOutstanding = roundMoney(
        Math.max(0, Number(inv.amount) - amountPaid)
      );
      const newStatus = invoicePaidStatus(
        amountOutstanding,
        Number(inv.amount)
      );
      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          amountPaid,
          amountOutstanding,
          status: newStatus,
        },
      });

      // Track invoices that just became fully paid for loyalty earning.
      if (newStatus === "PAID" && inv.status !== "PAID") {
        fullyPaidInvoices.push({
          invoiceId: inv.id,
          orderId: inv.orderId,
          taxableAmount: Number(inv.taxableAmount),
        });
      }
    }

    await postCustomerLedgerPayment({
      customerId: input.customerId,
      paymentId: payment.id,
      amount,
      description: `Payment ${paymentNumber}`,
      tx,
    });

    await postCustomerPaymentJournal({
      paymentId: payment.id,
      amount,
      mode: input.mode,
      tx,
    });

    // Earnings: award pending loyalty points for each invoice fully settled by
    // this payment. Rate reflects whether the order was already COMPLETED at
    // payment time (full/on-time) or paid in advance.
    if (fullyPaidInvoices.length > 0) {
      for (const inv of fullyPaidInvoices) {
        const order = await tx.order.findUnique({
          where: { id: inv.orderId },
          select: { status: true },
        });
        const rateKind =
          order && order.status === "COMPLETED" ? "full" : "advance";
        await earnPointsOnPayment({
          customerId: input.customerId,
          orderId: inv.orderId,
          invoiceId: inv.invoiceId,
          taxableAmount: inv.taxableAmount,
          rateKind,
          db: tx,
        });
      }
    }

    return payment;
  });

  await recordAuditEvent(prisma, {
    action: AuditAction.PAYMENT_CREATED,
    module: AuditModule.FINANCE,
    entityType: "Payment",
    entityId: result.id,
    actor: {
      actorType: "HUMAN",
      actorUserId: input.auditActorUserId ?? input.recordedById ?? null,
      actorName: null,
    },
    message: `Recorded payment ${result.paymentNumber} for ₹${amount}`,
  }).catch(() => undefined);

  return result;
}

export async function submitPaymentClaim(input: {
  customerId: string;
  amount: number;
  mode: PaymentMode;
  reference?: string | null;
  notes?: string | null;
  invoiceIds?: string[];
}) {
  const amount = roundMoney(input.amount);
  if (amount <= 0) throw new Error("Amount must be positive.");

  if (input.invoiceIds?.length) {
    const count = await prisma.invoice.count({
      where: { id: { in: input.invoiceIds }, userId: input.customerId },
    });
    if (count !== input.invoiceIds.length) {
      throw new Error("One or more invoices do not belong to this customer.");
    }
  }

  return prisma.paymentClaim.create({
    data: {
      customerId: input.customerId,
      amount,
      mode: input.mode,
      reference: input.reference ?? undefined,
      notes: input.notes ?? undefined,
      items: input.invoiceIds?.length
        ? {
            create: input.invoiceIds.map((invoiceId) => ({ invoiceId })),
          }
        : undefined,
    },
    include: { items: true },
  });
}

export async function confirmPaymentClaim(input: {
  claimId: string;
  reviewerId: string;
  allocations?: Array<{ invoiceId: string; amount: number }>;
}) {
  const claim = await prisma.paymentClaim.findUniqueOrThrow({
    where: { id: input.claimId },
    include: { items: true },
  });
  if (claim.status !== PaymentClaimStatus.PENDING) {
    throw new Error("Claim is not pending.");
  }

  const allocations =
    input.allocations ??
    (claim.items.length
      ? claim.items.map((i) => ({
          invoiceId: i.invoiceId,
          amount: Number(i.amount ?? claim.amount) / claim.items.length,
        }))
      : undefined);

  const payment = await recordCustomerPayment({
    customerId: claim.customerId,
    amount: Number(claim.amount),
    mode: claim.mode,
    reference: claim.reference,
    notes: claim.notes,
    recordedById: input.reviewerId,
    claimId: claim.id,
    allocations,
    auditActorUserId: input.reviewerId,
  });

  await prisma.paymentClaim.update({
    where: { id: claim.id },
    data: {
      status: PaymentClaimStatus.CONFIRMED,
      reviewedById: input.reviewerId,
      reviewedAt: new Date(),
    },
  });

  return payment;
}

export async function rejectPaymentClaim(input: {
  claimId: string;
  reviewerId: string;
  reason?: string;
}) {
  return prisma.paymentClaim.update({
    where: { id: input.claimId },
    data: {
      status: PaymentClaimStatus.REJECTED,
      reviewedById: input.reviewerId,
      reviewedAt: new Date(),
      rejectReason: input.reason,
    },
  });
}

export { PaymentMode };
