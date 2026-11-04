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
  accountAction?: string;
  creditLimit?: string | null;
  creditAllowed?: boolean;
  pricingTierId?: string | null;
  pricingTierCode?: string | null;
  createdByStaffId?: string | null;
  gstinVerifyStatus?: string;
  gstinVerifiedAt?: string | null;
  gstNumber: string | null;
  businessName: string | null;
  businessAddress: string | null;
  state: string | null;
  pincode: string | null;
  mobileNumber?: string | null;
  mobileVerifiedAt?: string | null;
  emailVerifiedAt?: string | null;
  addressVerifiedAt?: string | null;
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

export type CreateAdminCustomerPayload = {
  mobileNumber: string;
  name?: string;
  email?: string;
  alternateMobileNumber?: string;
  whatsappNumber?: string;
  businessName?: string;
  shopName?: string;
  businessType?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  businessEmail?: string;
  shopPhoneNumber?: string;
  gstNumber?: string;
  panNumber?: string;
  legalBusinessName?: string;
  tradeName?: string;
  gstRegistrationState?: string;
  billingLegalName?: string;
  billingAddress?: string;
  billingCity?: string;
  billingState?: string;
  billingPincode?: string;
  billingGstState?: string;
  shippingLegalName?: string;
  shippingAddress?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingPincode?: string;
  creditLimit?: number | null;
  creditAllowed?: boolean;
  pricingTierId?: string | null;
};

export type UpdateAdminCustomerPayload = Partial<CreateAdminCustomerPayload> & {
  /** Required on every Admin customer update (RC-01). */
  notes?: string;
};

export type CustomerChangeHistoryItem = {
  id: string;
  publicId: string;
  action: string;
  createdAt: string;
  adminName: string | null;
  adminUserId: string | null;
  notes: string | null;
  fieldLabels: string[];
  changes: unknown;
  message: string | null;
};

export type AccountActionValue =
  | "NONE"
  | "BLOCKED"
  | "CREDIT_SUSPENDED"
  | "CLOSED";

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
  accountAction?: string;
  tierCode?: string;
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
  if (params.accountAction?.trim()) {
    qs.set("accountAction", params.accountAction.trim());
  }
  if (params.tierCode?.trim()) {
    qs.set("tierCode", params.tierCode.trim());
  }
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

/** Pending approvals ready for Admin (GST / registration complete). */
export async function listPendingApprovalCustomers(): Promise<AdminCustomer[]> {
  const data = await adminFetch<{ users: AdminCustomer[] }>(
    "/api/users/pending?bucket=ready"
  );
  return Array.isArray(data.users) ? data.users : [];
}

/** Abandoned / incomplete Path A signups. */
export async function listIncompleteSignupCustomers(): Promise<AdminCustomer[]> {
  const data = await adminFetch<{ users: AdminCustomer[] }>(
    "/api/users/pending?bucket=incomplete"
  );
  return Array.isArray(data.users) ? data.users : [];
}

export async function approveAdminCustomer(id: string): Promise<void> {
  await adminFetch(`/api/users/${id}/approve`, {
    method: "PUT",
    body: JSON.stringify({ action: "approve" }),
  });
}

export async function rejectAdminCustomer(
  id: string,
  rejectionReason: string
): Promise<void> {
  await adminFetch(`/api/users/${id}/approve`, {
    method: "PUT",
    body: JSON.stringify({ action: "reject", rejectionReason }),
  });
}

export type CustomerApprovalAction =
  | "approve"
  | "reject"
  | "reopen"
  | "suspend"
  | "activate";

export async function setCustomerApprovalAction(
  id: string,
  action: CustomerApprovalAction,
  rejectionReason?: string
): Promise<AdminCustomer> {
  const data = await adminFetch<{ user: AdminCustomer }>(
    `/api/users/${id}/approve`,
    {
      method: "PUT",
      body: JSON.stringify({
        action,
        ...(rejectionReason ? { rejectionReason } : {}),
      }),
    }
  );
  return data.user;
}

export type CustomerFinanceSummary = {
  outstanding: number;
  creditLimit: number | null;
  availableCredit: number | null;
  creditAllowed: boolean;
  accountAction: string;
};

export async function getAdminCustomer(id: string): Promise<{
  customer: AdminCustomer;
  finance: CustomerFinanceSummary | null;
}> {
  const data = await adminFetch<{
    customer: AdminCustomer;
    finance?: CustomerFinanceSummary;
  }>(`/api/users/customers/${id}`);
  return {
    customer: data.customer,
    finance: data.finance ?? null,
  };
}

export async function createAdminCustomer(
  payload: CreateAdminCustomerPayload
): Promise<AdminCustomer> {
  const data = await adminFetch<{ customer: AdminCustomer }>(
    "/api/users/customers",
    { method: "POST", body: JSON.stringify(payload) }
  );
  return data.customer;
}

export async function updateAdminCustomer(
  id: string,
  payload: UpdateAdminCustomerPayload
): Promise<AdminCustomer> {
  const data = await adminFetch<{ customer: AdminCustomer }>(
    `/api/users/customers/${id}`,
    { method: "PATCH", body: JSON.stringify(payload) }
  );
  return data.customer;
}

export async function setCustomerAccountAction(
  id: string,
  action: AccountActionValue
): Promise<AdminCustomer> {
  const data = await adminFetch<{ customer: AdminCustomer }>(
    `/api/users/${id}/account-action`,
    { method: "POST", body: JSON.stringify({ action }) }
  );
  return data.customer;
}

export type VerifyGstResult = {
  customer: AdminCustomer;
  verify: {
    status: string;
    legalName: string | null;
    tradeName: string | null;
    state: string | null;
  };
};

export async function verifyCustomerGst(id: string): Promise<VerifyGstResult> {
  return adminFetch<VerifyGstResult>(`/api/users/${id}/verify-gst`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function clearCustomerGstVerification(
  id: string
): Promise<AdminCustomer> {
  const data = await adminFetch<{ customer: AdminCustomer }>(
    `/api/users/${id}/clear-gst-verification`,
    { method: "POST", body: JSON.stringify({}) }
  );
  return data.customer;
}

export async function verifyCustomerAddress(
  id: string
): Promise<AdminCustomer> {
  const data = await adminFetch<{ customer: AdminCustomer }>(
    `/api/users/${id}/verify-address`,
    { method: "POST", body: JSON.stringify({}) }
  );
  return data.customer;
}

export async function fetchCustomerChangeHistory(
  id: string,
  limit = 50
): Promise<CustomerChangeHistoryItem[]> {
  const data = await adminFetch<{ items: CustomerChangeHistoryItem[] }>(
    `/api/users/customers/${id}/change-history?limit=${limit}`
  );
  return data.items;
}

export function isGstTaxLocked(
  customer: Pick<AdminCustomer, "gstinVerifyStatus">
) {
  return customer.gstinVerifyStatus === "ACTIVE";
}

export function isMobileVerified(
  customer: Pick<AdminCustomer, "mobileVerifiedAt">
) {
  return Boolean(customer.mobileVerifiedAt);
}

export function isEmailVerified(
  customer: Pick<AdminCustomer, "emailVerifiedAt">
) {
  return Boolean(customer.emailVerifiedAt);
}

export function isAddressVerified(
  customer: Pick<AdminCustomer, "addressVerifiedAt">
) {
  return Boolean(customer.addressVerifiedAt);
}

export async function sendAdminMobileOtp(mobileNumber: string): Promise<{
  challengeId: string;
  providerSessionId: string | null;
}> {
  return adminFetch("/api/auth/otp/mobile/send", {
    method: "POST",
    body: JSON.stringify({ mobileNumber, purpose: "ADMIN_INVITE" }),
  });
}

export async function verifyAdminMobileOtp(input: {
  mobileNumber: string;
  code: string;
  sessionId?: string | null;
}): Promise<{
  ok: boolean;
  challengeId: string;
  mobileNumber: string;
  user: AdminCustomer | null;
}> {
  return adminFetch("/api/auth/otp/mobile/verify", {
    method: "POST",
    body: JSON.stringify({
      mobileNumber: input.mobileNumber,
      code: input.code,
      purpose: "ADMIN_INVITE",
      sessionId: input.sessionId ?? undefined,
    }),
  });
}

export async function sendAdminEmailOtp(email: string): Promise<{
  challengeId: string;
  providerSessionId: string | null;
}> {
  return adminFetch("/api/auth/otp/email/send", {
    method: "POST",
    body: JSON.stringify({ email, purpose: "VERIFY_EMAIL" }),
  });
}

export async function verifyAdminEmailOtp(input: {
  email: string;
  code: string;
  sessionId?: string | null;
}): Promise<{
  ok: boolean;
  challengeId: string;
  email: string;
  user: AdminCustomer | null;
}> {
  return adminFetch("/api/auth/otp/email/verify", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      code: input.code,
      purpose: "VERIFY_EMAIL",
      sessionId: input.sessionId ?? undefined,
    }),
  });
}

export type CreateWalkInCustomerPayload = {
  mobileNumber: string;
  challengeId: string;
  name?: string;
  shopName?: string;
  businessName?: string;
  email?: string;
};

export async function createWalkInCustomer(
  payload: CreateWalkInCustomerPayload
): Promise<AdminCustomer> {
  const data = await adminFetch<{ customer: AdminCustomer }>(
    "/api/users/customers/walk-in",
    { method: "POST", body: JSON.stringify(payload) }
  );
  return data.customer;
}

export async function sendWalkInMobileOtp(mobileNumber: string): Promise<{
  challengeId: string;
  providerSessionId: string | null;
  mobileNumber: string;
}> {
  return adminFetch("/api/auth/otp/mobile/send", {
    method: "POST",
    body: JSON.stringify({ mobileNumber, purpose: "WALK_IN" }),
  });
}

export async function verifyWalkInMobileOtp(input: {
  mobileNumber: string;
  code: string;
  sessionId?: string | null;
}): Promise<{
  ok: boolean;
  challengeId: string;
  mobileNumber: string;
  user: AdminCustomer | null;
}> {
  return adminFetch("/api/auth/otp/mobile/verify", {
    method: "POST",
    body: JSON.stringify({
      mobileNumber: input.mobileNumber,
      code: input.code,
      purpose: "WALK_IN",
      sessionId: input.sessionId ?? undefined,
    }),
  });
}

export function formatAccountAction(action: string | undefined | null) {
  if (!action || action === "NONE") return "None";
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatGstinVerifyStatus(status: string | undefined | null) {
  if (!status || status === "UNKNOWN") return "Not verified";
  return status.charAt(0) + status.slice(1).toLowerCase();
}
