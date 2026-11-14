/**
 * RW-07 — customer registration field helpers.
 * Required at signup: name, email, mobile, password.
 * Business / GST / address fields are optional; validate GSTIN/PAN only when provided.
 */

export {
  GSTIN_REGEX,
  PAN_REGEX,
  optionalTrim,
  normalizeGstin,
  normalizePan,
  isValidGstin,
  isValidPan,
  validateOptionalGstinPan,
  type GstinPanValidation,
} from "./validation/gst-pan";

import {
  normalizeGstin,
  normalizePan,
  optionalTrim,
} from "./validation/gst-pan";

export function composeBusinessAddress(parts: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}): string | null {
  const joined = [
    parts.addressLine1,
    parts.addressLine2,
    parts.city,
    parts.state,
    parts.pincode,
  ]
    .map((p) => (p ? String(p).trim() : ""))
    .filter(Boolean)
    .join(", ");
  return joined || null;
}

export type SparseRegistrationFields = {
  shopName: string | null;
  businessType: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  businessEmail: string | null;
  shopPhoneNumber: string | null;
  gstNumber: string | null;
  legalBusinessName: string | null;
  tradeName: string | null;
  gstRegistrationState: string | null;
  panNumber: string | null;
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
  legacyBusinessName: string | null;
  legacyBusinessAddress: string | null;
};

export function parseSparseRegistrationBody(
  body: Record<string, unknown>
): SparseRegistrationFields {
  const state =
    optionalTrim(body.state) || optionalTrim(body.businessState);
  const pincode =
    optionalTrim(body.pincode) || optionalTrim(body.businessPincode);

  return {
    shopName: optionalTrim(body.shopName),
    businessType: optionalTrim(body.businessType),
    addressLine1: optionalTrim(body.addressLine1),
    addressLine2: optionalTrim(body.addressLine2),
    city: optionalTrim(body.city),
    state,
    pincode,
    businessEmail: optionalTrim(body.businessEmail)?.toLowerCase() ?? null,
    shopPhoneNumber: optionalTrim(body.shopPhoneNumber),
    gstNumber: normalizeGstin(body.gstNumber),
    legalBusinessName: optionalTrim(body.legalBusinessName),
    tradeName: optionalTrim(body.tradeName),
    gstRegistrationState: optionalTrim(body.gstRegistrationState),
    panNumber: normalizePan(body.panNumber),
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
    legacyBusinessName: optionalTrim(body.businessName),
    legacyBusinessAddress: optionalTrim(body.businessAddress),
  };
}

export function isLegacyGstPayload(fields: SparseRegistrationFields): boolean {
  return Boolean(
    fields.legacyBusinessName &&
      fields.legacyBusinessAddress &&
      fields.gstNumber &&
      !fields.shopName &&
      !fields.legalBusinessName
  );
}

/** Resolve display business name without inventing placeholders. */
export function resolveBusinessName(input: {
  shopName: string | null;
  legalBusinessName: string | null;
  legacyBusinessName: string | null;
  existingBusinessName?: string | null;
}): string | null {
  return (
    input.shopName ||
    input.legacyBusinessName ||
    input.existingBusinessName ||
    input.legalBusinessName ||
    null
  );
}

/** RW-04: pending-ready when GST present; incomplete when absent. */
export function registrationApprovalBucket(gstNumber: string | null | undefined): {
  hasGst: boolean;
  bucket: "incomplete" | "pending-ready";
} {
  const hasGst = Boolean(gstNumber);
  return {
    hasGst,
    bucket: hasGst ? "pending-ready" : "incomplete",
  };
}
