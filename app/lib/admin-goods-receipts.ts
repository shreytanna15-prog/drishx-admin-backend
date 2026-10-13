import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { adminAuthFetch } from "@/app/lib/admin-auth-fetch";
import { getAccessToken } from "@/app/lib/client-auth";
import { CLOSE_OUTSTANDING_REASONS } from "@/app/lib/purchase-order-receive-math";

export { CLOSE_OUTSTANDING_REASONS };

export type GoodsReceiptLine = {
  id: string;
  purchaseOrderLineId: string | null;
  lensType: string | null;
  lensId: string | null;
  productLabel: string | null;
  rangeLabel: string | null;
  powerLabel: string | null;
  orderedQuantity: number;
  previouslyReceived: number;
  outstandingBefore: number;
  deliveredQuantity: number;
  acceptedQuantity: number;
  damagedQuantity: number;
  shortQuantity: number;
  excessQuantity: number;
  lineStatus: string;
  actionCode: string | null;
};

export type GoodsReceiptDetail = {
  id: string;
  publicId: string;
  status: string;
  purchaseOrderId: string;
  purchaseOrder: {
    id: string;
    publicId: string;
    status: string;
    supplier: { id: string; name: string } | null;
  };
  warehouseCode: string;
  courier: string | null;
  awb: string | null;
  billFileName: string | null;
  billStored: boolean;
  excelFileName: string | null;
  excelStored: boolean;
  purchaseBill: { id: string; billNumber: string; status: string; totalAmount: number } | null;
  confirmedAt: string | null;
  lines: GoodsReceiptLine[];
  billSummaries: Array<{
    id: string;
    productLabel: string;
    rangeLabel: string | null;
    billQuantity: number;
    excelQuantity: number;
    difference: number;
    resolution: string | null;
  }>;
  confirmSummary: {
    acceptedUnits: number;
    remainingOutstanding: number;
    unresolvedMismatches: number;
  };
  confirmBlockers: string[];
  canConfirm: boolean;
};

export const LINE_STATUS_CLASS: Record<string, string> = {
  MATCHED:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  SHORT:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
  EXTRA:
    "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200",
  INVALID:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  DAMAGED:
    "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200",
  PENDING:
    "border-(--brand-card-border) bg-(--brand-input-bg) text-(--brand-text-muted)",
};

export type GoodsReceiptListRow = {
  id: string;
  publicId: string;
  status: string;
  createdAt: string;
  confirmedAt: string | null;
  acceptedUnits: number;
  billFileName: string | null;
  billStored: boolean;
  excelFileName: string | null;
  excelStored: boolean;
  courier: string | null;
  awb: string | null;
  purchaseBill: { id: string; billNumber: string; status: string } | null;
};

export async function listGoodsReceipts(purchaseOrderId: string) {
  return adminFetch<{ receipts: GoodsReceiptListRow[] }>(
    `/api/procurement/purchase-orders/${purchaseOrderId}/receipts`
  );
}

export async function createDraftReceiptMultipart(
  purchaseOrderId: string,
  form: FormData
) {
  const token = getAccessToken();
  if (!token) throw new AdminApiError("Not signed in.", 401);
  const res = await adminAuthFetch(
    `/api/procurement/purchase-orders/${purchaseOrderId}/receipts`,
    { method: "POST", body: form }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AdminApiError(
      typeof data?.error === "string" ? data.error : "Upload failed.",
      res.status,
      data && typeof data === "object" ? data : {}
    );
  }
  return data as { receipt: GoodsReceiptDetail };
}

export async function fetchGoodsReceipt(id: string) {
  return adminFetch<{ receipt: GoodsReceiptDetail }>(
    `/api/procurement/receipts/${id}`
  );
}

export async function patchGoodsReceipt(
  id: string,
  body: {
    lineUpdates: Array<{
      id: string;
      acceptedQuantity?: number;
      damagedQuantity?: number;
      actionCode?: string | null;
    }>;
    billResolutions?: Array<{ id: string; resolution: string | null }>;
  }
) {
  return adminFetch<{ receipt: GoodsReceiptDetail }>(
    `/api/procurement/receipts/${id}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export async function confirmGoodsReceiptApi(
  id: string,
  confirmationKey: string
) {
  return adminFetch<{ receipt: GoodsReceiptDetail }>(
    `/api/procurement/receipts/${id}/confirm`,
    {
      method: "POST",
      body: JSON.stringify({ confirmationKey }),
    }
  );
}

export async function closeOutstandingApi(
  purchaseOrderId: string,
  reason: string,
  reasonDetail?: string
) {
  return adminFetch<{
    purchaseOrder: {
      id: string;
      publicId: string;
      status: string;
      cancelReason: string | null;
      cancelledAt: string | null;
      lines: Array<{
        id: string;
        receivedQuantity: number;
        cancelledQuantity: number;
        outstandingQuantity: number;
      }>;
      [key: string]: unknown;
    };
  }>(`/api/procurement/purchase-orders/${purchaseOrderId}/close-outstanding`, {
    method: "POST",
    body: JSON.stringify({ reason, reasonDetail }),
  });
}

export function closeReasonLabel(code: string): string {
  switch (code) {
    case "SUPPLIER_UNABLE_TO_SUPPLY":
      return "Supplier unable to supply";
    case "SUPPLIER_DISCONTINUED":
      return "Supplier discontinued item";
    case "SUPPLIER_CANCELLED_BALANCE":
      return "Supplier cancelled balance";
    case "COMMERCIAL_DISAGREEMENT":
      return "Commercial disagreement";
    case "BUYER_CANCELLATION":
      return "Buyer cancellation";
    case "OTHER":
      return "Other";
    default:
      return code;
  }
}

export async function cancelGoodsReceiptApi(id: string) {
  return adminFetch<{ receipt: GoodsReceiptDetail }>(
    `/api/procurement/receipts/${id}/cancel`,
    { method: "POST", body: "{}" }
  );
}
