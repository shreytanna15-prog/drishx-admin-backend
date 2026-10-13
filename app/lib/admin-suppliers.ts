import { AdminApiError, adminFetch } from "@/app/lib/admin-api";
import { adminAuthFetch } from "@/app/lib/admin-auth-fetch";
import { getAccessToken } from "@/app/lib/client-auth";

export type AdminSupplier = {
  id: string;
  name: string;
  tradeName: string | null;
  businessEntityType: string | null;
  gstin: string | null;
  pan: string | null;
  state: string | null;
  stateCode: string | null;
  contactPerson: string | null;
  phone: string | null;
  alternatePhone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  dispatchAddress: string | null;
  notes: string | null;
  isActive: boolean;
  /** Purchase orders in OPEN / SENT / PARTIALLY_RECEIVED. */
  openPoCount: number | null;
  createdAt: string;
  updatedAt: string;
};

export type SupplierListResponse = {
  suppliers: AdminSupplier[];
  total: number;
  page: number;
  pageSize: number;
  canEdit: boolean;
};

/**
 * AdminApiError carrying the API's stable `code` and per-field messages.
 * `adminFetch` drops the response body, so mutations go through
 * `adminAuthFetch` directly to surface `fieldErrors` under inputs.
 */
export class SupplierApiError extends AdminApiError {
  code: string | null;
  fieldErrors: Record<string, string>;

  constructor(
    message: string,
    status: number,
    code: string | null,
    fieldErrors: Record<string, string>
  ) {
    super(message, status);
    this.name = "SupplierApiError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

async function supplierMutation<T>(path: string, init: RequestInit): Promise<T> {
  if (!getAccessToken()) throw new SupplierApiError("Not signed in.", 401, null, {});
  const res = await adminAuthFetch(path, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const fieldErrors =
      data.fieldErrors && typeof data.fieldErrors === "object"
        ? (data.fieldErrors as Record<string, string>)
        : {};
    throw new SupplierApiError(
      typeof data.error === "string" ? data.error : "Request failed.",
      res.status,
      typeof data.code === "string" ? data.code : null,
      fieldErrors
    );
  }
  return data as T;
}

export function fetchSuppliers(params: {
  search?: string;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const qs = new URLSearchParams();
  if (params.search?.trim()) qs.set("search", params.search.trim());
  if (params.includeInactive) qs.set("includeInactive", "true");
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const query = qs.toString();
  return adminFetch<SupplierListResponse>(
    `/api/procurement/suppliers${query ? `?${query}` : ""}`
  );
}

export function fetchSupplier(id: string) {
  return adminFetch<{ supplier: AdminSupplier; canEdit: boolean }>(
    `/api/procurement/suppliers/${encodeURIComponent(id)}`
  );
}

export function createSupplierRequest(body: Record<string, unknown>) {
  return supplierMutation<{ supplier: AdminSupplier }>("/api/procurement/suppliers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateSupplierRequest(id: string, body: Record<string, unknown>) {
  return supplierMutation<{ supplier: AdminSupplier; warning: string | null }>(
    `/api/procurement/suppliers/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export function setSupplierActive(id: string, isActive: boolean) {
  return updateSupplierRequest(id, { isActive });
}
