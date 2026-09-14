import { PartyLedgerEntryType, type Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { roundMoney } from "./tax-calc";

type Tx = Prisma.TransactionClient | typeof prisma;

async function currentBalance(customerId: string, tx: Tx): Promise<number> {
  const last = await tx.customerLedgerEntry.findFirst({
    where: { customerId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    select: { balanceAfter: true },
  });
  return Number(last?.balanceAfter ?? 0);
}

export async function postCustomerLedgerInvoice(input: {
  customerId: string;
  invoiceId: string;
  amount: number;
  description: string;
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
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
}

export async function postCustomerLedgerPayment(input: {
  customerId: string;
  paymentId: string;
  amount: number;
  description: string;
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
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
}

export async function postCustomerLedgerCreditNote(input: {
  customerId: string;
  creditNoteId: string;
  invoiceId?: string | null;
  amount: number;
  description: string;
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
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
}
