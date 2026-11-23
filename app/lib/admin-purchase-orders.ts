/** Client types + helpers for Purchase Orders (RW-08 Phase A). */

import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { adminAuthFetch } from "@/app/lib/admin-auth-fetch";

export type PurchaseOrderListRow = {
  id: string;
  publicId: string;
  status: string;
  supplierId: string;
  supplier: { id: string; name: string } | null;
  warehouseCode: string;
  expectedDelivery: string | null;
  totalAmount: number;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderLineRow = {
  id: string;
  lineNumber: number;
  lensType: string | null;
  lensId: string | null;
  lensProductPowerId: string | null;
  lensProductVariantId: string | null;
  sph: number | null;
  cyl: number | null;
  productLabel: string | null;
  rangeLabel: string | null;
  powerLabel: string | null;
  requiredQuantity: number;
  poQuantity: number;
  rate: number | null;
  amount: number;
  receivedQuantity: number;
  cancelledQuantity: number;
  outstandingQuantity: number;
  procurementRequestId: string | null;
  procurementRequest: {
    id: string;
    publicId: string;
    requestedQuantity: number;
    orderedQuantity: number;
    status: string;
  } | null;
};

export type PurchaseOrderDetail = {
  id: string;
  publicId: string;
  status: string;
  supplierId: string;
  supplier: PurchaseOrderSupplier | null;
  warehouseCode: string;
  expectedDelivery: string | null;
  notes: string | null;
  subtotal: number;
  totalAmount: number;
  createdById: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  sentAt: string | null;
  sentById: string | null;
  sentVia: string | null;
  sentTo: string | null;
  sentNote: string | null;
  createdAt: string;
  updatedAt: string;
  lines: PurchaseOrderLineRow[];
};

export type PurchaseOrderSupplier = {
  id: string;
  name: string;
  tradeName: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  dispatchAddress: string | null;
  isActive: boolean;
};

export type PurchaseOrderHistoryEntry = {
  id: string;
  occurredAt: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string | null;
  actorUserId: string | null;
  message: string | null;
  context: Record<string, unknown> | null;
};

export type ImportedPoLine = {
  lensType: string;
  lensId: string;
  requiredQuantity: number;
  poQuantity: number;
  rate: number | null;
  productLabel: string;
  powerLabel: string;
  openPurchaseOrder: string | null;
};

export type ReorderQueueItem = {
  id: string;
  publicId: string;
  lensType: string | null;
  lensId: string | null;
  lensProductPowerId: string | null;
  lensProductVariantId: string | null;
  sph: number | null;
  cyl: number | null;
  requiredQuantity: number;
  requestedQuantity: number;
  orderedQuantity: number;
  unallocatedQuantity: number;
  priority: string;
  source: string;
  productLabel: string | null;
  rangeLabel: string | null;
  powerLabel: string | null;
  brand: string | null;
  item: string | null;
  coating: string | null;
  openPurchaseOrder: { id: string; publicId: string; status: string } | null;
};

export type DraftLineForm = {
  key: string;
  lensType: string | null;
  lensId: string | null;
  lensProductPowerId?: string | null;
  requiredQuantity: number;
  poQuantity: number;
  rate: string;
  procurementRequestId: string | null;
  productLabel: string | null;
  powerLabel: string | null;
};

export const PO_STATUSES = [
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_APPROVAL", label: "Pending approval" },
  { value: "OPEN", label: "Approved (not sent)" },
  { value: "SENT", label: "Sent to supplier" },
  { value: "PARTIALLY_RECEIVED", label: "Partially received" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export const PO_STATUS_BADGE_CLASS: Record<string, string> = {
  DRAFT: "border-(--brand-card-border) bg-(--brand-input-bg) text-(--brand-text)",
  PENDING_APPROVAL: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200",
  SENT: "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200",
  OPEN: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  PARTIALLY_RECEIVED:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
  CLOSED: "border-(--brand-card-border) bg-(--brand-input-bg) text-(--brand-text-muted)",
  CANCELLED: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
};

export function poStatusLabel(status: string): string {
  return PO_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function formatPoMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export async function fetchPurchaseOrders(status?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("limit", "200");
  return adminFetch<{
    purchaseOrders: PurchaseOrderListRow[];
    suppliers: Array<{ id: string; name: string }>;
    warehouseCodes: string[];
    count: number;
  }>(`/api/procurement/purchase-orders?${params.toString()}`);
}

export async function fetchPurchaseOrder(id: string) {
  return adminFetch<{ purchaseOrder: PurchaseOrderDetail }>(
    `/api/procurement/purchase-orders/${id}`
  );
}

export async function fetchReorderQueue() {
  return adminFetch<{ queue: ReorderQueueItem[]; count: number }>(
    "/api/procurement/purchase-orders/queue"
  );
}

export async function createPurchaseOrderDraft(body: {
  supplierId: string;
  warehouseCode: string;
  expectedDelivery?: string | null;
  notes?: string | null;
  lines: Array<{
    lensType?: string | null;
    lensId?: string | null;
    lensProductPowerId?: string | null;
    lensProductVariantId?: string | null;
    sph?: number | null;
    cyl?: number | null;
    requiredQuantity: number;
    poQuantity: number;
    rate?: number | null;
    procurementRequestId?: string | null;
    productLabel?: string | null;
    powerLabel?: string | null;
  }>;
}) {
  return adminFetch<{ purchaseOrder: PurchaseOrderDetail }>(
    "/api/procurement/purchase-orders",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function updatePurchaseOrderDraft(
  id: string,
  body: {
    supplierId?: string;
    warehouseCode?: string;
    expectedDelivery?: string | null;
    notes?: string | null;
    lines: Array<{
      lensType?: string | null;
      lensId?: string | null;
      lensProductPowerId?: string | null;
      lensProductVariantId?: string | null;
      sph?: number | null;
      cyl?: number | null;
      requiredQuantity: number;
      poQuantity: number;
      rate?: number | null;
      procurementRequestId?: string | null;
      productLabel?: string | null;
      powerLabel?: string | null;
    }>;
  }
) {
  return adminFetch<{ purchaseOrder: PurchaseOrderDetail }>(
    `/api/procurement/purchase-orders/${id}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export async function submitPurchaseOrder(id: string) {
  return adminFetch<{ purchaseOrder: PurchaseOrderDetail }>(
    `/api/procurement/purchase-orders/${id}/submit`,
    { method: "POST", body: "{}" }
  );
}

export async function approvePurchaseOrder(id: string) {
  return adminFetch<{ purchaseOrder: PurchaseOrderDetail }>(
    `/api/procurement/purchase-orders/${id}/approve`,
    { method: "POST", body: "{}" }
  );
}

export async function cancelPurchaseOrder(id: string, reason?: string) {
  return adminFetch<{ purchaseOrder: PurchaseOrderDetail }>(
    `/api/procurement/purchase-orders/${id}/cancel`,
    { method: "POST", body: JSON.stringify({ reason }) }
  );
}

/** Download an authenticated binary response as a file. */
export async function downloadAuthenticatedFile(path: string, fallbackName: string) {
  const res = await adminAuthFetch(path, { method: "GET" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new AdminApiError(
      typeof data.error === "string" ? data.error : "Download failed.",
      res.status
    );
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/i.exec(disposition);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = match?.[1] ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

export async function downloadPurchaseOrderExport(id: string, kind: "pdf" | "excel") {
  await downloadAuthenticatedFile(
    `/api/procurement/purchase-orders/${id}/${kind}`,
    `purchase-order.${kind === "excel" ? "xlsx" : "pdf"}`
  );
}

export async function markPurchaseOrderSentApi(
  id: string,
  body: { channel: string; sentTo?: string | null; note?: string | null }
) {
  return adminFetch<{ purchaseOrder: PurchaseOrderDetail }>(
    `/api/procurement/purchase-orders/${id}/sent`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function fetchPurchaseOrderHistory(id: string) {
  return adminFetch<{ history: PurchaseOrderHistoryEntry[] }>(
    `/api/procurement/purchase-orders/${id}/history`
  );
}

/** Open a stored receipt document via a short-lived signed URL. */
export async function openReceiptDocument(receiptId: string, kind: "bill" | "excel") {
  const res = await adminFetch<{ url: string; fileName: string }>(
    `/api/procurement/receipts/${receiptId}/documents/${kind}`
  );
  window.open(res.url, "_blank", "noopener,noreferrer");
}

export async function downloadPoImportTemplate() {
  await downloadAuthenticatedFile(
    "/api/procurement/purchase-orders/import",
    "purchase-order-import-template.xlsx"
  );
}

export async function importPurchaseOrderLines(file: File) {
  const form = new FormData();
  form.set("file", file);
  const res = await adminAuthFetch("/api/procurement/purchase-orders/import", {
    method: "POST",
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new AdminApiError(
      typeof data.error === "string" ? data.error : "Import failed.",
      res.status,
      data
    );
  }
  return data as { lines: ImportedPoLine[]; warnings: string[] };
}

export function queueItemToDraftLine(item: ReorderQueueItem): DraftLineForm {
  return {
    key: item.lensProductPowerId
      ? `power:${item.lensProductPowerId}`
      : `${item.lensType}:${item.lensId}:${item.id}`,
    lensType: item.lensType,
    lensId: item.lensId,
    lensProductPowerId: item.lensProductPowerId,
    requiredQuantity: item.unallocatedQuantity,
    poQuantity: item.unallocatedQuantity,
    rate: "",
    procurementRequestId: item.id,
    productLabel: item.productLabel,
    powerLabel: item.powerLabel,
  };
}
