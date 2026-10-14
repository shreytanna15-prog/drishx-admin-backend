import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { issueAuthTokens } from "../../../lib/auth-session";
import { getSession } from "../../../lib/session-auth";
import { toSafeUser } from "../../../lib/user-public";
import {
  composeBusinessAddress,
  isLegacyGstPayload,
  parseSparseRegistrationBody,
  resolveBusinessName,
  validateOptionalGstinPan,
} from "../../../lib/customer-registration";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, unknown>;
  const userId = String(body.userId ?? "").trim();
  const fields = parseSparseRegistrationBody(body);

  const session = getSession(req);
  if (session && session.userId !== userId) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  if (!userId) {
    return NextResponse.json({ error: "User id is required." }, { status: 400 });
  }

  const tax = validateOptionalGstinPan({
    gstNumber: fields.gstNumber,
    panNumber: fields.panNumber,
  });
  if (!tax.ok) {
    return NextResponse.json({ error: tax.error }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (user.role !== "CUSTOMER") {
    return NextResponse.json(
      { error: "GST details are only required for customer accounts." },
      { status: 400 }
    );
  }
  if (user.approvalStatus === "APPROVED") {
    return NextResponse.json({ error: "Account is already approved." }, { status: 400 });
  }

  if (tax.gstNumber) {
    const existingGst = await prisma.user.findUnique({
      where: { gstNumber: tax.gstNumber },
    });
    if (existingGst && existingGst.id !== userId) {
      return NextResponse.json(
        { error: "GST number is already registered." },
        { status: 409 }
      );
    }
  }

  // Legacy clients: businessName + businessAddress + gstNumber only
  if (isLegacyGstPayload({ ...fields, gstNumber: tax.gstNumber })) {
    if (!tax.gstNumber) {
      return NextResponse.json({ error: "Invalid GSTIN format." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        gstNumber: tax.gstNumber,
        businessName: fields.legacyBusinessName,
        businessAddress: fields.legacyBusinessAddress,
        state: fields.state,
        pincode: fields.pincode,
        approvalStatus: "PENDING_REVIEW",
        isApproved: false,
        isActive: false,
        rejectionReason: null,
      },
      include: { staffRole: true },
    });

    const response = await issueAuthTokens(req, updated);
    const payload = await response.json();
    return NextResponse.json(
      {
        ...payload,
        user: toSafeUser(updated),
        message: "GST details submitted. Please wait for admin approval.",
      },
      { headers: response.headers }
    );
  }

  // RW-07: all business / GST / address fields optional. Empty → null (no placeholders).
  const businessAddress = composeBusinessAddress({
    addressLine1: fields.addressLine1,
    addressLine2: fields.addressLine2,
    city: fields.city,
    state: fields.state,
    pincode: fields.pincode,
  });

  const businessName = resolveBusinessName({
    shopName: fields.shopName,
    legalBusinessName: fields.legalBusinessName,
    legacyBusinessName: fields.legacyBusinessName,
    existingBusinessName: user.businessName,
  });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      gstNumber: tax.gstNumber,
      panNumber: tax.panNumber,
      businessName,
      businessAddress,
      state: fields.state,
      pincode: fields.pincode,
      shopName: fields.shopName,
      businessType: fields.businessType,
      addressLine1: fields.addressLine1,
      addressLine2: fields.addressLine2,
      city: fields.city,
      businessEmail: fields.businessEmail,
      shopPhoneNumber: fields.shopPhoneNumber,
      legalBusinessName: fields.legalBusinessName,
      tradeName: fields.tradeName,
      gstRegistrationState: fields.gstRegistrationState,
      billingLegalName: fields.billingLegalName,
      billingAddress: fields.billingAddress,
      billingCity: fields.billingCity,
      billingState: fields.billingState,
      billingPincode: fields.billingPincode,
      billingGstState: fields.billingGstState,
      shippingLegalName: fields.shippingLegalName,
      shippingAddress: fields.shippingAddress,
      shippingCity: fields.shippingCity,
      shippingState: fields.shippingState,
      shippingPincode: fields.shippingPincode,
      approvalStatus: "PENDING_REVIEW",
      isApproved: false,
      isActive: false,
      rejectionReason: null,
    },
    include: { staffRole: true },
  });

  const response = await issueAuthTokens(req, updated);
  const payload = await response.json();
  const message = tax.gstNumber
    ? "Registration details submitted. Please wait for admin approval."
    : "Registration submitted without GST. An admin can review your incomplete profile.";

  return NextResponse.json(
    {
      ...payload,
      user: toSafeUser(updated),
      message,
    },
    {
      headers: response.headers,
    }
  );
}
