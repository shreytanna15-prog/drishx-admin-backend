import { CustomerTaxType, InvoiceStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getCompanyFinanceSettings, resolveProductTax } from "./company-settings";
import { nextInvoiceNumber } from "./invoice-number";
import { resolvePlaceOfSupply } from "./place-of-supply";
import { roundMoney } from "./tax-calc";
import { computeInvoicePricingFromOrder } from "./invoice-order-pricing";
import { postCustomerLedgerInvoice } from "./customer-ledger";
import { postSalesInvoiceJournal } from "./journal";
import { checkCreditLimitWarning } from "./credit-limit";

export type CreateInvoiceFromOrderInput = {
  orderId: string;
  /** When order is COMPLETED, mark invoice paid. */
  markPaid?: boolean;
  /** Loyalty points redeemed against this order (in ₹). Reduces taxable + GST. */
  loyaltyDiscount?: number;
  tx?: Prisma.TransactionClient;
};

function powerLabel(order: {
  sph?: unknown;
  cyl?: unknown;
  axis?: number | null;
  add?: unknown;
  eye?: string | null;
}): string | null {
  const parts: string[] = [];
  if (order.sph != null) parts.push(`SPH ${order.sph}`);
  if (order.cyl != null) parts.push(`CYL ${order.cyl}`);
  if (order.axis != null) parts.push(`AXIS ${order.axis}`);
  if (order.add != null) parts.push(`ADD ${order.add}`);
  if (order.eye != null && String(order.eye).trim()) {
    parts.push(`Eye ${String(order.eye).trim()}`);
  }
  return parts.length ? parts.join(" / ") : null;
}

function lensLabel(order: {
  lensType: string;
  singleVisionLens?: { brand: string; category?: string | null; item?: string | null } | null;
  kryptokLens?: { brand?: string | null; category?: string | null; item?: string | null } | null;
  progressiveLens?: { brand: string; item: string; category?: string | null } | null;
  bifocalLens?: { brand: string; item: string } | null;
  oriVisionLens?: { brand: string; item?: string | null } | null;
  magnusLens?: { category?: string | null; item?: string | null } | null;
}): { description: string; productName: string | null; lensId: string | null } {
  switch (order.lensType) {
    case "SINGLE_VISION": {
      const l = order.singleVisionLens;
      return {
        description: [l?.category, l?.brand, l?.item].filter(Boolean).join(" — ") || "Single Vision",
        productName: l?.category || l?.brand || null,
        lensId: null,
      };
    }
    case "KRYPTOK": {
      const l = order.kryptokLens;
      return {
        description: [l?.category, l?.brand, l?.item].filter(Boolean).join(" — ") || "Kryptok",
        productName: l?.category || l?.brand || null,
        lensId: null,
      };
    }
    case "PROGRESSIVE": {
      const l = order.progressiveLens;
      return {
        description: [l?.category, l?.brand, l?.item].filter(Boolean).join(" — ") || "Progressive",
        productName: l?.item || l?.brand || null,
        lensId: null,
      };
    }
    case "BIFOCAL": {
      const l = order.bifocalLens;
      return {
        description: [l?.brand, l?.item].filter(Boolean).join(" — ") || "Bifocal",
        productName: l?.item || l?.brand || null,
        lensId: null,
      };
    }
    case "ORI_VISION": {
      const l = order.oriVisionLens;
      return {
        description: [l?.brand, l?.item].filter(Boolean).join(" — ") || "Ori Vision",
        productName: l?.brand || null,
        lensId: null,
      };
    }
    case "MAGNUS": {
      const l = order.magnusLens;
      return {
        description: [l?.category, l?.item].filter(Boolean).join(" — ") || "Magnus",
        productName: l?.category || l?.item || null,
        lensId: null,
      };
    }
    default:
      return { description: order.lensType, productName: null, lensId: null };
  }
}

function catalogLensType(lensType: string): string {
  switch (lensType) {
    case "SINGLE_VISION":
      return "single-vision";
    case "KRYPTOK":
      return "kryptok";
    case "PROGRESSIVE":
      return "progressive";
    default:
      return lensType.toLowerCase().replace(/_/g, "-");
  }
}

/**
 * Creates a GST tax invoice for an order (1:1). Idempotent if invoice already exists.
 */
export async function createInvoiceFromOrder(
  input: CreateInvoiceFromOrderInput
): Promise<{ invoiceId: string; creditLimitWarning?: string | null }> {
  const db = input.tx ?? prisma;

  const existing = await db.invoice.findUnique({
    where: { orderId: input.orderId },
    select: { id: true },
  });
  if (existing) {
    return { invoiceId: existing.id };
  }

  const order = await db.order.findUniqueOrThrow({
    where: { id: input.orderId },
    include: {
      user: true,
      singleVisionLens: true,
      kryptokLens: true,
      progressiveLens: true,
      bifocalLens: true,
      oriVisionLens: true,
      magnusLens: true,
      wholesaleLineItems: true,
    },
  });

  const settings = await getCompanyFinanceSettings();
  const pos = resolvePlaceOfSupply({
    companyState: settings.state,
    companyStateCode: settings.stateCode,
    customerBillingState: order.user.billingState,
    customerBillingGstState: order.user.billingGstState,
    customerGstRegistrationState: order.user.gstRegistrationState,
  });

  const label = lensLabel(order);
  const tax = await resolveProductTax({
    lensType: catalogLensType(order.lensType),
    productName: label.productName,
  });

  // Catalog Order.unitPrice is per pair; Order.quantity is pieces.
  // Use the same pair→piece conversion as checkout (orderTotalFromPairPrice).
  // Idempotent early-return above ensures this never rewrites issued invoices.
  const loyaltyDiscount = roundMoney(Number(input.loyaltyDiscount) || 0);
  const pricing = computeInvoicePricingFromOrder({
    pairUnitPrice: Number(order.unitPrice) || 0,
    pieceQuantity: Number(order.quantity) || 1,
    discountAmount: loyaltyDiscount,
    gstRatePercent: tax.gstRatePercent,
    isInterState: pos.isInterState,
  });
  const { quantity: qty, unitPrice, totals } = pricing;
  const line = totals.lines[0]!;
  const issuedAt = new Date();
  const dueDays = settings.paymentTermsDays ?? 30;
  const dueDate = new Date(issuedAt);
  dueDate.setDate(dueDate.getDate() + dueDays);

  const { number: invoiceNumber, financialYear } = await nextInvoiceNumber(issuedAt);

  const status: InvoiceStatus = input.markPaid
    ? InvoiceStatus.PAID
    : InvoiceStatus.ISSUED;

  const amountPaid = input.markPaid ? totals.grandTotal : 0;
  const amountOutstanding = roundMoney(totals.grandTotal - amountPaid);

  const customerType =
    order.user.customerType ??
    (order.user.gstNumber
      ? CustomerTaxType.REGISTERED
      : CustomerTaxType.UNREGISTERED);

  const invoice = await db.invoice.create({
    data: {
      invoiceNumber,
      userId: order.userId,
      orderId: order.id,
      amount: totals.grandTotal,
      status,
      issuedAt,
      dueDate,
      paymentTerms: `${dueDays} days`,
      financialYear,
      placeOfSupplyState: pos.placeOfSupplyState,
      placeOfSupplyCode: pos.placeOfSupplyCode,
      isInterState: pos.isInterState,
      taxIncomplete: tax.fromDefault,
      grossAmount: totals.grossAmount,
      discountAmount: totals.discountAmount,
      taxableAmount: totals.taxableAmount,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      igstAmount: totals.igstAmount,
      roundingAdjustment: totals.roundingAdjustment,
      amountPaid,
      amountOutstanding,
      companyGstin: settings.gstin,
      companyLegalName: settings.legalName,
      companyState: settings.state,
      companyStateCode: settings.stateCode,
      customerGstin: order.user.gstNumber,
      customerLegalName:
        order.user.billingLegalName ||
        order.user.legalBusinessName ||
        order.user.businessName ||
        order.user.name,
      customerBillingState: order.user.billingState || order.user.state,
      customerTypeSnapshot: customerType,
      lines: {
        create: [
          {
            lineNumber: 1,
            description: label.description,
            sku: order.lensType,
            lensType: order.lensType,
            lensId:
              order.singleVisionLensId ||
              order.kryptokLensId ||
              order.progressiveLensId ||
              order.bifocalLensId ||
              order.oriVisionLensId ||
              order.magnusLensId,
            powerLabel: powerLabel(order),
            hsnCode: tax.hsnCode,
            quantity: qty,
            unitPrice,
            discountAmount: line.discountAmount,
            taxableAmount: line.taxableAmount,
            gstRatePercent: line.gstRatePercent,
            cgstAmount: line.cgstAmount,
            sgstAmount: line.sgstAmount,
            igstAmount: line.igstAmount,
            lineTotal: line.lineTotal,
          },
        ],
      },
    },
  });

  if (status === InvoiceStatus.ISSUED || status === InvoiceStatus.PAID) {
    await postCustomerLedgerInvoice({
      customerId: order.userId,
      invoiceId: invoice.id,
      amount: totals.grandTotal,
      description: `Invoice ${invoiceNumber}`,
      tx: input.tx,
    });
    await postSalesInvoiceJournal({
      invoiceId: invoice.id,
      taxable: totals.taxableAmount,
      cgst: totals.cgstAmount,
      sgst: totals.sgstAmount,
      igst: totals.igstAmount,
      total: totals.grandTotal,
      tx: input.tx,
    });
  }

  const creditLimitWarning = await checkCreditLimitWarning(
    order.userId,
    totals.grandTotal
  );

  return { invoiceId: invoice.id, creditLimitWarning };
}
