/**
 * RW-04 — customer / staff account usability for login, refresh, and session gates.
 *
 * Suspended customers: approvalStatus=APPROVED, isApproved=true, isActive=false.
 * Rejected customers: approvalStatus=REJECTED.
 * Incomplete / pending-review customers may still authenticate (pending-approval UX).
 */

import type { User } from "@prisma/client";
import { NextResponse } from "next/server";
import { forbiddenResponse } from "./auth-errors";

export type AccountAccessFields = Pick<
  User,
  "role" | "isActive" | "isApproved" | "approvalStatus"
>;

export type AccountAccessDenial =
  | { ok: true }
  | {
      ok: false;
      code: "ACCOUNT_INACTIVE" | "FORBIDDEN";
      message: string;
      status: 403;
    };

export function isSuspendedCustomer(user: AccountAccessFields): boolean {
  return (
    user.role === "CUSTOMER" &&
    user.approvalStatus === "APPROVED" &&
    user.isApproved &&
    !user.isActive
  );
}

export function isRejectedCustomer(user: AccountAccessFields): boolean {
  return user.role === "CUSTOMER" && user.approvalStatus === "REJECTED";
}

/** Staff (non-CUSTOMER) must be active. */
export function isInactiveStaff(user: AccountAccessFields): boolean {
  return user.role !== "CUSTOMER" && !user.isActive;
}

/**
 * Whether the account may receive new access/refresh tokens or continue a session.
 * Pending / incomplete customers remain allowed (RW-04 incomplete workflow).
 */
export function assessAccountAccess(user: AccountAccessFields): AccountAccessDenial {
  if (isInactiveStaff(user)) {
    return {
      ok: false,
      code: "ACCOUNT_INACTIVE",
      message: "Your account is inactive. Contact an administrator.",
      status: 403,
    };
  }
  if (isRejectedCustomer(user)) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Your account was rejected by admin.",
      status: 403,
    };
  }
  if (isSuspendedCustomer(user)) {
    return {
      ok: false,
      code: "ACCOUNT_INACTIVE",
      message: "Your account has been suspended. Contact an administrator.",
      status: 403,
    };
  }
  return { ok: true };
}

export function accountAccessErrorResponse(user: AccountAccessFields): NextResponse | null {
  const assessment = assessAccountAccess(user);
  if (assessment.ok) return null;
  return forbiddenResponse(assessment.code, assessment.message);
}

/** Approved customers must also be active (not suspended). */
export function isCustomerApprovedAndActive(
  user: Pick<User, "role" | "isApproved" | "approvalStatus" | "isActive">
): boolean {
  if (user.role !== "CUSTOMER") return true;
  return (
    user.isApproved &&
    user.approvalStatus === "APPROVED" &&
    user.isActive
  );
}
