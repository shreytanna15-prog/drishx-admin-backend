import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../lib/audit";
import { hashPassword } from "../../../lib/auth";
import { parseAdminCustomerCreateBody } from "../../../lib/admin-customer-write";
import {
  buildCustomersListWhere,
  parseCustomersListParams,
} from "../../../lib/customers-list";
import { placeholderEmailForMobile } from "../../../lib/otp/signup-email";
import { prisma } from "../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { toSafeUser } from "../../../lib/user-public";

/**
 * Customer directory for staff (RW-11 Phase C — paginated).
 * - status=approved (default): approved customers
 * - status=rejected: rejected applications
 * - status=suspended: approved but inactive (suspended)
 * Query: page, limit, q, status, activeOnly, accountAction, tierCode
 * Response: { items, customers (compat), page, limit, hasMore, total, status, activeOnly }
 */
export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Staff authorization required." }, { status: 403 });
  }

  try {
    const searchParams = new URL(req.url).searchParams;
    const params = parseCustomersListParams(searchParams);
    const where = buildCustomersListWhere(params);
    const skip = (params.page - 1) * params.limit;

    const [total, customers] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: [{ businessName: "asc" }, { email: "asc" }],
        skip,
        take: params.limit,
        include: {
          pricingTier: { select: { code: true, discountPercent: true } },
        },
      }),
    ]);

    const items = customers.map(toSafeUser);
    const hasMore = skip + items.length < total;

    return NextResponse.json({
      items,
      /** Backward-compatible alias for Phase B/C cutover clients. */
      customers: items,
      page: params.page,
      limit: params.limit,
      hasMore,
      total,
      status: params.status,
      activeOnly: params.activeOnly,
    });
  } catch (error) {
    console.error("GET /api/users/customers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * Path B — Admin creates customer (PENDING_REVIEW + createdByStaffId).
 */
export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 403 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const parsed = parseAdminCustomerCreateBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const fields = parsed.data;

    const mobileTaken = await prisma.user.findFirst({
      where: { role: "CUSTOMER", mobileNumber: fields.mobileNumber },
      select: { id: true },
    });
    if (mobileTaken) {
      return NextResponse.json(
        { error: "A customer with this mobile number already exists." },
        { status: 409 }
      );
    }

    const email = fields.email || placeholderEmailForMobile(fields.mobileNumber);
    if (fields.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email: fields.email },
        select: { id: true },
      });
      if (emailTaken) {
        return NextResponse.json(
          { error: "A user with this email already exists." },
          { status: 409 }
        );
      }
    }

    if (fields.gstNumber) {
      const gstTaken = await prisma.user.findUnique({
        where: { gstNumber: fields.gstNumber },
        select: { id: true },
      });
      if (gstTaken) {
        return NextResponse.json(
          { error: "A customer with this GSTIN already exists." },
          { status: 409 }
        );
      }
    }

    const password = await hashPassword(randomBytes(32).toString("base64url"));
    const created = await prisma.user.create({
      data: {
        email,
        password,
        name: fields.name ?? `Customer ${fields.mobileNumber.slice(-4)}`,
        mobileNumber: fields.mobileNumber,
        alternateMobileNumber: fields.alternateMobileNumber,
        whatsappNumber: fields.whatsappNumber,
        businessName: fields.businessName,
        shopName: fields.shopName,
        businessType: fields.businessType,
        addressLine1: fields.addressLine1,
        addressLine2: fields.addressLine2,
        city: fields.city,
        state: fields.state,
        pincode: fields.pincode,
        businessEmail: fields.businessEmail,
        shopPhoneNumber: fields.shopPhoneNumber,
        businessAddress: fields.businessAddress,
        gstNumber: fields.gstNumber,
        panNumber: fields.panNumber,
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
        creditLimit: fields.creditLimit ?? null,
        creditAllowed: fields.creditAllowed ?? true,
        pricingTierId: fields.pricingTierId ?? null,
        role: "CUSTOMER",
        isActive: false,
        isApproved: false,
        approvalStatus: "PENDING_REVIEW",
        createdByStaffId: session.userId,
        accountAction: "NONE",
      },
      include: {
        pricingTier: { select: { code: true, discountPercent: true } },
      },
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.CUSTOMER_CREATED,
      module: AuditModule.CUSTOMER,
      entityType: "User",
      entityId: created.id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      context: {
        email: created.email,
        mobileNumber: created.mobileNumber,
        path: "ADMIN_CREATE",
      },
      activityMessage: "Customer created by admin (Path B)",
    });

    return NextResponse.json(
      { customer: toSafeUser(created), message: "Customer created." },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/users/customers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
