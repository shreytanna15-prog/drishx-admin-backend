import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { issueAuthTokens } from "../../../lib/auth-session";
import { getSession } from "../../../lib/session-auth";
import { toSafeUser } from "../../../lib/user-public";

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function optionalTrim(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function requiredTrim(value: unknown): string {
  return String(value ?? "").trim();
}

function composeBusinessAddress(
  addressLine1: string,
  addressLine2: string | null,
  city: string,
  state: string | null,
  pincode: string | null
) {
  return [addressLine1, addressLine2, city, state, pincode]
    .filter(Boolean)
    .join(", ");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const userId = requiredTrim(body.userId);

  const shopName = requiredTrim(body.shopName);
  const businessType = requiredTrim(body.businessType);
  const addressLine1 = requiredTrim(body.addressLine1);
  const addressLine2 = optionalTrim(body.addressLine2);
  const city = requiredTrim(body.city);
  const state = requiredTrim(body.state) || optionalTrim(body.businessState) || "";
  const pincode = requiredTrim(body.pincode) || optionalTrim(body.businessPincode) || "";
  const businessEmail = requiredTrim(body.businessEmail);
  const shopPhoneNumber = requiredTrim(body.shopPhoneNumber);

  const gstNumber = requiredTrim(body.gstNumber).toUpperCase();
  const legalBusinessName = requiredTrim(body.legalBusinessName);
  const tradeName = optionalTrim(body.tradeName);
  const gstRegistrationState = requiredTrim(body.gstRegistrationState);
  const panNumber = requiredTrim(body.panNumber).toUpperCase();

  const billingLegalName = requiredTrim(body.billingLegalName);
  const billingAddress = requiredTrim(body.billingAddress);
  const billingCity = requiredTrim(body.billingCity);
  const billingState = requiredTrim(body.billingState);
  const billingPincode = requiredTrim(body.billingPincode);
  const billingGstState = requiredTrim(body.billingGstState);

  const shippingLegalName = requiredTrim(body.shippingLegalName);
  const shippingAddress = requiredTrim(body.shippingAddress);
  const shippingCity = requiredTrim(body.shippingCity);
  const shippingState = requiredTrim(body.shippingState);
  const shippingPincode = requiredTrim(body.shippingPincode);

  // Backward-compatible fields from older clients
  const legacyBusinessName = optionalTrim(body.businessName);
  const legacyBusinessAddress = optionalTrim(body.businessAddress);

  const session = getSession(req);
  if (session && session.userId !== userId) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  if (!userId) {
    return NextResponse.json({ error: "User id is required." }, { status: 400 });
  }

  const usingLegacyPayload =
    Boolean(legacyBusinessName && legacyBusinessAddress && gstNumber) &&
    !shopName &&
    !legalBusinessName;

  if (usingLegacyPayload) {
    if (!GSTIN_REGEX.test(gstNumber)) {
      return NextResponse.json({ error: "Invalid GSTIN format." }, { status: 400 });
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

    const existingGst = await prisma.user.findUnique({ where: { gstNumber } });
    if (existingGst && existingGst.id !== userId) {
      return NextResponse.json({ error: "GST number is already registered." }, { status: 409 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        gstNumber,
        businessName: legacyBusinessName,
        businessAddress: legacyBusinessAddress,
        state: optionalTrim(body.state),
        pincode: optionalTrim(body.pincode),
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
        message: "GST details submitted. Please wait for admin approval.",
      },
      { headers: response.headers }
    );
  }

  if (
    !shopName ||
    !businessType ||
    !addressLine1 ||
    !city ||
    !state ||
    !pincode ||
    !businessEmail ||
    !shopPhoneNumber ||
    !gstNumber ||
    !legalBusinessName ||
    !gstRegistrationState ||
    !panNumber ||
    !billingLegalName ||
    !billingAddress ||
    !billingCity ||
    !billingState ||
    !billingPincode ||
    !billingGstState ||
    !shippingLegalName ||
    !shippingAddress ||
    !shippingCity ||
    !shippingState ||
    !shippingPincode
  ) {
    return NextResponse.json(
      { error: "Please complete all required business, GST, billing, and shipping fields." },
      { status: 400 }
    );
  }

  if (!GSTIN_REGEX.test(gstNumber)) {
    return NextResponse.json({ error: "Invalid GSTIN format." }, { status: 400 });
  }

  if (!PAN_REGEX.test(panNumber)) {
    return NextResponse.json({ error: "Invalid PAN format." }, { status: 400 });
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

  const existingGst = await prisma.user.findUnique({ where: { gstNumber } });
  if (existingGst && existingGst.id !== userId) {
    return NextResponse.json({ error: "GST number is already registered." }, { status: 409 });
  }

  const businessAddress = composeBusinessAddress(
    addressLine1,
    addressLine2,
    city,
    state,
    pincode
  );

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      gstNumber,
      businessName: shopName || user.businessName || legalBusinessName,
      businessAddress,
      state,
      pincode,
      shopName,
      businessType,
      addressLine1,
      addressLine2,
      city,
      businessEmail,
      shopPhoneNumber,
      legalBusinessName,
      tradeName,
      gstRegistrationState,
      panNumber,
      billingLegalName,
      billingAddress,
      billingCity,
      billingState,
      billingPincode,
      billingGstState,
      shippingLegalName,
      shippingAddress,
      shippingCity,
      shippingState,
      shippingPincode,
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
      message: "Registration details submitted. Please wait for admin approval.",
    },
    {
      headers: response.headers,
    }
  );
}
