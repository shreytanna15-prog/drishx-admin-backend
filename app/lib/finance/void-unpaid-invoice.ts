/**
 * Phase 1 + F: void order invoices on cancel/archive.
 * Paid invoices create OrderRefund (amountDue = amountPaid) then void AR.
 * Credit notes still block (double-refund guard).
 *
 * Pure policy helpers live in void-unpaid-invoice-policy.ts so unit tests
 * do not load prisma / DATABASE_URL.
 */

import { InvoiceStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { postCustomerLedgerAdjustment } from "./customer-ledger";
import { ensureOrderRefundOnCancel } from "./order-refund";
import { postSalesInvoiceVoidJournal } from "./journal";
import { roundMoney } from "./tax-calc";
import {
  VOID_INVOICE_MONEY_EPS,
  invoiceBlocksOrderCancellation,
  shouldApplyInvoiceVoidOnOrderCancel,
  OrderInvoiceCancellationError,
} from "./void-unpaid-invoice-policy";

export {
  invoiceBlocksOrderCancellation,
  shouldApplyInvoiceVoidOnOrderCancel,
  OrderInvoiceCancellationError,
  type InvoiceCancelSettlementSnapshot,
} from "./void-unpaid-invoice-policy";

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Load order invoice and reject cancel/archive when settlement exists.
 * No invoice → allowed.
 */
export async function assertOrderInvoiceAllowsCancellation(
  orderId: string,
  db: Db = prisma
): Promise<{ ok: true } | { ok: false; error: string }> {
  const invoice = await db.invoice.findUnique({
    where: { orderId },
    select: {
      status: true,
      amountPaid: true,
      amountOutstanding: true,
      _count: {
        select: { paymentAllocations: true, creditNotes: true },
      },
    },
  });
  if (!invoice) return { ok: true };

  const block = invoiceBlocksOrderCancellation({
    status: invoice.status,
    amountPaid: Number(invoice.amountPaid),
    amountOutstanding: Number(invoice.amountOutstanding),
    paymentAllocationCount: invoice._count.paymentAllocations,
    creditNoteCount: invoice._count.creditNotes,
  });
  if (block) return { ok: false, error: block };
  return { ok: true };
}

/**
 * Void an unpaid order invoice and reverse AR (customer ledger + sales journal).
 * Idempotent when already VOID/CANCELLED or when no invoice exists.
 * Must run inside the same transaction as the order cancel/archive write.
 */
export async function voidUnpaidInvoiceOnOrderCancel(input: {
  orderId: string;
  reason: string;
  tx: Prisma.TransactionClient;
}): Promise<
  | { voided: false; reason: "no_invoice" | "already_closed" }
  | { voided: true; invoiceId: string; reversedAmount: number }
> {
  const invoice = await input.tx.invoice.findUnique({
    where: { orderId: input.orderId },
    include: {
      _count: {
        select: { paymentAllocations: true, creditNotes: true },
      },
    },
  });
  if (!invoice) return { voided: false, reason: "no_invoice" };

  const block = invoiceBlocksOrderCancellation({
    status: invoice.status,
    amountPaid: Number(invoice.amountPaid),
    amountOutstanding: Number(invoice.amountOutstanding),
    paymentAllocationCount: invoice._count.paymentAllocations,
    creditNoteCount: invoice._count.creditNotes,
  });
  if (block) {
    throw new OrderInvoiceCancellationError(block);
  }

  if (!shouldApplyInvoiceVoidOnOrderCancel(invoice.status)) {
    return { voided: false, reason: "already_closed" };
  }

  // Phase F: paid money becomes OrderRefund DUE before AR void.
  await ensureOrderRefundOnCancel({
    orderId: input.orderId,
    customerId: invoice.userId,
    invoiceAmountPaid: Number(invoice.amountPaid),
    tx: input.tx,
  });

  // Reverse the original AR debit. For paid invoices this creates customer credit
  // equal to amountPaid (payments already credited); payout clears that credit.
  const reversedAmount = roundMoney(Number(invoice.amount));

  await input.tx.invoice.update({
    where: { id: invoice.id },
    data: {
      status: InvoiceStatus.VOID,
      amountOutstanding: 0,
    },
  });

  if (reversedAmount > VOID_INVOICE_MONEY_EPS) {
    await postCustomerLedgerAdjustment({
      customerId: invoice.userId,
      invoiceId: invoice.id,
      amount: reversedAmount,
      description: `Void invoice ${invoice.invoiceNumber}: ${input.reason}`,
      tx: input.tx,
    });

    await postSalesInvoiceVoidJournal({
      invoiceId: invoice.id,
      taxable: Number(invoice.taxableAmount),
      cgst: Number(invoice.cgstAmount),
      sgst: Number(invoice.sgstAmount),
      igst: Number(invoice.igstAmount),
      total: reversedAmount,
      tx: input.tx,
    });
  }

  return { voided: true, invoiceId: invoice.id, reversedAmount };
}
