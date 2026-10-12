import type { ReportCardsPayload } from "./types";

export type GstSummaryResult = {
  financialYear: string;
  output: {
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalGst: number;
  };
  input: {
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalGst: number;
  };
  netGstPayable: number;
};

export function gstSummaryToReportPayload(
  result: GstSummaryResult
): ReportCardsPayload {
  const money = (n: number) => Math.round(n * 100) / 100;
  return {
    kind: "cards",
    cards: [
      { label: "Output GST", value: money(result.output.totalGst) },
      { label: "Input GST", value: money(result.input.totalGst) },
      { label: "Net GST payable", value: money(result.netGstPayable) },
    ],
    columns: [
      { key: "label", label: "Metric" },
      { key: "taxable", label: "Taxable", align: "right" },
      { key: "cgst", label: "CGST", align: "right" },
      { key: "sgst", label: "SGST", align: "right" },
      { key: "igst", label: "IGST", align: "right" },
      { key: "totalGst", label: "Total GST", align: "right" },
    ],
    rows: [
      {
        label: "Output (sales)",
        taxable: money(result.output.taxable),
        cgst: money(result.output.cgst),
        sgst: money(result.output.sgst),
        igst: money(result.output.igst),
        totalGst: money(result.output.totalGst),
      },
      {
        label: "Input (purchases)",
        taxable: money(result.input.taxable),
        cgst: money(result.input.cgst),
        sgst: money(result.input.sgst),
        igst: money(result.input.igst),
        totalGst: money(result.input.totalGst),
      },
    ],
    summary: {
      financialYear: result.financialYear,
      netGstPayable: money(result.netGstPayable),
    },
    meta: { financialYear: result.financialYear },
  };
}
