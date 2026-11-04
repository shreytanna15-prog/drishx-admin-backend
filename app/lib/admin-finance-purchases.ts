import { adminFetch } from "@/app/lib/admin-api";

export type PurchaseSupplier = {
  id: string;
  name: string;
  gstin: string | null;
  state: string | null;
};

export type PurchaseBill = {
  id: string;
  billNumber: string;
  totalAmount: number | string;
  status: string;
  supplier: { name: string };
  poReference: string | null;
  grnReference: string | null;
  documentFileName: string | null;
  documentStoragePath: string | null;
};

export async function listPurchaseBills(): Promise<{
  bills: PurchaseBill[];
  hasMore: boolean;
}> {
  const data = await adminFetch<
    { items?: PurchaseBill[]; hasMore?: boolean } | PurchaseBill[]
  >("/api/finance/purchases?page=1&limit=100");
  if (Array.isArray(data)) {
    return { bills: data, hasMore: false };
  }
  return {
    bills: Array.isArray(data.items) ? data.items : [],
    hasMore: Boolean(data.hasMore),
  };
}

export async function listPurchaseSuppliers(): Promise<PurchaseSupplier[]> {
  return adminFetch<PurchaseSupplier[]>(
    "/api/finance/purchases?resource=suppliers"
  );
}

export async function getPurchaseBillDocumentUrl(
  billId: string
): Promise<string> {
  const res = await adminFetch<{ url: string }>(
    `/api/finance/purchases/${billId}/document`
  );
  return res.url;
}

export async function createPurchaseSupplier(input: {
  name: string;
  state: string;
  stateCode: string;
}): Promise<PurchaseSupplier> {
  return adminFetch<PurchaseSupplier>("/api/finance/purchases", {
    method: "POST",
    body: JSON.stringify({ action: "create-supplier", ...input }),
  });
}

export async function createPurchaseBill(input: {
  supplierId: string;
  post: boolean;
  lines: Array<{ description: string; quantity: number; unitPrice: number }>;
}): Promise<void> {
  await adminFetch("/api/finance/purchases", {
    method: "POST",
    body: JSON.stringify({ action: "create-bill", ...input }),
  });
}

export async function uploadPurchaseBillDocument(
  billId: string,
  file: File
): Promise<void> {
  const { adminAuthFetch } = await import("@/app/lib/admin-auth-fetch");
  const { AdminApiError } = await import("@/app/lib/admin-api");
  const form = new FormData();
  form.set("file", file);
  const res = await adminAuthFetch(
    `/api/finance/purchases/${billId}/document`,
    { method: "POST", body: form }
  );
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new AdminApiError(data.error ?? "Upload failed.", res.status);
  }
}
