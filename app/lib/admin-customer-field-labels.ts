/**
 * Human-readable labels for Admin customer change history (RC-01).
 */

export const ADMIN_CUSTOMER_FIELD_LABELS: Record<string, string> = {
  name: "Contact name",
  email: "Email",
  mobileNumber: "Mobile",
  alternateMobileNumber: "Alternate mobile",
  whatsappNumber: "WhatsApp",
  businessName: "Business name",
  shopName: "Shop name",
  businessType: "Business type",
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  city: "City",
  state: "State",
  pincode: "Pincode",
  businessEmail: "Business email",
  shopPhoneNumber: "Shop phone",
  businessAddress: "Business address",
  gstNumber: "GSTIN",
  panNumber: "PAN",
  legalBusinessName: "Legal business name",
  tradeName: "Trade name",
  gstRegistrationState: "GST registration state",
  billingLegalName: "Billing legal name",
  billingAddress: "Billing address",
  billingCity: "Billing city",
  billingState: "Billing state",
  billingPincode: "Billing pincode",
  billingGstState: "Billing GST state",
  shippingLegalName: "Shipping legal name",
  shippingAddress: "Shipping address",
  shippingCity: "Shipping city",
  shippingState: "Shipping state",
  shippingPincode: "Shipping pincode",
  creditLimit: "Credit limit",
  creditAllowed: "Credit allowed",
  pricingTierId: "Pricing tier",
  mobileVerifiedAt: "Mobile verified",
  emailVerifiedAt: "Email verified",
  addressVerifiedAt: "Address verified",
  gstinVerifyStatus: "GST verification status",
};

/** Business / delivery address fields that clear addressVerifiedAt when changed. */
export const ADDRESS_VERIFY_FIELDS = [
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "pincode",
  "businessAddress",
  "billingAddress",
  "billingCity",
  "billingState",
  "billingPincode",
  "shippingAddress",
  "shippingCity",
  "shippingState",
  "shippingPincode",
] as const;

export function labelForCustomerField(field: string): string {
  return ADMIN_CUSTOMER_FIELD_LABELS[field] ?? field;
}

export function parseRequiredAdminUpdateNotes(
  body: Record<string, unknown>
): { ok: true; notes: string } | { ok: false; error: string } {
  const raw = body.notes ?? body.adminNotes ?? body.reasonText;
  const notes = typeof raw === "string" ? raw.trim() : "";
  if (!notes) {
    return {
      ok: false,
      error: "Notes are required for every Admin customer update.",
    };
  }
  if (notes.length > 2000) {
    return { ok: false, error: "Notes must be at most 2000 characters." };
  }
  return { ok: true, notes };
}
