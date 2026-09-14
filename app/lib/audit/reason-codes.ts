export const ReasonCode = {
  STOCK: {
    PHYSICAL_MISMATCH: "physical_mismatch",
    DAMAGED: "damaged",
    COUNTING_ERROR: "counting_error",
    WRONG_ENTRY: "wrong_entry",
    OTHER: "other",
  },
  ORDER_CANCEL: {
    CUSTOMER_CANCELLED: "customer_cancelled",
    PAYMENT_ISSUE: "payment_issue",
    UNAVAILABLE: "unavailable",
    DUPLICATE: "duplicate",
    OTHER: "other",
  },
  PRICE: {
    SUPPLIER_COST: "supplier_cost",
    PROMOTIONAL: "promotional",
    CORRECTION: "correction",
    OTHER: "other",
  },
  VOID: {
    INCORRECT_ENTRY: "incorrect_entry",
    DUPLICATE: "duplicate",
    OTHER: "other",
  },
} as const;

export type ReasonDomain = keyof typeof ReasonCode;

const ACTIONS_REQUIRING_REASON = new Set([
  "STOCK_ADJUSTED",
  "ORDER_CANCELLED",
  "PRICE_CHANGED",
  "EXPENSE_VOIDED",
  "PAYMENT_REVERSED",
  "TRANSACTION_VOIDED",
  "ORDER_ARCHIVED",
]);

export function actionRequiresReason(action: string): boolean {
  return ACTIONS_REQUIRING_REASON.has(action);
}

export function validateReason(
  action: string,
  reasonCode?: string | null,
  reasonText?: string | null
): string | null {
  if (!actionRequiresReason(action)) return null;
  if (!reasonCode?.trim() && !reasonText?.trim()) {
    return `Reason is required for action ${action}.`;
  }
  return null;
}
