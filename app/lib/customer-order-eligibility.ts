/**
 * Phase C — self-serve vs staff on-behalf ordering gates.
 *
 * Self-serve: CUSTOMER must be APPROVED + active.
 * Staff on-behalf: approved+active, OR pending walk-in/admin-created
 * (`createdByStaffId` set) while PENDING_REVIEW.
 */

import type { User } from "@prisma/client";
import { isCustomerApprovedAndActive } from "./account-access";

export type OrderEligibilityCustomer = Pick<
  User,
  | "role"
  | "isActive"
  | "isApproved"
  | "approvalStatus"
  | "accountAction"
  | "createdByStaffId"
>;

export type OrderEligibilityDenial = {
  ok: false;
  code: "CUSTOMER_NOT_ORDERABLE" | "ACCOUNT_CLOSED" | "ACCOUNT_BLOCKED";
  message: string;
};

export type OrderEligibilityOk = { ok: true };

function isCommerciallyBlocked(
  user: Pick<User, "accountAction">
): OrderEligibilityDenial | null {
  if (user.accountAction === "CLOSED") {
    return {
      ok: false,
      code: "ACCOUNT_CLOSED",
      message: "This account has been closed.",
    };
  }
  if (user.accountAction === "BLOCKED") {
    return {
      ok: false,
      code: "ACCOUNT_BLOCKED",
      message: "This account is blocked from placing orders.",
    };
  }
  return null;
}

/** Customer placing their own order (web/mobile). */
export function assessSelfServeOrderEligibility(
  user: OrderEligibilityCustomer
): OrderEligibilityOk | OrderEligibilityDenial {
  if (user.role !== "CUSTOMER") {
    return {
      ok: false,
      code: "CUSTOMER_NOT_ORDERABLE",
      message: "Only customer accounts can place orders.",
    };
  }
  const blocked = isCommerciallyBlocked(user);
  if (blocked) return blocked;
  if (
    !isCustomerApprovedAndActive({
      role: user.role,
      isActive: user.isActive,
      isApproved: user.isApproved,
      approvalStatus: user.approvalStatus,
    })
  ) {
    return {
      ok: false,
      code: "CUSTOMER_NOT_ORDERABLE",
      message:
        "Your account is pending admin approval. You cannot place orders yet.",
    };
  }
  return { ok: true };
}

/**
 * Staff (ADMIN/EMPLOYEE) placing on behalf of a customer.
 * Allows pending customers created by staff (Path B/C).
 */
export function assessStaffOnBehalfOrderEligibility(
  customer: OrderEligibilityCustomer
): OrderEligibilityOk | OrderEligibilityDenial {
  if (customer.role !== "CUSTOMER") {
    return {
      ok: false,
      code: "CUSTOMER_NOT_ORDERABLE",
      message: "Customer not found.",
    };
  }
  const blocked = isCommerciallyBlocked(customer);
  if (blocked) return blocked;

  if (
    isCustomerApprovedAndActive({
      role: customer.role,
      isActive: customer.isActive,
      isApproved: customer.isApproved,
      approvalStatus: customer.approvalStatus,
    })
  ) {
    return { ok: true };
  }

  const isPendingStaffCreated =
    customer.approvalStatus === "PENDING_REVIEW" &&
    customer.createdByStaffId != null;

  if (isPendingStaffCreated) {
    return { ok: true };
  }

  return {
    ok: false,
    code: "CUSTOMER_NOT_ORDERABLE",
    message:
      "This customer cannot place orders (pending approval, rejected, or suspended).",
  };
}

/** Whether staff may pick this customer in create-order UI. */
export function isStaffOrderableCustomer(
  customer: OrderEligibilityCustomer
): boolean {
  return assessStaffOnBehalfOrderEligibility(customer).ok;
}
