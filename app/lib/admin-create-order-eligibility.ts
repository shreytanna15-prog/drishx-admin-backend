import {
  isStaffOrderableCustomer,
  type OrderEligibilityCustomer,
} from "./customer-order-eligibility";

export type CreateOrderCustomerCandidate = {
  id: string;
  role: string;
  name?: string | null;
  email: string;
  businessName?: string | null;
  shopName?: string | null;
  mobileNumber?: string | null;
  isActive: boolean;
  isApproved: boolean;
  approvalStatus: string;
  accountAction?: string | null;
  createdByStaffId?: string | null;
};

function toEligibilityFields(
  user: CreateOrderCustomerCandidate
): OrderEligibilityCustomer {
  return {
    role: user.role as OrderEligibilityCustomer["role"],
    isActive: user.isActive,
    isApproved: user.isApproved,
    approvalStatus:
      user.approvalStatus as OrderEligibilityCustomer["approvalStatus"],
    accountAction: (user.accountAction ??
      "NONE") as OrderEligibilityCustomer["accountAction"],
    createdByStaffId: user.createdByStaffId ?? null,
  };
}

/**
 * Eligible for admin create-order picker / server acceptance:
 * approved+active, or pending staff-created (walk-in / Path B).
 */
export function isEligibleCreateOrderCustomer(
  user: CreateOrderCustomerCandidate
): boolean {
  if (user.role !== "CUSTOMER") return false;
  return isStaffOrderableCustomer(toEligibilityFields(user));
}

/** Filter a customers API page to eligible create-order picker rows. */
export function filterEligibleCreateOrderCustomers<
  T extends CreateOrderCustomerCandidate,
>(items: T[]): T[] {
  return items.filter(isEligibleCreateOrderCustomer);
}

/**
 * Catalog lens typeahead shows hits only after 2+ trimmed characters.
 * Keeps stale hits out of the UI without a sync setState-in-effect clear.
 */
export function resolveCatalogLensSearchUi<T>(input: {
  search: string;
  hits: T[];
  loading: boolean;
}): { queryReady: boolean; hits: T[]; loading: boolean } {
  const queryReady = input.search.trim().length >= 2;
  return {
    queryReady,
    hits: queryReady ? input.hits : [],
    loading: queryReady && input.loading,
  };
}

export function matchesCustomerSearch(
  customer: CreateOrderCustomerCandidate,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    customer.name,
    customer.businessName,
    customer.shopName,
    customer.email,
    customer.mobileNumber,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function formatCustomerPickerLabel(
  customer: CreateOrderCustomerCandidate
): string {
  const primary =
    customer.businessName?.trim() ||
    customer.shopName?.trim() ||
    customer.name?.trim() ||
    "Unnamed customer";
  return primary;
}
