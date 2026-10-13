/**
 * Plain, serializable shape used to render Purchase Order documents
 * (PDF / Excel / email body). Built from the DB record by
 * `buildPurchaseOrderDocument` in `purchase-orders.ts`; renderers stay pure.
 */

export type PurchaseOrderDocumentParty = {
  name: string;
  tradeName?: string | null;
  contactPerson?: string | null;
  gstin?: string | null;
  pan?: string | null;
  addressLines: string[];
  phone?: string | null;
  email?: string | null;
};

export type PurchaseOrderDocumentLine = {
  lineNumber: number;
  lensType: string;
  productLabel: string | null;
  rangeLabel: string | null;
  powerLabel: string | null;
  requiredQuantity: number;
  poQuantity: number;
  receivedQuantity: number;
  cancelledQuantity: number;
  outstandingQuantity: number;
  rate: number | null;
  amount: number;
};

export type PurchaseOrderDocument = {
  publicId: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  expectedDelivery: string | null;
  warehouseCode: string;
  notes: string | null;
  /** Buyer (DrishX company settings). */
  buyer: PurchaseOrderDocumentParty;
  supplier: PurchaseOrderDocumentParty;
  lines: PurchaseOrderDocumentLine[];
  totals: {
    lineCount: number;
    totalQuantity: number;
    subtotal: number;
    totalAmount: number;
    /** True when at least one line has no rate (amount excludes it). */
    hasUnpricedLines: boolean;
  };
};

export const PO_DOCUMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  OPEN: "Approved / Open",
  SENT: "Sent to supplier",
  PARTIALLY_RECEIVED: "Partially received",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

/** Sanitised file stem for downloads, e.g. `PO-2026-000001`. */
export function purchaseOrderFileStem(publicId: string): string {
  return publicId.replace(/[^A-Za-z0-9_-]+/g, "_") || "purchase-order";
}
