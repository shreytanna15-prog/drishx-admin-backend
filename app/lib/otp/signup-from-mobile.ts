import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { hashPassword } from "../auth";
import { optionalTrim } from "../customer-registration";
import { prisma } from "../prisma";
import { placeholderEmailForMobile } from "./signup-email";

export { isPlaceholderOtpEmail, placeholderEmailForMobile } from "./signup-email";

export type CreateCustomerFromMobileInput = {
  mobileNumber: string;
  name?: string | null;
  businessName?: string | null;
  alternateMobileNumber?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
};

/**
 * Path A: create CUSTOMER after successful mobile OTP (SIGNUP).
 * Email optional — uses placeholder when omitted (migrate to nullable later).
 */
export async function createCustomerFromMobileOtp(
  input: CreateCustomerFromMobileInput
): Promise<User> {
  const mobileNumber = input.mobileNumber;
  const name = optionalTrim(input.name) ?? `Customer ${mobileNumber.slice(-4)}`;
  const businessName = optionalTrim(input.businessName);
  const alternateMobileNumber = optionalTrim(input.alternateMobileNumber);
  const whatsappNumber = optionalTrim(input.whatsappNumber);
  const emailRaw = optionalTrim(input.email)?.toLowerCase();
  const email = emailRaw || placeholderEmailForMobile(mobileNumber);

  if (emailRaw) {
    const emailTaken = await prisma.user.findUnique({ where: { email: emailRaw } });
    if (emailTaken) {
      const err = new Error("EMAIL_IN_USE");
      throw err;
    }
  }

  const password = await hashPassword(randomBytes(32).toString("base64url"));

  return prisma.user.create({
    data: {
      email,
      password,
      name,
      businessName,
      mobileNumber,
      alternateMobileNumber,
      whatsappNumber,
      mobileVerifiedAt: new Date(),
      role: "CUSTOMER",
      isActive: false,
      isApproved: false,
      approvalStatus: "PENDING_REVIEW",
    },
  });
}
