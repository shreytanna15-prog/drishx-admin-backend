import { PartyLedgerEntryType, type Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { roundMoney } from "./tax-calc";

type Tx = Prisma.TransactionClient | typeof prisma;

const LEDGER_MONEY_EPS = 0.009;

/**
 * Serialize customer ledger posts by locking the User row (transaction-scoped).
 * Prevents concurrent balanceAfter races on the running-balance chain.
 */
async function lockCustomerLedger(customerId: string, tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${customerId} FOR UPDATE`;
}

async function currentBalance(customerId: string, tx: Tx): Promise<number> {
  const last = await tx.customerLedgerEntry.findFirst({
    where: { customerId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    select: { balanceAfter: true },
  });
  return Number(last?.balanceAfter ?? 0);
}

async function withLedgerLock<T>(
  customerId: string,
  tx: Prisma.TransactionClient | undefined,
  fn: (db: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (tx) {
    await lockCustomerLedger(customerId, tx);
    return fn(tx);
  }
  return prisma.$transaction(async (inner) => {
    await lockCustomerLedger(customerId, inner);
    return fn(inner);
  });
}

export async function postCustomerLedgerInvoice(input: {
  customerId: string;
  invoiceId: string;
  amount: number;
  description: string;
  tx?: Prisma.TransactionClient;
}) {
  await withLedgerLock(input.customerId, input.tx, async (db) => {
    const prev = await currentBalance(input.customerId, db);
    const balanceAfter = roundMoney(prev + input.amount);
    await db.customerLedgerEntry.create({
      data: {
        customerId: input.customerId,
        entryType: PartyLedgerEntryType.INVOICE,
        debitAmount: input.amount,
        creditAmount: 0,
        balanceAfter,
        description: input.description,
        invoiceId: input.invoiceId,
      },
    });
  });
}

export async function postCustomerLedgerPayment(input: {
  customerId: string;
  paymentId: string;
  amount: number;
  description: string;
  tx?: Prisma.TransactionClient;
}) {
  await withLedgerLock(input.customerId, input.tx, async (db) => {
    const prev = await currentBalance(input.customerId, db);
    const balanceAfter = roundMoney(prev - input.amount);
    await db.customerLedgerEntry.create({
      data: {
        customerId: input.customerId,
        entryType: PartyLedgerEntryType.PAYMENT,
        debitAmount: 0,
        creditAmount: input.amount,
        balanceAfter,
        description: input.description,
        paymentId: input.paymentId,
      },
    });
  });
}

export async function postCustomerLedgerCreditNote(input: {
  customerId: string;
  creditNoteId: string;
  invoiceId?: string | null;
  amount: number;
  description: string;
  tx?: Prisma.TransactionClient;
}) {
  await withLedgerLock(input.customerId, input.tx, async (db) => {
    const prev = await currentBalance(input.customerId, db);
    const balanceAfter = roundMoney(prev - input.amount);
    await db.customerLedgerEntry.create({
      data: {
        customerId: input.customerId,
        entryType: PartyLedgerEntryType.CREDIT_NOTE,
        debitAmount: 0,
        creditAmount: input.amount,
        balanceAfter,
        description: input.description,
        creditNoteId: input.creditNoteId,
        invoiceId: input.invoiceId ?? undefined,
      },
    });
  });
}

/** Credit AR for invoice void / cancellation (mirrors invoice debit). */
export async function postCustomerLedgerAdjustment(input: {
  customerId: string;
  invoiceId: string;
  amount: number;
  description: string;
  tx?: Prisma.TransactionClient;
}) {
  const amount = roundMoney(input.amount);
  if (amount <= 0) return;
  await withLedgerLock(input.customerId, input.tx, async (db) => {
    const prev = await currentBalance(input.customerId, db);
    const balanceAfter = roundMoney(prev - amount);
    await db.customerLedgerEntry.create({
      data: {
        customerId: input.customerId,
        entryType: PartyLedgerEntryType.ADJUSTMENT,
        debitAmount: 0,
        creditAmount: amount,
        balanceAfter,
        description: input.description,
        invoiceId: input.invoiceId,
      },
    });
  });
}

/**
 * Phase F — refund payout clears customer credit from voided paid invoice.
 * Debit AR (or reduce credit balance) by the cash returned to the customer.
 */
export async function postCustomerLedgerRefundPayout(input: {
  customerId: string;
  amount: number;
  description: string;
  invoiceId?: string | null;
  tx?: Prisma.TransactionClient;
}) {
  const amount = roundMoney(input.amount);
  if (amount <= 0) return;
  await withLedgerLock(input.customerId, input.tx, async (db) => {
    const prev = await currentBalance(input.customerId, db);
    const balanceAfter = roundMoney(prev + amount);
    await db.customerLedgerEntry.create({
      data: {
        customerId: input.customerId,
        entryType: PartyLedgerEntryType.ADJUSTMENT,
        debitAmount: amount,
        creditAmount: 0,
        balanceAfter,
        description: input.description,
        invoiceId: input.invoiceId ?? undefined,
      },
    });
  });
}

/**
 * Apply the financial delta from an unpaid invoice pricing correction.
 * Positive delta increases AR (debit); negative decreases AR (credit).
 * No-ops when |delta| is negligible (idempotent re-sync).
 */
export async function postCustomerLedgerInvoiceDelta(input: {
  customerId: string;
  invoiceId: string;
  /** New grand total − previous grand total. */
  amountDelta: number;
  description: string;
  tx?: Tx;
}) {
  const delta = roundMoney(input.amountDelta);
  if (Math.abs(delta) <= LEDGER_MONEY_EPS) return;

  const outerTx =
    input.tx && input.tx !== prisma
      ? (input.tx as Prisma.TransactionClient)
      : undefined;

  await withLedgerLock(input.customerId, outerTx, async (db) => {
    const prev = await currentBalance(input.customerId, db);
    if (delta > 0) {
      const balanceAfter = roundMoney(prev + delta);
      await db.customerLedgerEntry.create({
        data: {
          customerId: input.customerId,
          entryType: PartyLedgerEntryType.ADJUSTMENT,
          debitAmount: delta,
          creditAmount: 0,
          balanceAfter,
          description: input.description,
          invoiceId: input.invoiceId,
        },
      });
      return;
    }

    const credit = roundMoney(-delta);
    const balanceAfter = roundMoney(prev - credit);
    await db.customerLedgerEntry.create({
      data: {
        customerId: input.customerId,
        entryType: PartyLedgerEntryType.ADJUSTMENT,
        debitAmount: 0,
        creditAmount: credit,
        balanceAfter,
        description: input.description,
        invoiceId: input.invoiceId,
      },
    });
  });
}
