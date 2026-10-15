/**
 * RW-06 reports blocked on missing historical data — not client wording alone.
 * Ready Stock Orders is implemented; Profit & Margin stays deferred until
 * invoice-line historical COGS exists (see profit-cogs.ts).
 */

export type DeferredReport = {
  key: string;
  title: string;
  category: "financial" | "orders" | "inventory" | "power";
  phase: 1 | 2 | 4;
  blockedOn: string;
};

export const DEFERRED_REPORTS: DeferredReport[] = [
  {
    key: "profit-margin",
    title: "Profit & Margin Report",
    category: "financial",
    phase: 2,
    blockedOn:
      "Historical COGS is not on InvoiceLine (no unitCost/cogsAmount). Gross Profit = Net Sales − actual historical COGS cannot be computed without inventing cost. Current catalog costPrice and same-period purchases are rejected as substitutes. Propose persisting cost at invoice issue (and optional lot layers from RW-08 receipts) before enabling this report.",
  },
];
