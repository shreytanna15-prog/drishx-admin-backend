import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { adminAuthFetch } from "@/app/lib/admin-auth-fetch";
import type { Paginated } from "@/app/lib/types/api-client";

/** Delay before revoking a blob object URL after opening the tax invoice. */
export const ADMIN_INVOICE_TAX_PDF_OBJECT_URL_REVOKE_MS = 60_000;

/** Same-origin API path — never put tokens in the URL. */
export function adminInvoiceTaxPdfPath(invoiceId: string): string {
  const id = invoiceId.trim();
  if (!id) {
    throw new AdminApiError("Missing invoice id.", 400);
  }
  const path = `/api/invoices/${encodeURIComponent(id)}/pdf`;
  if (path.includes("?") || /access_token|token=/i.test(path)) {
    throw new AdminApiError("Invalid tax invoice path.", 400);
  }
  return path;
}

/** Authenticated fetch of the tax invoice document (HTML printable view). */
export async function fetchAdminInvoiceTaxPdfBlob(
  invoiceId: string
): Promise<Blob> {
  const path = adminInvoiceTaxPdfPath(invoiceId);
  const res = await adminAuthFetch(path, { method: "GET" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new AdminApiError(
      typeof data.error === "string"
        ? data.error
        : "Failed to open tax invoice.",
      res.status,
      data
    );
  }
  return res.blob();
}

/**
 * Show a fetched tax document in a pre-opened tab (avoids popup blockers).
 * Schedules object-URL cleanup; does not navigate to the authenticated API path.
 */
export function presentAdminInvoiceTaxDocument(
  blob: Blob,
  popup: Window | null,
  options?: {
    revokeAfterMs?: number;
    schedule?: typeof setTimeout;
    createObjectUrl?: (blob: Blob) => string;
    revokeObjectUrl?: (url: string) => void;
  }
): { objectUrl: string; openedInPopup: boolean; usedAnchorFallback: boolean } {
  const createObjectUrl =
    options?.createObjectUrl ?? ((b: Blob) => URL.createObjectURL(b));
  const revokeObjectUrl =
    options?.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));
  const schedule = options?.schedule ?? setTimeout;
  const revokeAfterMs =
    options?.revokeAfterMs ?? ADMIN_INVOICE_TAX_PDF_OBJECT_URL_REVOKE_MS;

  const objectUrl = createObjectUrl(blob);
  let openedInPopup = false;

  if (popup && !popup.closed) {
    try {
      popup.location.replace(objectUrl);
      openedInPopup = true;
    } catch {
      try {
        popup.close();
      } catch {
        // ignore
      }
    }
  }

  let usedAnchorFallback = false;
  if (!openedInPopup && typeof document !== "undefined") {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener,noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    usedAnchorFallback = true;
  }

  schedule(() => {
    revokeObjectUrl(objectUrl);
  }, revokeAfterMs);

  return { objectUrl, openedInPopup, usedAnchorFallback };
}

/**
 * Fetch tax invoice via Bearer auth and present it in `popup` (open about:blank
 * synchronously on click before awaiting this).
 */
export async function openAdminInvoiceTaxPdf(
  invoiceId: string,
  options?: { popup?: Window | null }
): Promise<void> {
  const popup = options?.popup ?? null;
  try {
    const blob = await fetchAdminInvoiceTaxPdfBlob(invoiceId);
    presentAdminInvoiceTaxDocument(blob, popup);
  } catch (err) {
    try {
      popup?.close();
    } catch {
      // ignore
    }
    throw err;
  }
}

export type InvoiceCustomer = {
  id: string;
  name: string | null;
  email: string;
  gstNumber: string | null;
  businessName: string | null;
  businessAddress: string | null;
  state: string | null;
  pincode: string | null;
};

export type InvoiceOrder = {
  id: string;
  orderNumber: number | null;
  lensType: string;
  quantity: number;
  status: string;
  totalAmount: number | string;
};

export type AdminInvoice = {
  id: string;
  invoiceNumber: string;
  userId: string;
  orderId: string;
  amount: number | string;
  status: "PAID" | "ISSUED" | "PARTIALLY_PAID" | "UNPAID" | string;
  issuedAt: string;
  createdAt: string;
  updatedAt: string;
  user: InvoiceCustomer;
  order: InvoiceOrder | null;
};

export function formatInvoiceMoney(value: number | string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatInvoiceDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function invoiceCustomerLabel(invoice: AdminInvoice) {
  return (
    invoice.user?.businessName?.trim() ||
    invoice.user?.name?.trim() ||
    invoice.user?.email ||
    "Unknown customer"
  );
}

/** Human label for invoice.status — never collapse VOID/CANCELLED into "Unpaid". */
export function formatInvoiceStatusLabel(status: string): string {
  switch (status) {
    case "PAID":
      return "Paid";
    case "PARTIALLY_PAID":
      return "Partially paid";
    case "OVERDUE":
      return "Overdue";
    case "VOID":
      return "Void";
    case "CANCELLED":
      return "Cancelled";
    case "DRAFT":
      return "Draft";
    case "ISSUED":
      return "Unpaid";
    default:
      return status.replace(/_/g, " ");
  }
}

/** Open AR for list totals — excludes settled and closed (VOID/CANCELLED) invoices. */
export function invoiceContributesToUnpaidTotal(status: string): boolean {
  return (
    status !== "PAID" && status !== "VOID" && status !== "CANCELLED"
  );
}

export function invoiceStatusClass(status: string) {
  if (status === "PAID") {
    return "border-(--brand-success-border) bg-(--brand-success-bg) text-(--brand-success)";
  }
  if (status === "VOID" || status === "CANCELLED") {
    return "border-(--brand-card-border) bg-(--brand-card) text-(--brand-text-muted)";
  }
  if (status === "PARTIALLY_PAID" || status === "OVERDUE") {
    return "border-[rgba(240,161,50,0.45)] bg-[rgba(240,161,50,0.12)] text-(--brand-primary)";
  }
  return "border-[rgba(240,161,50,0.45)] bg-[rgba(240,161,50,0.12)] text-(--brand-primary)";
}

export function matchesInvoiceSearch(invoice: AdminInvoice, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const orderNo =
    invoice.order?.orderNumber != null
      ? String(invoice.order.orderNumber)
      : "";

  return [
    invoice.invoiceNumber,
    invoice.user?.name,
    invoice.user?.email,
    invoice.user?.businessName,
    invoice.user?.gstNumber,
    invoice.status,
    orderNo,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

export type ListAdminInvoicesParams = {
  page?: number;
  limit?: number;
  status?: string;
  q?: string;
};

export type PaginatedAdminInvoices = Paginated<AdminInvoice>;

export function buildInvoicesQueryString(
  params?: ListAdminInvoicesParams
): string {
  const qs = new URLSearchParams();
  if (!params) return "";
  if (params.page != null) qs.set("page", String(params.page));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.status?.trim()) qs.set("status", params.status.trim());
  if (params.q?.trim()) qs.set("q", params.q.trim());
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function normalizeInvoicesListResponse(
  data: unknown
): PaginatedAdminInvoices {
  if (Array.isArray(data)) {
    return {
      items: data as AdminInvoice[],
      page: 1,
      limit: data.length,
      hasMore: false,
      total: data.length,
    };
  }
  const body = data as Partial<PaginatedAdminInvoices> | null;
  const items = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    page: typeof body?.page === "number" ? body.page : 1,
    limit: typeof body?.limit === "number" ? body.limit : items.length,
    hasMore: Boolean(body?.hasMore),
    total: typeof body?.total === "number" ? body.total : undefined,
  };
}

export async function listAdminInvoices(
  params?: ListAdminInvoicesParams
): Promise<PaginatedAdminInvoices> {
  const data = await adminFetch<unknown>(
    `/api/invoices${buildInvoicesQueryString(params)}`
  );
  return normalizeInvoicesListResponse(data);
}

export async function getAdminInvoice<T = unknown>(id: string): Promise<T> {
  return adminFetch<T>(`/api/invoices/${id}`);
}
