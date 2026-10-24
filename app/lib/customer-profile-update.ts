/**
 * Phase E — customer self-service profile PATCH → PENDING_REVIEW.
 */

import type { Prisma, User } from "@prisma/client";
import {
  composeBusinessAddress,
  optionalTrim,
  parseSparseRegistrationBody,
  resolveBusinessName,
  validateOptionalGstinPan,
} from "./customer-registration";

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

/**
 * Parse customer self-update body. Any successful apply must flip approval to pending.
 */
export function parseCustomerProfilePatch(
  body: Record<string, unknown>,
  existing: Pick<User, "businessName" | "addressLine1" | "addressLine2" | "city" | "state" | "pincode">
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

  const data: Prisma.UserUpdateInput = {};

  if ("name" in body) data.name = optionalTrim(body.name);
  if ("alternateMobileNumber" in body) {
    data.alternateMobileNumber = optionalTrim(body.alternateMobileNumber);
  }
  if ("whatsappNumber" in body) {
    data.whatsappNumber = optionalTrim(body.whatsappNumber);
  }
  if ("mobileNumber" in body) {
    // Mobile identity changes go through OTP elsewhere; allow trim-only updates.
    data.mobileNumber = optionalTrim(body.mobileNumber);
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

  if ("gstNumber" in body) data.gstNumber = tax.gstNumber;
  if ("panNumber" in body) data.panNumber = tax.panNumber;

  if ("businessName" in body) {
    data.businessName = sparse.legacyBusinessName;
  } else if (
    "shopName" in body ||
    "legalBusinessName" in body
  ) {
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

  // Phase E: any customer self-update returns to pending review.
  data.approvalStatus = "PENDING_REVIEW";
  data.isApproved = false;
  data.isActive = false;
  data.rejectionReason = null;
  data.approvedAt = null;
  data.approvedById = null;

  return { ok: true, data, fieldsTouched: touched.map(String) };
}
