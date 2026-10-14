/**
 * RW-07 — customer registration field helpers.
 * Required at signup: name, email, mobile, password.
 * Business / GST / address fields are optional; validate GSTIN/PAN only when provided.
 */

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function optionalTrim(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export function normalizeGstin(value: unknown): string | null {
  const trimmed = optionalTrim(value);
  return trimmed ? trimmed.toUpperCase() : null;
}

export function normalizePan(value: unknown): string | null {
  const trimmed = optionalTrim(value);
  return trimmed ? trimmed.toUpperCase() : null;
}

export function isValidGstin(value: string): boolean {
  return GSTIN_REGEX.test(value);
}

export function isValidPan(value: string): boolean {
  return PAN_REGEX.test(value);
}

export type GstinPanValidation =
  | { ok: true; gstNumber: string | null; panNumber: string | null }
  | { ok: false; error: string };

/** Validate GSTIN/PAN only when non-empty. Empty/omitted → null (ok). */
export function validateOptionalGstinPan(input: {
  gstNumber?: unknown;
  panNumber?: unknown;
}): GstinPanValidation {
  const gstNumber = normalizeGstin(input.gstNumber);
  const panNumber = normalizePan(input.panNumber);

  if (gstNumber && !isValidGstin(gstNumber)) {
    return { ok: false, error: "Invalid GSTIN format." };
  }
  if (panNumber && !isValidPan(panNumber)) {
    return { ok: false, error: "Invalid PAN format." };
  }
  return { ok: true, gstNumber, panNumber };
}

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
