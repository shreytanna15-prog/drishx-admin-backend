import type { StaffRole, User } from "@prisma/client";
import {
  serializeStaffRole,
  type SerializedStaffRole,
} from "./staff-access";
import {
  ALL_STAFF_PERMISSIONS,
  type StaffPermission,
} from "./staff-permissions";

export type SafeUser = {
  id: string;
  email: string;
  name: string | null;
  role: User["role"];
  isActive: boolean;
  isApproved: boolean;
  approvalStatus: User["approvalStatus"];
  accountAction: User["accountAction"];
  creditLimit: string | null;
  creditAllowed: boolean;
  pricingTierId: string | null;
  pricingTierCode: string | null;
  pricingTierDiscountPercent: number | null;
  createdByStaffId: string | null;
  gstinVerifyStatus: User["gstinVerifyStatus"];
  gstinVerifiedAt: Date | null;
  gstNumber: string | null;
  businessName: string | null;
  businessAddress: string | null;
  state: string | null;
  pincode: string | null;
  mobileNumber: string | null;
  mobileVerifiedAt: Date | null;
  alternateMobileNumber: string | null;
  whatsappNumber: string | null;
  emailVerifiedAt: Date | null;
  addressVerifiedAt: Date | null;
  shopName: string | null;
  businessType: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  businessEmail: string | null;
  shopPhoneNumber: string | null;
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
  approvedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  staffRole?: SerializedStaffRole | null;
  permissions?: StaffPermission[];
};

export function toSafeUser(
  user: User & {
    staffRole?: StaffRole | null;
    pricingTier?: { code: string; discountPercent?: unknown } | null;
  }
): SafeUser {
  const staffRole = user.staffRole ? serializeStaffRole(user.staffRole) : null;
  let permissions: StaffPermission[] = [];
  if (user.role === "ADMIN") {
    permissions = ALL_STAFF_PERMISSIONS;
  } else if (user.role === "EMPLOYEE") {
    permissions = staffRole ? staffRole.permissions : ALL_STAFF_PERMISSIONS;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    isApproved: user.isApproved,
    approvalStatus: user.approvalStatus,
    accountAction: user.accountAction ?? "NONE",
    creditLimit:
      user.creditLimit != null ? String(user.creditLimit) : null,
    creditAllowed: user.creditAllowed ?? true,
    pricingTierId: user.pricingTierId ?? null,
    pricingTierCode: user.pricingTier?.code ?? null,
    pricingTierDiscountPercent:
      user.pricingTier?.discountPercent != null
        ? Number(user.pricingTier.discountPercent)
        : null,
    createdByStaffId: user.createdByStaffId ?? null,
    gstinVerifyStatus: user.gstinVerifyStatus ?? "UNKNOWN",
    gstinVerifiedAt: user.gstinVerifiedAt ?? null,
    gstNumber: user.gstNumber,
    businessName: user.businessName,
    businessAddress: user.businessAddress,
    state: user.state,
    pincode: user.pincode,
    mobileNumber: user.mobileNumber,
    mobileVerifiedAt: user.mobileVerifiedAt ?? null,
    alternateMobileNumber: user.alternateMobileNumber,
    whatsappNumber: user.whatsappNumber,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    addressVerifiedAt: user.addressVerifiedAt ?? null,
    shopName: user.shopName,
    businessType: user.businessType,
    addressLine1: user.addressLine1,
    addressLine2: user.addressLine2,
    city: user.city,
    businessEmail: user.businessEmail,
    shopPhoneNumber: user.shopPhoneNumber,
    legalBusinessName: user.legalBusinessName,
    tradeName: user.tradeName,
    gstRegistrationState: user.gstRegistrationState,
    panNumber: user.panNumber,
    billingLegalName: user.billingLegalName,
    billingAddress: user.billingAddress,
    billingCity: user.billingCity,
    billingState: user.billingState,
    billingPincode: user.billingPincode,
    billingGstState: user.billingGstState,
    shippingLegalName: user.shippingLegalName,
    shippingAddress: user.shippingAddress,
    shippingCity: user.shippingCity,
    shippingState: user.shippingState,
    shippingPincode: user.shippingPincode,
    approvedAt: user.approvedAt,
    rejectionReason: user.rejectionReason,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    staffRole,
    permissions,
  };
}

/** Approved *and* not suspended — suspended customers keep APPROVED status with isActive=false. */
export function isCustomerApproved(
  user: Pick<User, "role" | "isApproved" | "approvalStatus" | "isActive">
) {
  if (user.role !== "CUSTOMER") {
    return true;
  }
  return (
    user.isApproved &&
    user.approvalStatus === "APPROVED" &&
    user.isActive
  );
}

export function customerNeedsGst(user: Pick<User, "role" | "gstNumber">) {
  return user.role === "CUSTOMER" && !user.gstNumber;
}
