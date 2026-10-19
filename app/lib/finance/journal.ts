import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { nextJournalNumber } from "./invoice-number";

const CODES = {
  cash: "1000",
  bank: "1010",
  ar: "1100",
  inventory: "1200",
  inputGst: "1300",
  ap: "2000",
  outputGst: "2100",
  sales: "4000",
  cogs: "5000",
  opex: "5100",
} as const;

async function accountIdByCode(code: string, tx: Prisma.TransactionClient | typeof prisma) {
  const acc = await tx.chartAccount.findUnique({ where: { code } });
  return acc?.id ?? null;
}

export async function postSalesInvoiceJournal(input: {
  invoiceId: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
  const arId = await accountIdByCode(CODES.ar, db);
  const salesId = await accountIdByCode(CODES.sales, db);
  const gstId = await accountIdByCode(CODES.outputGst, db);
  if (!arId || !salesId || !gstId) return;

  const { number } = await nextJournalNumber(undefined, db);
  const outputGst = input.cgst + input.sgst + input.igst;

  await db.journalEntry.create({
    data: {
      entryNumber: number,
      memo: `Sales invoice ${input.invoiceId}`,
      sourceType: "INVOICE",
      sourceId: input.invoiceId,
      lines: {
        create: [
          {
            accountId: arId,
            debitAmount: input.total,
            creditAmount: 0,
            description: "Accounts receivable",
          },
          {
            accountId: salesId,
            debitAmount: 0,
            creditAmount: input.taxable,
            description: "Sales",
          },
          {
            accountId: gstId,
            debitAmount: 0,
            creditAmount: outputGst,
            description: "Output GST",
          },
        ],
      },
    },
  });
}

/**
 * Reverse a sales invoice journal (AR / Sales / Output GST) when voiding an unpaid invoice.
 * Mirrors postSalesInvoiceJournal with debit/credit flipped; no-ops if chart accounts missing.
 */
export async function postSalesInvoiceVoidJournal(input: {
  invoiceId: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
  const arId = await accountIdByCode(CODES.ar, db);
  const salesId = await accountIdByCode(CODES.sales, db);
  const gstId = await accountIdByCode(CODES.outputGst, db);
  if (!arId || !salesId || !gstId) return;

  const { number } = await nextJournalNumber(undefined, db);
  const outputGst = input.cgst + input.sgst + input.igst;

  await db.journalEntry.create({
    data: {
      entryNumber: number,
      memo: `Void sales invoice ${input.invoiceId}`,
      sourceType: "INVOICE_VOID",
      sourceId: input.invoiceId,
      lines: {
        create: [
          {
            accountId: salesId,
            debitAmount: input.taxable,
            creditAmount: 0,
            description: "Sales reversal",
          },
          {
            accountId: gstId,
            debitAmount: outputGst,
            creditAmount: 0,
            description: "Output GST reversal",
          },
          {
            accountId: arId,
            debitAmount: 0,
            creditAmount: input.total,
            description: "Accounts receivable reversal",
          },
        ],
      },
    },
  });
}

const JOURNAL_MONEY_EPS = 0.009;

/**
 * Post only the financial delta from an unpaid invoice pricing edit.
 * Positive components increase AR / sales / output GST (same orientation as issue);
 * negative components reverse. No-ops when all deltas are negligible.
 */
export async function postSalesInvoiceAdjustmentJournal(input: {
  invoiceId: string;
  deltaTaxable: number;
  deltaCgst: number;
  deltaSgst: number;
  deltaIgst: number;
  deltaTotal: number;
  tx?: Prisma.TransactionClient | typeof prisma;
}): Promise<{ posted: boolean }> {
  const db = input.tx ?? prisma;
  const dTaxable = Number(input.deltaTaxable) || 0;
  const dCgst = Number(input.deltaCgst) || 0;
  const dSgst = Number(input.deltaSgst) || 0;
  const dIgst = Number(input.deltaIgst) || 0;
  const dTotal = Number(input.deltaTotal) || 0;
  const dGst = dCgst + dSgst + dIgst;

  if (
    Math.abs(dTotal) <= JOURNAL_MONEY_EPS &&
    Math.abs(dTaxable) <= JOURNAL_MONEY_EPS &&
    Math.abs(dGst) <= JOURNAL_MONEY_EPS
  ) {
    return { posted: false };
  }

  const arId = await accountIdByCode(CODES.ar, db);
  const salesId = await accountIdByCode(CODES.sales, db);
  const gstId = await accountIdByCode(CODES.outputGst, db);
  if (!arId || !salesId || !gstId) return { posted: false };

  const lines: Array<{
    accountId: string;
    debitAmount: number;
    creditAmount: number;
    description: string;
  }> = [];

  if (Math.abs(dTotal) > JOURNAL_MONEY_EPS) {
    lines.push({
      accountId: arId,
      debitAmount: dTotal > 0 ? Math.abs(dTotal) : 0,
      creditAmount: dTotal < 0 ? Math.abs(dTotal) : 0,
      description: "Accounts receivable adjustment",
    });
  }
  if (Math.abs(dTaxable) > JOURNAL_MONEY_EPS) {
    lines.push({
      accountId: salesId,
      debitAmount: dTaxable < 0 ? Math.abs(dTaxable) : 0,
      creditAmount: dTaxable > 0 ? Math.abs(dTaxable) : 0,
      description: "Sales adjustment",
    });
  }
  if (Math.abs(dGst) > JOURNAL_MONEY_EPS) {
    lines.push({
      accountId: gstId,
      debitAmount: dGst < 0 ? Math.abs(dGst) : 0,
      creditAmount: dGst > 0 ? Math.abs(dGst) : 0,
      description: "Output GST adjustment",
    });
  }
  if (lines.length === 0) return { posted: false };

  const { number } = await nextJournalNumber(undefined, db);
  await db.journalEntry.create({
    data: {
      entryNumber: number,
      memo: `Invoice pricing adjustment ${input.invoiceId}`,
      sourceType: "INVOICE_ADJUST",
      sourceId: input.invoiceId,
      lines: { create: lines },
    },
  });
  return { posted: true };
}

export async function postCustomerPaymentJournal(input: {
  paymentId: string;
  amount: number;
  mode: string;
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
  const arId = await accountIdByCode(CODES.ar, db);
  const cashCode = input.mode === "BANK" || input.mode === "UPI" ? CODES.bank : CODES.cash;
  const cashId = await accountIdByCode(cashCode, db);
  if (!arId || !cashId) return;

  const { number } = await nextJournalNumber(undefined, db);
  await db.journalEntry.create({
    data: {
      entryNumber: number,
      memo: `Customer payment ${input.paymentId}`,
      sourceType: "PAYMENT",
      sourceId: input.paymentId,
      lines: {
        create: [
          {
            accountId: cashId,
            debitAmount: input.amount,
            creditAmount: 0,
          },
          {
            accountId: arId,
            debitAmount: 0,
            creditAmount: input.amount,
          },
        ],
      },
    },
  });
}

export async function postPurchaseBillJournal(input: {
  billId: string;
  taxable: number;
  inputGst: number;
  total: number;
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
  const invId = await accountIdByCode(CODES.inventory, db);
  const gstId = await accountIdByCode(CODES.inputGst, db);
  const apId = await accountIdByCode(CODES.ap, db);
  if (!invId || !gstId || !apId) return;

  const { number } = await nextJournalNumber(undefined, db);
  await db.journalEntry.create({
    data: {
      entryNumber: number,
      memo: `Purchase bill ${input.billId}`,
      sourceType: "PURCHASE_BILL",
      sourceId: input.billId,
      lines: {
        create: [
          { accountId: invId, debitAmount: input.taxable, creditAmount: 0 },
          { accountId: gstId, debitAmount: input.inputGst, creditAmount: 0 },
          { accountId: apId, debitAmount: 0, creditAmount: input.total },
        ],
      },
    },
  });
}
