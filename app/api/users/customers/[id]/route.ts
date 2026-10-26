import { NextRequest, NextResponse } from "next/server";

import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../../lib/audit";
import { parseAdminCustomerPatchBody } from "../../../../lib/admin-customer-write";
import { composeBusinessAddress } from "../../../../lib/customer-registration";
import { getCustomerOutstanding } from "../../../../lib/finance/credit-limit";
import { prisma } from "../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { toSafeUser } from "../../../../lib/user-public";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Staff authorization required." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const customer = await prisma.user.findFirst({
      where: {
        id,
        role: "CUSTOMER",
      },
      include: {
        pricingTier: { select: { code: true, discountPercent: true } },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const outstanding = await getCustomerOutstanding(customer.id);
    const limitRaw =
      customer.creditLimit != null ? Number(customer.creditLimit) : null;
    const availableCredit =
      limitRaw != null && Number.isFinite(limitRaw)
        ? Math.max(0, Math.round((limitRaw - outstanding) * 100) / 100)
        : null;

    return NextResponse.json({
      customer: toSafeUser(customer),
      finance: {
        outstanding,
        creditLimit: limitRaw,
        availableCredit,
        creditAllowed: customer.creditAllowed ?? true,
        accountAction: customer.accountAction ?? "NONE",
      },
    });
  } catch (error) {
    console.error("GET /api/users/customers/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * Admin PATCH — direct apply; does not flip approvalStatus to pending.
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const existing = await prisma.user.findFirst({
      where: { id, role: "CUSTOMER" },
    });
    if (!existing) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const parsed = parseAdminCustomerPatchBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const data = { ...parsed.data };

    if ("email" in data && typeof data.email === "string") {
      const emailTaken = await prisma.user.findFirst({
        where: { email: data.email, NOT: { id } },
        select: { id: true },
      });
      if (emailTaken) {
        return NextResponse.json(
          { error: "A user with this email already exists." },
          { status: 409 }
        );
      }
    }

    if ("mobileNumber" in data && typeof data.mobileNumber === "string") {
      const mobileTaken = await prisma.user.findFirst({
        where: {
          role: "CUSTOMER",
          mobileNumber: data.mobileNumber,
          NOT: { id },
        },
        select: { id: true },
      });
      if (mobileTaken) {
        return NextResponse.json(
          { error: "A customer with this mobile number already exists." },
          { status: 409 }
        );
      }
    }

    if ("gstNumber" in data && data.gstNumber) {
      const gstTaken = await prisma.user.findFirst({
        where: {
          gstNumber: String(data.gstNumber),
          NOT: { id },
        },
        select: { id: true },
      });
      if (gstTaken) {
        return NextResponse.json(
          { error: "A customer with this GSTIN already exists." },
          { status: 409 }
        );
      }
    }

    if (
      !("businessAddress" in body) &&
      ("addressLine1" in body ||
        "addressLine2" in body ||
        "city" in body ||
        "state" in body ||
        "pincode" in body)
    ) {
      data.businessAddress = composeBusinessAddress({
        addressLine1:
          "addressLine1" in body
            ? (data.addressLine1 as string | null)
            : existing.addressLine1,
        addressLine2:
          "addressLine2" in body
            ? (data.addressLine2 as string | null)
            : existing.addressLine2,
        city: "city" in body ? (data.city as string | null) : existing.city,
        state: "state" in body ? (data.state as string | null) : existing.state,
        pincode:
          "pincode" in body ? (data.pincode as string | null) : existing.pincode,
      });
    }

    const pricingTierConnect = data.pricingTier;
    if (
      pricingTierConnect &&
      typeof pricingTierConnect === "object" &&
      "connect" in pricingTierConnect &&
      pricingTierConnect.connect &&
      typeof pricingTierConnect.connect === "object" &&
      "id" in pricingTierConnect.connect &&
      pricingTierConnect.connect.id
    ) {
      const tier = await prisma.pricingTier.findUnique({
        where: { id: String(pricingTierConnect.connect.id) },
        select: { id: true },
      });
      if (!tier) {
        return NextResponse.json(
          { error: "Invalid pricing tier." },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      include: {
        pricingTier: { select: { code: true, discountPercent: true } },
      },
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.CUSTOMER_UPDATED,
      module: AuditModule.CUSTOMER,
      entityType: "User",
      entityId: id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      context: {
        fields: Object.keys(body),
      },
      activityMessage: "Customer profile updated by admin",
    });

    return NextResponse.json({
      customer: toSafeUser(updated),
      message: "Customer updated.",
    });
  } catch (error) {
    console.error("PATCH /api/users/customers/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
