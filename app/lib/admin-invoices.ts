import { adminFetch } from "@/app/lib/admin-api";
import type { Paginated } from "@/app/lib/types/api-client";

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

export function invoiceStatusClass(status: string) {
  if (status === "PAID") {
    return "border-(--brand-success-border) bg-(--brand-success-bg) text-(--brand-success)";
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
