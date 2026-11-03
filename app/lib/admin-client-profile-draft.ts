import type {
  AdminCustomer,
  UpdateAdminCustomerPayload,
} from "@/app/lib/admin-customers";

export type ProfileDraft = {
  name: string;
  email: string;
  mobileNumber: string;
  alternateMobileNumber: string;
  whatsappNumber: string;
  businessName: string;
  shopName: string;
  businessType: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  businessEmail: string;
  shopPhoneNumber: string;
  gstNumber: string;
  panNumber: string;
  legalBusinessName: string;
  tradeName: string;
  gstRegistrationState: string;
  billingLegalName: string;
  billingAddress: string;
  billingCity: string;
  billingState: string;
  billingPincode: string;
  billingGstState: string;
  shippingLegalName: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingPincode: string;
};

function s(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function profileDraftFromCustomer(customer: AdminCustomer): ProfileDraft {
  return {
    name: s(customer.name),
    email: s(customer.email),
    mobileNumber: s(customer.mobileNumber),
    alternateMobileNumber: s(customer.alternateMobileNumber),
    whatsappNumber: s(customer.whatsappNumber),
    businessName: s(customer.businessName),
    shopName: s(customer.shopName),
    businessType: s(customer.businessType),
    addressLine1: s(customer.addressLine1),
    addressLine2: s(customer.addressLine2),
    city: s(customer.city),
    state: s(customer.state),
    pincode: s(customer.pincode),
    businessEmail: s(customer.businessEmail),
    shopPhoneNumber: s(customer.shopPhoneNumber),
    gstNumber: s(customer.gstNumber),
    panNumber: s(customer.panNumber),
    legalBusinessName: s(customer.legalBusinessName),
    tradeName: s(customer.tradeName),
    gstRegistrationState: s(customer.gstRegistrationState),
    billingLegalName: s(customer.billingLegalName),
    billingAddress: s(customer.billingAddress),
    billingCity: s(customer.billingCity),
    billingState: s(customer.billingState),
    billingPincode: s(customer.billingPincode),
    billingGstState: s(customer.billingGstState),
    shippingLegalName: s(customer.shippingLegalName),
    shippingAddress: s(customer.shippingAddress),
    shippingCity: s(customer.shippingCity),
    shippingState: s(customer.shippingState),
    shippingPincode: s(customer.shippingPincode),
  };
}

/** Build PATCH payload from draft. Omits GST/PAN when taxLocked. Empty strings clear optional fields. */
export function payloadFromProfileDraft(
  draft: ProfileDraft,
  taxLocked: boolean
): UpdateAdminCustomerPayload {
  const payload: UpdateAdminCustomerPayload = {
    name: draft.name.trim(),
    email: draft.email.trim(),
    mobileNumber: draft.mobileNumber.trim(),
    alternateMobileNumber: draft.alternateMobileNumber.trim(),
    whatsappNumber: draft.whatsappNumber.trim(),
    businessName: draft.businessName.trim(),
    shopName: draft.shopName.trim(),
    businessType: draft.businessType.trim(),
    addressLine1: draft.addressLine1.trim(),
    addressLine2: draft.addressLine2.trim(),
    city: draft.city.trim(),
    state: draft.state.trim(),
    pincode: draft.pincode.trim(),
    businessEmail: draft.businessEmail.trim(),
    shopPhoneNumber: draft.shopPhoneNumber.trim(),
    legalBusinessName: draft.legalBusinessName.trim(),
    tradeName: draft.tradeName.trim(),
    gstRegistrationState: draft.gstRegistrationState.trim(),
    billingLegalName: draft.billingLegalName.trim(),
    billingAddress: draft.billingAddress.trim(),
    billingCity: draft.billingCity.trim(),
    billingState: draft.billingState.trim(),
    billingPincode: draft.billingPincode.trim(),
    billingGstState: draft.billingGstState.trim(),
    shippingLegalName: draft.shippingLegalName.trim(),
    shippingAddress: draft.shippingAddress.trim(),
    shippingCity: draft.shippingCity.trim(),
    shippingState: draft.shippingState.trim(),
    shippingPincode: draft.shippingPincode.trim(),
  };

  if (!taxLocked) {
    payload.gstNumber = draft.gstNumber.trim();
    payload.panNumber = draft.panNumber.trim();
  }

  return payload;
}
