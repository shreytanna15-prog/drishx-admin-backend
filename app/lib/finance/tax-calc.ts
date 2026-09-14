/** GST line/tax calculation with consistent rounding. */

export type TaxLineInput = {
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  gstRatePercent: number;
};

export type TaxLineResult = {
  grossAmount: number;
  discountAmount: number;
  taxableAmount: number;
  gstRatePercent: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
};

export type TaxInvoiceTotals = {
  grossAmount: number;
  discountAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundingAdjustment: number;
  grandTotal: number;
  lines: TaxLineResult[];
};

/** Round to 2 decimal places (paise). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateTaxLine(
  input: TaxLineInput,
  isInterState: boolean
): TaxLineResult {
  const qty = Number(input.quantity) || 0;
  const rate = Number(input.unitPrice) || 0;
  const discount = roundMoney(Number(input.discountAmount) || 0);
  const gross = roundMoney(qty * rate);
  const taxable = roundMoney(Math.max(0, gross - discount));
  const gstRate = Number(input.gstRatePercent) || 0;
  const gstTotal = roundMoney((taxable * gstRate) / 100);

  if (isInterState) {
    return {
      grossAmount: gross,
      discountAmount: discount,
      taxableAmount: taxable,
      gstRatePercent: gstRate,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: gstTotal,
      lineTotal: roundMoney(taxable + gstTotal),
    };
  }

  const half = roundMoney(gstTotal / 2);
  const otherHalf = roundMoney(gstTotal - half);
  return {
    grossAmount: gross,
    discountAmount: discount,
    taxableAmount: taxable,
    gstRatePercent: gstRate,
    cgstAmount: half,
    sgstAmount: otherHalf,
    igstAmount: 0,
    lineTotal: roundMoney(taxable + gstTotal),
  };
}

export function calculateInvoiceTotals(
  lines: TaxLineInput[],
  isInterState: boolean
): TaxInvoiceTotals {
  const computed = lines.map((l) => calculateTaxLine(l, isInterState));
  const taxableAmount = roundMoney(
    computed.reduce((s, l) => s + l.taxableAmount, 0)
  );
  const discountAmount = roundMoney(
    computed.reduce((s, l) => s + l.discountAmount, 0)
  );
  const grossAmount = roundMoney(
    computed.reduce((s, l) => s + l.grossAmount, 0)
  );
  const cgstAmount = roundMoney(
    computed.reduce((s, l) => s + l.cgstAmount, 0)
  );
  const sgstAmount = roundMoney(
    computed.reduce((s, l) => s + l.sgstAmount, 0)
  );
  const igstAmount = roundMoney(
    computed.reduce((s, l) => s + l.igstAmount, 0)
  );
  const rawTotal = roundMoney(
    taxableAmount + cgstAmount + sgstAmount + igstAmount
  );
  const grandTotal = roundMoney(rawTotal);
  const roundingAdjustment = roundMoney(grandTotal - rawTotal);

  return {
    grossAmount,
    discountAmount,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    roundingAdjustment,
    grandTotal,
    lines: computed,
  };
}
