import { prisma } from "@/app/lib/prisma";
import {
  financialYearBounds,
  getFinancialYear,
} from "@/app/lib/finance/financial-year";
import {
  gstSummaryToReportPayload,
  type GstSummaryResult,
} from "./gst-summary-format";

export type { GstSummaryResult };
export { gstSummaryToReportPayload };

/** Shared GST summary — used by /api/finance/reports and /api/reports. */
export async function computeGstSummary(
  fyInput?: string | null
): Promise<GstSummaryResult> {
  const fy = fyInput?.trim() || getFinancialYear();
  const { start, end } = financialYearBounds(fy);

  const [invoices, purchases] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        issuedAt: { gte: start, lte: end },
        status: { notIn: ["CANCELLED", "VOID"] },
      },
      select: {
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
      },
    }),
    prisma.purchaseBill.findMany({
      where: {
        billDate: { gte: start, lte: end },
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
      select: {
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
      },
    }),
  ]);

  const output = invoices.reduce(
    (acc, i) => {
      acc.taxable += Number(i.taxableAmount);
      acc.cgst += Number(i.cgstAmount);
      acc.sgst += Number(i.sgstAmount);
      acc.igst += Number(i.igstAmount);
      return acc;
    },
    { taxable: 0, cgst: 0, sgst: 0, igst: 0 }
  );
  const input = purchases.reduce(
    (acc, i) => {
      acc.taxable += Number(i.taxableAmount);
      acc.cgst += Number(i.cgstAmount);
      acc.sgst += Number(i.sgstAmount);
      acc.igst += Number(i.igstAmount);
      return acc;
    },
    { taxable: 0, cgst: 0, sgst: 0, igst: 0 }
  );
  const outputGst = output.cgst + output.sgst + output.igst;
  const inputGst = input.cgst + input.sgst + input.igst;

  return {
    financialYear: fy,
    output: { ...output, totalGst: outputGst },
    input: { ...input, totalGst: inputGst },
    netGstPayable: outputGst - inputGst,
  };
}
