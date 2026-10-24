import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../../lib/audit";
import { hashPassword } from "../../../../lib/auth";
import { optionalTrim } from "../../../../lib/customer-registration";
import { normalizeIndianMobile } from "../../../../lib/otp/mobile-normalize";
import { placeholderEmailForMobile } from "../../../../lib/otp/signup-email";
import { assertWalkInMobileVerified } from "../../../../lib/otp/walk-in-challenge";
import { prisma } from "../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { toSafeUser } from "../../../../lib/user-public";

/**
 * Path C — Employee/Admin walk-in create after mobile OTP (WALK_IN).
 * No tier/credit. PENDING_REVIEW + createdByStaffId for on-behalf orders.
 */
export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Staff authorization required." }, { status: 403 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const mobileNumber = normalizeIndianMobile(String(body.mobileNumber ?? ""));
    const challengeId = String(body.challengeId ?? "").trim();

    if (!mobileNumber) {
      return NextResponse.json(
        { error: "A valid 10-digit Indian mobile number is required." },
        { status: 400 }
      );
    }
    if (!challengeId) {
      return NextResponse.json(
        { error: "challengeId from mobile OTP verify is required." },
        { status: 400 }
      );
    }

    const verified = await assertWalkInMobileVerified({
      mobileNumber,
      challengeId,
    });
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: 400 });
    }

    const existing = await prisma.user.findFirst({
      where: { role: "CUSTOMER", mobileNumber },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: "A customer with this mobile number already exists.",
          customer: toSafeUser(existing),
        },
        { status: 409 }
      );
    }

    const name =
      optionalTrim(body.name) ?? `Walk-in ${mobileNumber.slice(-4)}`;
    const shopName = optionalTrim(body.shopName);
    const businessName = optionalTrim(body.businessName) ?? shopName;
    const emailRaw = optionalTrim(body.email)?.toLowerCase() ?? null;
    if (emailRaw) {
      const emailTaken = await prisma.user.findUnique({
        where: { email: emailRaw },
        select: { id: true },
      });
      if (emailTaken) {
        return NextResponse.json(
          { error: "A user with this email already exists." },
          { status: 409 }
        );
      }
    }

    const email = emailRaw || placeholderEmailForMobile(mobileNumber);
    const password = await hashPassword(randomBytes(32).toString("base64url"));

    const created = await prisma.user.create({
      data: {
        email,
        password,
        name,
        shopName,
        businessName,
        mobileNumber,
        mobileVerifiedAt: new Date(),
        role: "CUSTOMER",
        isActive: false,
        isApproved: false,
        approvalStatus: "PENDING_REVIEW",
        createdByStaffId: session.userId,
        accountAction: "NONE",
        creditAllowed: true,
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
        path: "WALK_IN",
        challengeId,
      },
      activityMessage: "Walk-in customer created by staff (Path C)",
    });

    return NextResponse.json(
      {
        customer: toSafeUser(created),
        message: "Walk-in customer created.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/users/customers/walk-in error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
