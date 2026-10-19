import { isCustomerApprovedAndActive } from "./account-access";

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
};

/**
 * Eligible for admin create-order picker / server acceptance:
 * CUSTOMER + approved + active (RW-04).
 */
export function isEligibleCreateOrderCustomer(
  user: CreateOrderCustomerCandidate
): boolean {
  if (user.role !== "CUSTOMER") return false;
  return isCustomerApprovedAndActive(
    user as Parameters<typeof isCustomerApprovedAndActive>[0]
  );
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
