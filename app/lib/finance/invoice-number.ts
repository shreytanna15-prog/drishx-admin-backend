import { prisma } from "@/app/lib/prisma";
import { getFinancialYear } from "./financial-year";

/** Allocate next document number: INV/26-27/000001 */
export async function nextDocumentNumber(
  prefix: string,
  date: Date = new Date()
): Promise<{ number: string; financialYear: string }> {
  const financialYear = getFinancialYear(date);
  const seqId = `${prefix}:${financialYear}`;

  const seq = await prisma.$transaction(async (tx) => {
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
  });

  const padded = String(seq).padStart(6, "0");
  return {
    number: `${prefix}/${financialYear}/${padded}`,
    financialYear,
  };
}

export async function nextInvoiceNumber(date?: Date) {
  const settings = await prisma.companyFinanceSettings.findUnique({
    where: { id: "default" },
  });
  const prefix = settings?.invoiceSeriesPrefix || "INV";
  return nextDocumentNumber(prefix, date);
}

export async function nextPaymentNumber(date?: Date) {
  return nextDocumentNumber("RCPT", date);
}

export async function nextPurchaseBillNumber(date?: Date) {
  const settings = await prisma.companyFinanceSettings.findUnique({
    where: { id: "default" },
  });
  const prefix = settings?.purchaseBillPrefix || "PB";
  return nextDocumentNumber(prefix, date);
}

export async function nextSupplierPaymentNumber(date?: Date) {
  return nextDocumentNumber("SPAY", date);
}

export async function nextJournalNumber(date?: Date) {
  return nextDocumentNumber("JE", date);
}
