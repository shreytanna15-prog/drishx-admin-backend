import type { User } from "@prisma/client";

export type WalkInLookupKind = "none" | "path_a" | "staff_created";

export type WalkInClassifyResult = {
  kind: WalkInLookupKind;
  /** True when staff-created and mobileVerifiedAt is set. */
  skipOtp: boolean;
  /** False when CLOSED/BLOCKED (still return kind for messaging). */
  orderable: boolean;
  selectable: boolean;
  message: string | null;
};

const PATH_A_MESSAGE =
  "This mobile belongs to a self-signup customer. Use Order on behalf for approved shops — walk-in is for staff-created customers only.";

const CLOSED_BLOCKED_MESSAGE =
  "This customer account is closed or blocked and cannot be used for walk-in orders.";

export function isStaffCreatedCustomer(
  user: Pick<User, "createdByStaffId" | "role">
): boolean {
  return user.role === "CUSTOMER" && user.createdByStaffId != null;
}

export function isWalkInOrderableAccount(
  user: Pick<User, "accountAction">
): boolean {
  return user.accountAction !== "CLOSED" && user.accountAction !== "BLOCKED";
}

/** Pure classification for tests / verify hardening (no Prisma). */
export function classifyWalkInCustomer(
  user: Pick<
    User,
    "role" | "createdByStaffId" | "mobileVerifiedAt" | "accountAction"
  > | null
): WalkInClassifyResult {
  if (!user || user.role !== "CUSTOMER") {
    return {
      kind: "none",
      skipOtp: false,
      orderable: true,
      selectable: false,
      message: null,
    };
  }
  if (!isStaffCreatedCustomer(user)) {
    return {
      kind: "path_a",
      skipOtp: false,
      orderable: false,
      selectable: false,
      message: PATH_A_MESSAGE,
    };
  }
  const orderable = isWalkInOrderableAccount(user);
  const skipOtp = Boolean(user.mobileVerifiedAt);
  return {
    kind: "staff_created",
    skipOtp,
    orderable,
    selectable: orderable,
    message: orderable ? null : CLOSED_BLOCKED_MESSAGE,
  };
}
