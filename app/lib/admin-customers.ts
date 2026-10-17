import { adminFetch } from "@/app/lib/admin-api";
import type { Paginated } from "@/app/lib/types/api-client";

export type AdminCustomer = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  isApproved: boolean;
  approvalStatus: string;
  gstNumber: string | null;
  businessName: string | null;
  businessAddress: string | null;
  state: string | null;
  pincode: string | null;
  mobileNumber?: string | null;
  alternateMobileNumber?: string | null;
  whatsappNumber?: string | null;
  shopName?: string | null;
  businessType?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  businessEmail?: string | null;
  shopPhoneNumber?: string | null;
  legalBusinessName?: string | null;
  tradeName?: string | null;
  gstRegistrationState?: string | null;
  panNumber?: string | null;
  billingLegalName?: string | null;
  billingAddress?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPincode?: string | null;
  billingGstState?: string | null;
  shippingLegalName?: string | null;
  shippingAddress?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingPincode?: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export function customerDisplayName(customer: AdminCustomer) {
  return (
    customer.businessName?.trim() ||
    customer.name?.trim() ||
    customer.email
  );
}

export function customerPersonName(customer: AdminCustomer) {
  return customer.name?.trim() || "—";
}

export function formatApprovalStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Pending with GST — ready for approve/reject. */
export function isPendingReady(customer: Pick<AdminCustomer, "approvalStatus" | "gstNumber">) {
  return customer.approvalStatus === "PENDING_REVIEW" && Boolean(customer.gstNumber);
}

/** Abandoned / mid-wizard signup — no GST yet. */
export function isIncompleteSignup(
  customer: Pick<AdminCustomer, "approvalStatus" | "gstNumber">
) {
  return customer.approvalStatus === "PENDING_REVIEW" && !customer.gstNumber;
}

export function isSuspendedCustomer(
  customer: Pick<AdminCustomer, "approvalStatus" | "isApproved" | "isActive">
) {
  return (
    customer.approvalStatus === "APPROVED" &&
    customer.isApproved &&
    !customer.isActive
  );
}

export function formatCustomerDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function matchesCustomerSearch(customer: AdminCustomer, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  return [
    customer.name,
    customer.email,
    customer.businessName,
    customer.gstNumber,
    customer.state,
    customer.pincode,
    customer.businessAddress,
    customer.shopName,
    customer.legalBusinessName,
    customer.mobileNumber,
    customer.city,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

export type ListAdminCustomersParams = {
  page?: number;
  limit?: number;
  status?: string;
  activeOnly?: boolean;
  q?: string;
};

export type PaginatedAdminCustomers = Paginated<AdminCustomer>;

export function buildCustomersQueryString(
  params?: ListAdminCustomersParams
): string {
  const qs = new URLSearchParams();
  if (!params) return "";
  if (params.page != null) qs.set("page", String(params.page));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.status?.trim()) qs.set("status", params.status.trim());
  if (params.activeOnly) qs.set("activeOnly", "1");
  if (params.q?.trim()) qs.set("q", params.q.trim());
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function normalizeCustomersListResponse(
  data: unknown
): PaginatedAdminCustomers {
  if (Array.isArray(data)) {
    return {
      items: data as AdminCustomer[],
      page: 1,
      limit: data.length,
      hasMore: false,
      total: data.length,
    };
  }
  const body = data as Partial<PaginatedAdminCustomers> & {
    customers?: AdminCustomer[];
  } | null;
  const items = Array.isArray(body?.items)
    ? body.items
    : Array.isArray(body?.customers)
      ? body.customers
      : [];
  return {
    items,
    page: typeof body?.page === "number" ? body.page : 1,
    limit: typeof body?.limit === "number" ? body.limit : items.length,
    hasMore: Boolean(body?.hasMore),
    total: typeof body?.total === "number" ? body.total : undefined,
  };
}

export async function listAdminCustomers(
  params?: ListAdminCustomersParams
): Promise<PaginatedAdminCustomers> {
  const data = await adminFetch<unknown>(
    `/api/users/customers${buildCustomersQueryString(params)}`
  );
  return normalizeCustomersListResponse(data);
}
