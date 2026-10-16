/**
 * Pure invoice pricing from an order's pair unit price + piece quantity.
 * Used by createInvoiceFromOrder (future issuances only) and unit tests.
 * Does not read or write the database.
 */

import { invoiceLineFromPairPrice } from "@/app/lib/lens-pricing";
import {
  calculateInvoiceTotals,
  roundMoney,
  type TaxInvoiceTotals,
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
 * Build tax totals for a retail/wholesale catalog order that uses pair pricing.
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
