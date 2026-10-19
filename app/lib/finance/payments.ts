import {
  InvoiceStatus,
  PaymentClaimStatus,
  PaymentMode,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { nextPaymentNumber } from "./invoice-number";
import { postCustomerLedgerPayment } from "./customer-ledger";
import { postCustomerPaymentJournal } from "./journal";
import { lockInvoicesForUpdate } from "./invoice-locks";
import { resolvePaymentClaimItemAllocations } from "./payment-claim-allocation";
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

type PaymentCreateResult = {
  id: string;
  paymentNumber: string;
  amount: unknown;
};

async function recordCustomerPaymentInTx(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    amount: number;
    mode: PaymentMode;
    reference?: string | null;
    notes?: string | null;
    paidAt?: Date;
    recordedById?: string | null;
    claimId?: string | null;
    allocations?: Array<{ invoiceId: string; amount: number }>;
  }
): Promise<PaymentCreateResult> {
  const amount = roundMoney(input.amount);
  if (amount <= 0) throw new Error("Payment amount must be positive.");

  // Idempotent claim settlement: if this claim already produced a payment, return it.
  if (input.claimId) {
    const existing = await tx.payment.findUnique({
      where: { claimId: input.claimId },
      select: { id: true, paymentNumber: true, amount: true },
    });
    if (existing) return existing;
  }

  const { number: paymentNumber } = await nextPaymentNumber(undefined, tx);

  let remaining = amount;
  const allocationRows: Array<{ invoiceId: string; amount: number }> = [];

  const explicit = input.allocations?.filter((a) => a.amount > 0) ?? [];
  if (explicit.length > 0) {
    // Deterministic FOR UPDATE, then authoritative outstanding re-read.
    await lockInvoicesForUpdate(
      tx,
      explicit.map((a) => a.invoiceId)
    );
    for (const a of explicit) {
      if (remaining <= 0) break;
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
    const openInvoices = await tx.invoice.findMany({
      where: {
        userId: input.customerId,
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        amountOutstanding: { gt: 0 },
      },
      select: { id: true },
    });
    await lockInvoicesForUpdate(
      tx,
      openInvoices.map((i) => i.id)
    );
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
      if (apply <= 0) continue;
      allocationRows.push({ invoiceId: inv.id, amount: apply });
      remaining = roundMoney(remaining - apply);
    }
  }

  const payment = await tx.payment.create({
    data: {
      paymentNumber,
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

  const fullyPaidInvoices: Array<{
    invoiceId: string;
    orderId: string;
    taxableAmount: number;
  }> = [];

  for (const a of allocationRows) {
    // Re-read after FOR UPDATE so concurrent credits cannot race balance math.
    // Outstanding is decremented from the locked row value (credits reduce
    // outstanding without increasing amountPaid — do not recompute as amount−paid).
    const inv = await tx.invoice.findUniqueOrThrow({
      where: { id: a.invoiceId },
    });
    const amountPaid = roundMoney(Number(inv.amountPaid) + a.amount);
    const amountOutstanding = roundMoney(
      Math.max(0, Number(inv.amountOutstanding) - a.amount)
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
  /** Join an existing transaction (claim confirm). */
  tx?: Prisma.TransactionClient;
}) {
  const amount = roundMoney(input.amount);
  if (amount <= 0) throw new Error("Payment amount must be positive.");

  const result = input.tx
    ? await recordCustomerPaymentInTx(input.tx, input)
    : await prisma.$transaction((tx) => recordCustomerPaymentInTx(tx, input));

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

/**
 * Confirm a payment claim atomically with payment posting.
 * Concurrent confirms: row lock + PENDING→CONFIRMED gate; retries return existing payment.
 */
export async function confirmPaymentClaim(input: {
  claimId: string;
  reviewerId: string;
  allocations?: Array<{ invoiceId: string; amount: number }>;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT 1 FROM "PaymentClaim" WHERE id = ${input.claimId} FOR UPDATE
    `;

    const claim = await tx.paymentClaim.findUniqueOrThrow({
      where: { id: input.claimId },
      include: { items: true, payment: true },
    });

    if (claim.status === PaymentClaimStatus.CONFIRMED && claim.payment) {
      return claim.payment;
    }
    if (claim.status !== PaymentClaimStatus.PENDING) {
      throw new Error("Claim is not pending.");
    }

    const allocations =
      input.allocations ??
      (claim.items.length
        ? resolvePaymentClaimItemAllocations({
            claimAmount: Number(claim.amount),
            items: claim.items.map((i) => ({
              invoiceId: i.invoiceId,
              amount: i.amount != null ? Number(i.amount) : null,
            })),
          })
        : undefined);

    const payment = await recordCustomerPaymentInTx(tx, {
      customerId: claim.customerId,
      amount: Number(claim.amount),
      mode: claim.mode,
      reference: claim.reference,
      notes: claim.notes,
      recordedById: input.reviewerId,
      claimId: claim.id,
      allocations,
    });

    await tx.paymentClaim.update({
      where: { id: claim.id },
      data: {
        status: PaymentClaimStatus.CONFIRMED,
        reviewedById: input.reviewerId,
        reviewedAt: new Date(),
      },
    });

    return payment;
  }).then(async (payment) => {
    await recordAuditEvent(prisma, {
      action: AuditAction.PAYMENT_CREATED,
      module: AuditModule.FINANCE,
      entityType: "Payment",
      entityId: payment.id,
      actor: {
        actorType: "HUMAN",
        actorUserId: input.reviewerId,
        actorName: null,
      },
      message: `Confirmed payment claim ${input.claimId} → ${payment.paymentNumber}`,
    }).catch(() => undefined);
    return payment;
  });
}

export async function rejectPaymentClaim(input: {
  claimId: string;
  reviewerId: string;
  reason?: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT 1 FROM "PaymentClaim" WHERE id = ${input.claimId} FOR UPDATE
    `;
    const claim = await tx.paymentClaim.findUniqueOrThrow({
      where: { id: input.claimId },
    });
    if (claim.status !== PaymentClaimStatus.PENDING) {
      throw new Error("Claim is not pending.");
    }
    return tx.paymentClaim.update({
      where: { id: input.claimId },
      data: {
        status: PaymentClaimStatus.REJECTED,
        reviewedById: input.reviewerId,
        reviewedAt: new Date(),
        rejectReason: input.reason,
      },
    });
  });
}

export { PaymentMode };
