import { normalizeIndianMobile } from "@/app/lib/otp/mobile-normalize";
import { prisma } from "@/app/lib/prisma";
import { toSafeUser, type SafeUser } from "@/app/lib/user-public";
import {
  classifyWalkInCustomer,
  isStaffCreatedCustomer,
  isWalkInOrderableAccount,
  type WalkInLookupKind,
} from "@/app/lib/walk-in-classify";

export type { WalkInLookupKind };
export {
  classifyWalkInCustomer,
  isStaffCreatedCustomer,
  isWalkInOrderableAccount,
};

export type WalkInLookupResult = {
  kind: WalkInLookupKind;
  mobileNumber: string;
  /** Staff-created only — never set for Path A. */
  customer: SafeUser | null;
  /** True when staff-created and mobileVerifiedAt is set. */
  skipOtp: boolean;
  /** False when CLOSED/BLOCKED (still return kind for messaging). */
  orderable: boolean;
  message: string | null;
};

export async function lookupWalkInMobile(
  rawMobile: string
): Promise<WalkInLookupResult> {
  const mobileNumber = normalizeIndianMobile(String(rawMobile ?? ""));
  if (!mobileNumber) {
    return {
      kind: "none",
      mobileNumber: "",
      customer: null,
      skipOtp: false,
      orderable: false,
      message: "Enter a valid 10-digit Indian mobile number.",
    };
  }

  const user = await prisma.user.findFirst({
    where: { role: "CUSTOMER", mobileNumber },
  });

  const classified = classifyWalkInCustomer(user);
  if (classified.kind === "none") {
    return {
      kind: "none",
      mobileNumber,
      customer: null,
      skipOtp: false,
      orderable: true,
      message: null,
    };
  }
  if (classified.kind === "path_a") {
    return {
      kind: "path_a",
      mobileNumber,
      customer: null,
      skipOtp: false,
      orderable: false,
      message: classified.message,
    };
  }

  return {
    kind: "staff_created",
    mobileNumber,
    customer: classified.selectable && user ? toSafeUser(user) : null,
    skipOtp: classified.skipOtp,
    orderable: classified.orderable,
    message: classified.message,
  };
}
