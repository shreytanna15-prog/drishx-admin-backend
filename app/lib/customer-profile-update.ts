/**
 * Phase E — customer self-service profile PATCH → PENDING_REVIEW.
 * RC-01: unverify mobile/email on change; lock GST/PAN when ACTIVE; clear address verified.
 */

import { Prisma, type User } from "@prisma/client";
import { ADDRESS_VERIFY_FIELDS } from "./admin-customer-field-labels";
import {
  composeBusinessAddress,
  normalizeGstin,
  normalizePan,
  optionalTrim,
  parseSparseRegistrationBody,
  resolveBusinessName,
  validateOptionalGstinPan,
} from "./customer-registration";
import { normalizeIndianMobile } from "./otp/mobile-normalize";

export type CustomerProfilePatchResult =
  | { ok: true; data: Prisma.UserUpdateInput; fieldsTouched: string[] }
  | { ok: false; error: string };

const PROFILE_KEYS = [
  "name",
  "mobileNumber",
  "alternateMobileNumber",
  "whatsappNumber",
  "shopName",
  "businessType",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "pincode",
  "businessEmail",
  "shopPhoneNumber",
  "gstNumber",
  "legalBusinessName",
  "tradeName",
  "gstRegistrationState",
  "panNumber",
  "billingLegalName",
  "billingAddress",
  "billingCity",
  "billingState",
  "billingPincode",
  "billingGstState",
  "shippingLegalName",
  "shippingAddress",
  "shippingCity",
  "shippingState",
  "shippingPincode",
  "businessName",
  "businessAddress",
] as const;

type ExistingProfile = Pick<
  User,
  | "businessName"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "state"
  | "pincode"
  | "email"
  | "mobileNumber"
  | "gstNumber"
  | "panNumber"
  | "gstinVerifyStatus"
  | "addressVerifiedAt"
>;

/**
 * Parse customer self-update body. Any successful apply must flip approval to pending.
 */
export function parseCustomerProfilePatch(
  body: Record<string, unknown>,
  existing: ExistingProfile
): CustomerProfilePatchResult {
  const touched = PROFILE_KEYS.filter((k) => k in body);
  if (touched.length === 0) {
    return { ok: false, error: "No profile fields provided." };
  }

  const sparse = parseSparseRegistrationBody(body);
  const tax = validateOptionalGstinPan({
    gstNumber: "gstNumber" in body ? body.gstNumber : undefined,
    panNumber: "panNumber" in body ? body.panNumber : undefined,
  });
  if (!tax.ok) return tax;

  const gstLocked = existing.gstinVerifyStatus === "ACTIVE";
  if (gstLocked) {
    if ("gstNumber" in body) {
      const nextGst = normalizeGstin(tax.gstNumber);
      if (nextGst !== normalizeGstin(existing.gstNumber)) {
        return {
          ok: false,
          error: "GSTIN is verified and cannot be changed.",
        };
      }
    }
    if ("panNumber" in body) {
      const nextPan = normalizePan(tax.panNumber);
      if (nextPan !== normalizePan(existing.panNumber)) {
        return {
          ok: false,
          error: "PAN is locked while GST is verified and cannot be changed.",
        };
      }
    }
  }

  const data: Prisma.UserUpdateInput = {};

  if ("name" in body) data.name = optionalTrim(body.name);
  if ("alternateMobileNumber" in body) {
    data.alternateMobileNumber = optionalTrim(body.alternateMobileNumber);
  }
  if ("whatsappNumber" in body) {
    data.whatsappNumber = optionalTrim(body.whatsappNumber);
  }
  if ("mobileNumber" in body) {
    const nextMobile = normalizeIndianMobile(String(body.mobileNumber ?? ""));
    if (!nextMobile) {
      return { ok: false, error: "A valid 10-digit Indian mobile number is required." };
    }
    data.mobileNumber = nextMobile;
    const existingMobile = normalizeIndianMobile(existing.mobileNumber ?? "");
    if (nextMobile !== existingMobile) {
      data.mobileVerifiedAt = null;
    }
  }

  if ("shopName" in body) data.shopName = sparse.shopName;
  if ("businessType" in body) data.businessType = sparse.businessType;
  if ("addressLine1" in body) data.addressLine1 = sparse.addressLine1;
  if ("addressLine2" in body) data.addressLine2 = sparse.addressLine2;
  if ("city" in body) data.city = sparse.city;
  if ("state" in body) data.state = sparse.state;
  if ("pincode" in body) data.pincode = sparse.pincode;
  if ("businessEmail" in body) data.businessEmail = sparse.businessEmail;
  if ("shopPhoneNumber" in body) data.shopPhoneNumber = sparse.shopPhoneNumber;
  if ("legalBusinessName" in body) {
    data.legalBusinessName = sparse.legalBusinessName;
  }
  if ("tradeName" in body) data.tradeName = sparse.tradeName;
  if ("gstRegistrationState" in body) {
    data.gstRegistrationState = sparse.gstRegistrationState;
  }
  if ("billingLegalName" in body) data.billingLegalName = sparse.billingLegalName;
  if ("billingAddress" in body) data.billingAddress = sparse.billingAddress;
  if ("billingCity" in body) data.billingCity = sparse.billingCity;
  if ("billingState" in body) data.billingState = sparse.billingState;
  if ("billingPincode" in body) data.billingPincode = sparse.billingPincode;
  if ("billingGstState" in body) data.billingGstState = sparse.billingGstState;
  if ("shippingLegalName" in body) {
    data.shippingLegalName = sparse.shippingLegalName;
  }
  if ("shippingAddress" in body) data.shippingAddress = sparse.shippingAddress;
  if ("shippingCity" in body) data.shippingCity = sparse.shippingCity;
  if ("shippingState" in body) data.shippingState = sparse.shippingState;
  if ("shippingPincode" in body) data.shippingPincode = sparse.shippingPincode;

  if ("gstNumber" in body && !gstLocked) data.gstNumber = tax.gstNumber;
  if ("panNumber" in body && !gstLocked) data.panNumber = tax.panNumber;

  if ("businessName" in body) {
    data.businessName = sparse.legacyBusinessName;
  } else if ("shopName" in body || "legalBusinessName" in body) {
    data.businessName = resolveBusinessName({
      shopName: "shopName" in body ? sparse.shopName : null,
      legalBusinessName:
        "legalBusinessName" in body ? sparse.legalBusinessName : null,
      legacyBusinessName: null,
      existingBusinessName: existing.businessName,
    });
  }

  if ("businessAddress" in body) {
    data.businessAddress = sparse.legacyBusinessAddress;
  } else if (
    "addressLine1" in body ||
    "addressLine2" in body ||
    "city" in body ||
    "state" in body ||
    "pincode" in body
  ) {
    data.businessAddress = composeBusinessAddress({
      addressLine1:
        "addressLine1" in body ? sparse.addressLine1 : existing.addressLine1,
      addressLine2:
        "addressLine2" in body ? sparse.addressLine2 : existing.addressLine2,
      city: "city" in body ? sparse.city : existing.city,
      state: "state" in body ? sparse.state : existing.state,
      pincode: "pincode" in body ? sparse.pincode : existing.pincode,
    });
  }

  // Customer self-edit does not change login email via this path today;
  // if added later, clear emailVerifiedAt similarly.

  const addressTouched = ADDRESS_VERIFY_FIELDS.some((field) => field in data);
  if (addressTouched && existing.addressVerifiedAt) {
    data.addressVerifiedAt = null;
  }

  if (!gstLocked && ("gstNumber" in body || "panNumber" in body)) {
    const gstChanged =
      "gstNumber" in body &&
      normalizeGstin(tax.gstNumber) !== normalizeGstin(existing.gstNumber);
    const panChanged =
      "panNumber" in body &&
      normalizePan(tax.panNumber) !== normalizePan(existing.panNumber);
    if (gstChanged || panChanged) {
      data.gstinVerifyStatus = "UNKNOWN";
      data.gstinVerifiedAt = null;
      data.gstinVerifiedById = null;
      data.gstinVerifyRaw = Prisma.DbNull;
    }
  }

  // Phase E: any customer self-update returns to pending review.
  data.approvalStatus = "PENDING_REVIEW";
  data.isApproved = false;
  data.isActive = false;
  data.rejectionReason = null;
  data.approvedAt = null;
  data.approvedById = null;

  return { ok: true, data, fieldsTouched: touched.map(String) };
}
