/**
 * Profit & Margin — historical COGS availability check.
 *
 * Gross Profit = Net Sales − Actual historical COGS
 * Gross Margin % = Gross Profit / Net Sales × 100
 *
 * InvoiceLine stores selling amounts only (no historical unit cost / COGS).
 * Current catalog costPrice must never be used as a silent substitute.
 * Period purchases must never be used as COGS for period sales.
 */

export type ProfitCogsBlocker =
  | "INVOICE_LINE_MISSING_HISTORICAL_COST"
  | "NO_LOT_LEVEL_COGS_LEDGER"
  | "CURRENT_COST_PRICE_FORBIDDEN_AS_SUBSTITUTE"
  | "PERIOD_PURCHASES_ARE_NOT_COGS";

export type ProfitCogsAvailability = {
  canComputeGrossProfit: false;
  canComputeGrossMargin: false;
  netSalesSupported: true;
  blockers: ProfitCogsBlocker[];
  explanation: string;
  /** Future schema proposal — do not migrate without approval. */
  proposedDataForUnblock: string[];
};

export function assessProfitCogsAvailability(): ProfitCogsAvailability {
  return {
    canComputeGrossProfit: false,
    canComputeGrossMargin: false,
    netSalesSupported: true,
    blockers: [
      "INVOICE_LINE_MISSING_HISTORICAL_COST",
      "NO_LOT_LEVEL_COGS_LEDGER",
      "CURRENT_COST_PRICE_FORBIDDEN_AS_SUBSTITUTE",
      "PERIOD_PURCHASES_ARE_NOT_COGS",
    ],
    explanation:
      "Historical COGS is not stored on invoice lines or a sale-linked cost ledger. Net sales can be calculated from issued invoices (returns/credit notes via existing finance paths), but true gross profit cannot be produced without inventing cost. Current lens costPrice and same-period purchases are intentionally rejected as substitutes.",
    proposedDataForUnblock: [
      "Persist unitCost / cogsAmount on InvoiceLine (or a SaleCostAllocation table) at invoice issue time from the then-current lot/receipt cost.",
      "Optionally maintain lot/FIFO receipt layers (RW-08 Goods Receipt can feed future layers) so remaining-stock cost and sold-item cost stay auditable.",
      "Map credit-note / return lines back to original invoice-line cost for net COGS.",
    ],
  };
}

/** Always deferred until historical COGS exists — never invent figures. */
export function isProfitMarginReportRunnable(): boolean {
  return assessProfitCogsAvailability().canComputeGrossProfit;
}
