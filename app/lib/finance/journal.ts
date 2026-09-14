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

  const { number } = await nextJournalNumber();
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

  const { number } = await nextJournalNumber();
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

  const { number } = await nextJournalNumber();
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
