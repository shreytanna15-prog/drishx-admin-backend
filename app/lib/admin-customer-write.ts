/**
 * Path B — Admin create/update customer field parsing (Phase B).
 */

import type { AccountAction, Prisma } from "@prisma/client";
import {
  composeBusinessAddress,
  optionalTrim,
  validateOptionalGstinPan,
} from "./customer-registration";
import { normalizeIndianMobile } from "./otp/mobile-normalize";

export const ACCOUNT_ACTIONS = [
  "NONE",
  "BLOCKED",
  "CREDIT_SUSPENDED",
  "CLOSED",
] as const satisfies readonly AccountAction[];

export type AccountActionValue = (typeof ACCOUNT_ACTIONS)[number];

export function isAccountAction(value: string): value is AccountActionValue {
  return (ACCOUNT_ACTIONS as readonly string[]).includes(value);
}

export type AdminCustomerWriteFields = {
  name: string | null;
  email: string | null;
  mobileNumber: string;
  alternateMobileNumber: string | null;
  whatsappNumber: string | null;
  businessName: string | null;
  shopName: string | null;
  businessType: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  businessEmail: string | null;
  shopPhoneNumber: string | null;
  businessAddress: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  legalBusinessName: string | null;
  tradeName: string | null;
  gstRegistrationState: string | null;
  billingLegalName: string | null;
  billingAddress: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPincode: string | null;
  billingGstState: string | null;
  shippingLegalName: string | null;
  shippingAddress: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPincode: string | null;
  creditLimit: number | null | undefined;
  creditAllowed: boolean | undefined;
  pricingTierId: string | null | undefined;
};

export type ParseCustomerWriteResult =
  | { ok: true; data: AdminCustomerWriteFields }
  | { ok: false; error: string };

function parseCreditLimit(
  value: unknown
): { ok: true; value: number | null | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === "") return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "creditLimit must be a non-negative number." };
  }
  return { ok: true, value: n };
}

function parseCreditAllowed(
  value: unknown
): { ok: true; value: boolean | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value === "boolean") return { ok: true, value };
  if (value === "true" || value === "1") return { ok: true, value: true };
  if (value === "false" || value === "0") return { ok: true, value: false };
  return { ok: false, error: "creditAllowed must be a boolean." };
}

/**
 * Parse Path B create body. Mobile required; email optional.
 */
export function parseAdminCustomerCreateBody(
  body: Record<string, unknown>
): ParseCustomerWriteResult {
  const mobileNumber = normalizeIndianMobile(String(body.mobileNumber ?? ""));
  if (!mobileNumber) {
    return { ok: false, error: "A valid 10-digit Indian mobile number is required." };
  }

  const emailRaw = optionalTrim(body.email)?.toLowerCase() ?? null;
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return { ok: false, error: "Invalid email format." };
  }

  const gstPan = validateOptionalGstinPan({
    gstNumber: body.gstNumber,
    panNumber: body.panNumber,
  });
  if (!gstPan.ok) return gstPan;

  const creditLimit = parseCreditLimit(body.creditLimit);
  if (!creditLimit.ok) return creditLimit;
  const creditAllowed = parseCreditAllowed(body.creditAllowed);
  if (!creditAllowed.ok) return creditAllowed;
  const pricingTierId =
    "pricingTierId" in body
      ? optionalTrim(body.pricingTierId)
      : undefined;

  const addressLine1 = optionalTrim(body.addressLine1);
  const addressLine2 = optionalTrim(body.addressLine2);
  const city = optionalTrim(body.city);
  const state = optionalTrim(body.state);
  const pincode = optionalTrim(body.pincode);
  const businessAddress =
    optionalTrim(body.businessAddress) ??
    composeBusinessAddress({
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
    });

  return {
    ok: true,
    data: {
      name: optionalTrim(body.name),
      email: emailRaw,
      mobileNumber,
      alternateMobileNumber: optionalTrim(body.alternateMobileNumber),
      whatsappNumber: optionalTrim(body.whatsappNumber),
      businessName: optionalTrim(body.businessName),
      shopName: optionalTrim(body.shopName),
      businessType: optionalTrim(body.businessType),
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      businessEmail: optionalTrim(body.businessEmail)?.toLowerCase() ?? null,
      shopPhoneNumber: optionalTrim(body.shopPhoneNumber),
      businessAddress,
      gstNumber: gstPan.gstNumber,
      panNumber: gstPan.panNumber,
      legalBusinessName: optionalTrim(body.legalBusinessName),
      tradeName: optionalTrim(body.tradeName),
      gstRegistrationState: optionalTrim(body.gstRegistrationState),
      billingLegalName: optionalTrim(body.billingLegalName),
      billingAddress: optionalTrim(body.billingAddress),
      billingCity: optionalTrim(body.billingCity),
      billingState: optionalTrim(body.billingState),
      billingPincode: optionalTrim(body.billingPincode),
      billingGstState: optionalTrim(body.billingGstState),
      shippingLegalName: optionalTrim(body.shippingLegalName),
      shippingAddress: optionalTrim(body.shippingAddress),
      shippingCity: optionalTrim(body.shippingCity),
      shippingState: optionalTrim(body.shippingState),
      shippingPincode: optionalTrim(body.shippingPincode),
      creditLimit: creditLimit.value,
      creditAllowed: creditAllowed.value,
      pricingTierId,
    },
  };
}

/**
 * Parse admin PATCH — all fields optional; omit unchanged keys.
 * Mobile, when present, must be valid. Does not change approvalStatus.
 */
export function parseAdminCustomerPatchBody(
  body: Record<string, unknown>
):
  | { ok: true; data: Prisma.UserUpdateInput }
  | { ok: false; error: string } {
  const data: Prisma.UserUpdateInput = {};

  if ("name" in body) data.name = optionalTrim(body.name);
  if ("businessName" in body) data.businessName = optionalTrim(body.businessName);
  if ("shopName" in body) data.shopName = optionalTrim(body.shopName);
  if ("businessType" in body) data.businessType = optionalTrim(body.businessType);
  if ("addressLine1" in body) data.addressLine1 = optionalTrim(body.addressLine1);
  if ("addressLine2" in body) data.addressLine2 = optionalTrim(body.addressLine2);
  if ("city" in body) data.city = optionalTrim(body.city);
  if ("state" in body) data.state = optionalTrim(body.state);
  if ("pincode" in body) data.pincode = optionalTrim(body.pincode);
  if ("businessEmail" in body) {
    data.businessEmail = optionalTrim(body.businessEmail)?.toLowerCase() ?? null;
  }
  if ("shopPhoneNumber" in body) {
    data.shopPhoneNumber = optionalTrim(body.shopPhoneNumber);
  }
  if ("alternateMobileNumber" in body) {
    data.alternateMobileNumber = optionalTrim(body.alternateMobileNumber);
  }
  if ("whatsappNumber" in body) {
    data.whatsappNumber = optionalTrim(body.whatsappNumber);
  }
  if ("legalBusinessName" in body) {
    data.legalBusinessName = optionalTrim(body.legalBusinessName);
  }
  if ("tradeName" in body) data.tradeName = optionalTrim(body.tradeName);
  if ("gstRegistrationState" in body) {
    data.gstRegistrationState = optionalTrim(body.gstRegistrationState);
  }
  if ("billingLegalName" in body) {
    data.billingLegalName = optionalTrim(body.billingLegalName);
  }
  if ("billingAddress" in body) data.billingAddress = optionalTrim(body.billingAddress);
  if ("billingCity" in body) data.billingCity = optionalTrim(body.billingCity);
  if ("billingState" in body) data.billingState = optionalTrim(body.billingState);
  if ("billingPincode" in body) {
    data.billingPincode = optionalTrim(body.billingPincode);
  }
  if ("billingGstState" in body) {
    data.billingGstState = optionalTrim(body.billingGstState);
  }
  if ("shippingLegalName" in body) {
    data.shippingLegalName = optionalTrim(body.shippingLegalName);
  }
  if ("shippingAddress" in body) {
    data.shippingAddress = optionalTrim(body.shippingAddress);
  }
  if ("shippingCity" in body) data.shippingCity = optionalTrim(body.shippingCity);
  if ("shippingState" in body) data.shippingState = optionalTrim(body.shippingState);
  if ("shippingPincode" in body) {
    data.shippingPincode = optionalTrim(body.shippingPincode);
  }

  if ("email" in body) {
    const emailRaw = optionalTrim(body.email)?.toLowerCase() ?? null;
    if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return { ok: false, error: "Invalid email format." };
    }
    if (emailRaw) data.email = emailRaw;
  }

  if ("mobileNumber" in body) {
    const mobile = normalizeIndianMobile(String(body.mobileNumber ?? ""));
    if (!mobile) {
      return { ok: false, error: "A valid 10-digit Indian mobile number is required." };
    }
    data.mobileNumber = mobile;
  }

  if ("gstNumber" in body || "panNumber" in body) {
    const gstPan = validateOptionalGstinPan({
      gstNumber: "gstNumber" in body ? body.gstNumber : undefined,
      panNumber: "panNumber" in body ? body.panNumber : undefined,
    });
    if (!gstPan.ok) return gstPan;
    if ("gstNumber" in body) data.gstNumber = gstPan.gstNumber;
    if ("panNumber" in body) data.panNumber = gstPan.panNumber;
  }

  if ("creditLimit" in body) {
    const creditLimit = parseCreditLimit(body.creditLimit);
    if (!creditLimit.ok) return creditLimit;
    data.creditLimit = creditLimit.value === undefined ? undefined : creditLimit.value;
  }

  if ("creditAllowed" in body) {
    const creditAllowed = parseCreditAllowed(body.creditAllowed);
    if (!creditAllowed.ok) return creditAllowed;
    if (creditAllowed.value !== undefined) data.creditAllowed = creditAllowed.value;
  }

  if ("pricingTierId" in body) {
    // UserUpdateInput is relation-based; scalar pricingTierId is Unchecked-only.
    const tierId = optionalTrim(body.pricingTierId);
    data.pricingTier = tierId
      ? { connect: { id: tierId } }
      : { disconnect: true };
  }

  if ("businessAddress" in body) {
    data.businessAddress = optionalTrim(body.businessAddress);
  } else if (
    "addressLine1" in body ||
    "addressLine2" in body ||
    "city" in body ||
    "state" in body ||
    "pincode" in body
  ) {
    // Caller should recompose from merged user; leave unset here.
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: "No updatable fields provided." };
  }

  return { ok: true, data };
}

export function accountActionUpdateData(
  action: AccountActionValue,
  user: { accountAction: AccountAction; approvalStatus: string; isActive: boolean }
): Prisma.UserUpdateInput {
  if (action === "CLOSED") {
    return { accountAction: "CLOSED", isActive: false };
  }
  if (action === "NONE" && user.accountAction === "CLOSED") {
    return {
      accountAction: "NONE",
      isActive: user.approvalStatus === "APPROVED" ? true : user.isActive,
    };
  }
  return { accountAction: action };
}
