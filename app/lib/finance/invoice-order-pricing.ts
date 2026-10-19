/**
 * Pure invoice pricing from an order's pair unit price + piece quantity.
 * Used by createInvoiceFromOrder (future issuances only) and unit tests.
 * Does not read or write the database.
 */

import {
  invoiceLineFromPairPrice,
  orderTotalFromPairPrice,
} from "@/app/lib/lens-pricing";
import {
  calculateInvoiceTotals,
  roundMoney,
  type TaxInvoiceTotals,
  type TaxLineInput,
} from "./tax-calc";

export type OrderInvoicePricingInput = {
  /** Catalog / order pair price (Order.unitPrice). */
  pairUnitPrice: number;
  /** Pieces (Order.quantity). */
  pieceQuantity: number;
  /** Absolute ₹ discount (e.g. loyalty) applied to the line before GST. */
  discountAmount?: number;
  gstRatePercent: number;
  isInterState: boolean;
};

export type OrderInvoicePricingResult = {
  /** Piece quantity stored on InvoiceLine.quantity. */
  quantity: number;
  /** Per-piece rate stored on InvoiceLine.unitPrice (pairPrice / 2). */
  unitPrice: number;
  /** Pre-tax gross before discount (matches orderTotalFromPairPrice). */
  lineGross: number;
  totals: TaxInvoiceTotals;
};

/**
 * Build tax totals for a retail catalog order that uses a single pair price.
 * Does not mutate existing invoices.
 */
export function computeInvoicePricingFromOrder(
  input: OrderInvoicePricingInput
): OrderInvoicePricingResult {
  const { quantity, unitPrice, lineGross } = invoiceLineFromPairPrice(
    input.pairUnitPrice,
    input.pieceQuantity
  );
  const discountAmount = roundMoney(Number(input.discountAmount) || 0);
  const totals = calculateInvoiceTotals(
    [
      {
        quantity,
        unitPrice,
        discountAmount,
        gstRatePercent: input.gstRatePercent,
      },
    ],
    input.isInterState
  );

  return { quantity, unitPrice, lineGross, totals };
}

/** One wholesale power line (pair unit price + piece qty). */
export type WholesaleInvoiceLineInput = {
  /** Pair price (WholesaleOrderLineItem.unitPrice). */
  pairUnitPrice: number;
  /** Pieces. */
  pieceQuantity: number;
  powerLabel?: string | null;
  description?: string | null;
};

export type WholesaleInvoicePricingResult = {
  /** Pre-tax gross across all lines (before loyalty discount). */
  lineGross: number;
  /** Piece qty summed across lines. */
  totalQuantity: number;
  totals: TaxInvoiceTotals;
  /** Per invoice-line inputs already converted to per-piece rates. */
  lines: Array<{
    quantity: number;
    unitPrice: number;
    lineGross: number;
    powerLabel: string | null;
    description: string | null;
  }>;
};

/**
 * Invoice pricing from actual wholesale line items (authoritative commercial totals).
 * Loyalty discount is applied to the first positive-gross line (same as single-line path).
 */
export function computeInvoicePricingFromWholesaleLines(input: {
  lines: WholesaleInvoiceLineInput[];
  discountAmount?: number;
  gstRatePercent: number;
  isInterState: boolean;
}): WholesaleInvoicePricingResult {
  const prepared = input.lines
    .map((line) => {
      const conv = invoiceLineFromPairPrice(
        Number(line.pairUnitPrice) || 0,
        Number(line.pieceQuantity) || 0
      );
      return {
        quantity: conv.quantity,
        unitPrice: conv.unitPrice,
        lineGross: conv.lineGross,
        powerLabel: line.powerLabel?.trim() || null,
        description: line.description?.trim() || null,
      };
    })
    .filter((l) => l.quantity > 0);

  const lineGross = roundMoney(
    prepared.reduce((sum, l) => sum + l.lineGross, 0)
  );
  const totalQuantity = prepared.reduce((sum, l) => sum + l.quantity, 0);
  const discountAmount = roundMoney(Number(input.discountAmount) || 0);

  const taxLines: TaxLineInput[] = prepared.map((l, index) => ({
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountAmount: index === 0 ? discountAmount : 0,
    gstRatePercent: input.gstRatePercent,
  }));

  const totals = calculateInvoiceTotals(taxLines, input.isInterState);

  return { lineGross, totalQuantity, totals, lines: prepared };
}

/**
 * Order header pair price for wholesale: first server line price (never cart).
 * Returns 0 when there are no lines.
 */
export function wholesaleHeaderPairUnitPrice(
  lines: Array<{ unitPrice: number }>
): number {
  const first = lines[0];
  if (!first) return 0;
  const n = Number(first.unitPrice);
  return Number.isFinite(n) ? n : 0;
}

/** Sum of pair-priced wholesale line totals (pieces / 2 × pair). */
export function wholesaleLinesCommercialTotal(
  lines: Array<{ unitPrice: number; quantity: number; totalAmount?: number }>
): number {
  return roundMoney(
    lines.reduce((sum, line) => {
      if (line.totalAmount != null && Number.isFinite(Number(line.totalAmount))) {
        return sum + Number(line.totalAmount);
      }
      return (
        sum +
        orderTotalFromPairPrice(Number(line.unitPrice) || 0, Number(line.quantity) || 0)
      );
    }, 0)
  );
}
