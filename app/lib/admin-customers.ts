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
