/**
 * Stable query/mutation keys for admin client hooks (drishx-client-api skill).
 * Add entries when introducing feature hooks — keep aligned with real api modules.
 */

export const QUERY_REGISTRY = {
  getLoyaltySettings: "getLoyaltySettings",
  getLoyaltyCustomers: "getLoyaltyCustomers",
  getOrders: "getOrders",
  getOrder: "getOrder",
  getOrdersOverview: "getOrdersOverview",
  getCustomers: "getCustomers",
  getCustomer: "getCustomer",
  getCustomerChangeHistory: "getCustomerChangeHistory",
  getReturns: "getReturns",
  getInvoices: "getInvoices",
  getLensPowerRanges: "getLensPowerRanges",
} as const;

export const MUTATION_REGISTRY = {
  updateLoyaltySettings: "updateLoyaltySettings",
  createOrder: "createOrder",
  createCustomer: "createCustomer",
  updateCustomer: "updateCustomer",
  setCustomerAccountAction: "setCustomerAccountAction",
  verifyCustomerGst: "verifyCustomerGst",
  clearCustomerGstVerification: "clearCustomerGstVerification",
  verifyCustomerAddress: "verifyCustomerAddress",
  createWalkInCustomer: "createWalkInCustomer",
  createLensPowerRange: "createLensPowerRange",
  updateLensPowerRange: "updateLensPowerRange",
} as const;

export type QueryRegistryKey =
  (typeof QUERY_REGISTRY)[keyof typeof QUERY_REGISTRY];

export type MutationRegistryKey =
  (typeof MUTATION_REGISTRY)[keyof typeof MUTATION_REGISTRY];
