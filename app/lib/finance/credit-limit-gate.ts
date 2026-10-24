import type { User } from "@prisma/client";
import { roundMoney } from "./tax-calc";

export type CheckoutCreditFields = Pick<
  User,
  "accountAction" | "creditAllowed" | "creditLimit"
>;

export type CheckoutCreditDenial = {
  ok: false;
  code:
    | "ACCOUNT_CLOSED"
    | "ACCOUNT_BLOCKED"
    | "CREDIT_SUSPENDED"
    | "CREDIT_NOT_ALLOWED"
    | "CREDIT_LIMIT_EXCEEDED";
  message: string;
};

/**
 * Synchronous commercial/credit gates that do not need outstanding balance.
 * Returns null when a DB outstanding check is still required.
 */
export function assessCheckoutCreditSync(
  customer: CheckoutCreditFields,
  orderTotal: number
): { ok: true } | CheckoutCreditDenial | null {
  if (customer.accountAction === "CLOSED") {
    return {
      ok: false,
      code: "ACCOUNT_CLOSED",
      message: "This account has been closed.",
    };
  }
  if (customer.accountAction === "BLOCKED") {
    return {
      ok: false,
      code: "ACCOUNT_BLOCKED",
      message: "This account is blocked from placing orders.",
    };
  }

  const amount = roundMoney(Math.max(0, Number(orderTotal) || 0));
  if (amount <= 0) return { ok: true };

  if (
    customer.accountAction === "CREDIT_SUSPENDED" ||
    customer.creditAllowed === false
  ) {
    return {
      ok: false,
      code:
        customer.accountAction === "CREDIT_SUSPENDED"
          ? "CREDIT_SUSPENDED"
          : "CREDIT_NOT_ALLOWED",
      message:
        "Credit is not available for this account. Collect advance or clear credit suspension before ordering.",
    };
  }

  if (customer.creditLimit == null) return { ok: true };

  // Needs outstanding from DB.
  return null;
}

export function creditLimitExceededMessage(input: {
  outstanding: number;
  orderTotal: number;
  limit: number;
}): CheckoutCreditDenial {
  return {
    ok: false,
    code: "CREDIT_LIMIT_EXCEEDED",
    message: `Order would exceed credit limit (outstanding ₹${input.outstanding.toLocaleString("en-IN")} + order ₹${input.orderTotal.toLocaleString("en-IN")} > limit ₹${input.limit.toLocaleString("en-IN")}).`,
  };
}
