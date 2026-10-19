import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getFinancialYear } from "./financial-year";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Allocate next document number: INV/26-27/000001
 * When `db` is a transaction client, allocation joins that transaction (rollback-safe).
 * Locks the sequence row so concurrent allocators cannot collide.
 */
export async function nextDocumentNumber(
  prefix: string,
  date: Date = new Date(),
  db: Db = prisma
): Promise<{ number: string; financialYear: string }> {
  const financialYear = getFinancialYear(date);
  const seqId = `${prefix}:${financialYear}`;

  const allocate = async (tx: Prisma.TransactionClient) => {
    // Advisory lock covers first-insert races when the sequence row does not exist yet.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${seqId}))`;

    const existing = await tx.invoiceSequence.findUnique({
      where: { id: seqId },
    });
    if (!existing) {
      await tx.invoiceSequence.create({
        data: {
          id: seqId,
          financialYear,
          prefix,
          nextValue: 2,
        },
      });
      return 1;
    }
    const current = existing.nextValue;
    await tx.invoiceSequence.update({
      where: { id: seqId },
      data: { nextValue: current + 1 },
    });
    return current;
  };

  // Nested interactive transaction when caller already holds a tx is unsupported —
  // run allocation on the provided client directly.
  const isRootPrisma = db === prisma;
  const seq = isRootPrisma
    ? await prisma.$transaction((tx) => allocate(tx))
    : await allocate(db as Prisma.TransactionClient);

  const padded = String(seq).padStart(6, "0");
  return {
    number: `${prefix}/${financialYear}/${padded}`,
    financialYear,
  };
}

export async function nextInvoiceNumber(date?: Date, db: Db = prisma) {
  const settings = await (db === prisma ? prisma : db).companyFinanceSettings.findUnique({
    where: { id: "default" },
  });
  const prefix = settings?.invoiceSeriesPrefix || "INV";
  return nextDocumentNumber(prefix, date, db);
}

export async function nextPaymentNumber(date?: Date, db: Db = prisma) {
  return nextDocumentNumber("RCPT", date, db);
}

export async function nextPurchaseBillNumber(date?: Date, db: Db = prisma) {
  const settings = await (db === prisma ? prisma : db).companyFinanceSettings.findUnique({
    where: { id: "default" },
  });
  const prefix = settings?.purchaseBillPrefix || "PB";
  return nextDocumentNumber(prefix, date, db);
}

export async function nextSupplierPaymentNumber(date?: Date, db: Db = prisma) {
  return nextDocumentNumber("SPAY", date, db);
}

export async function nextJournalNumber(date?: Date, db: Db = prisma) {
  return nextDocumentNumber("JE", date, db);
}

/** Credit notes use company creditNotePrefix (default CN) on the shared InvoiceSequence. */
export async function nextCreditNoteNumber(date?: Date, db: Db = prisma) {
  const settings = await (db === prisma ? prisma : db).companyFinanceSettings.findUnique({
    where: { id: "default" },
  });
  const prefix = settings?.creditNotePrefix || "CN";
  return nextDocumentNumber(prefix, date, db);
}
