import { NextRequest, NextResponse } from "next/server";

import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../../lib/audit";
import { isValidGstinFormat, verifyGstinCloud } from "../../../../lib/gst/gstin-cloud";
import { prisma } from "../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { toSafeUser } from "../../../../lib/user-public";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Admin-only on-demand GSTIN.cloud check. Never call from signup/OTP.
 */
export async function POST(req: NextRequest, context: RouteContext) {
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
    const user = await prisma.user.findFirst({
      where: { id, role: "CUSTOMER" },
    });
    if (!user) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const gstin = user.gstNumber?.trim() ?? "";
    if (!gstin) {
      return NextResponse.json(
        { error: "Customer has no GSTIN on file." },
        { status: 400 }
      );
    }
    if (!isValidGstinFormat(gstin)) {
      return NextResponse.json(
        { error: "GSTIN on file has an invalid format." },
        { status: 400 }
      );
    }

    const result = await verifyGstinCloud(gstin);
    const gstinVerifyStatus =
      result.status === "ACTIVE"
        ? ("ACTIVE" as const)
        : result.status === "INACTIVE"
          ? ("INACTIVE" as const)
          : result.status === "INVALID"
            ? ("INVALID" as const)
            : ("ERROR" as const);

    const sanitizedRaw = {
      status: result.status,
      legalName: result.legalName ?? null,
      tradeName: result.tradeName ?? null,
      state: result.state ?? null,
      mock:
        result.raw &&
        typeof result.raw === "object" &&
        "mock" in result.raw
          ? Boolean((result.raw as { mock?: boolean }).mock)
          : false,
    };

    const updated = await prisma.user.update({
      where: { id },
      data: {
        gstinVerifyStatus,
        gstinVerifiedAt: new Date(),
        gstinVerifiedById: session.userId,
        gstinVerifyRaw: sanitizedRaw,
      },
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.GSTIN_VERIFIED,
      module: AuditModule.CUSTOMER,
      entityType: "User",
      entityId: id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      context: {
        gstin: result.gstin,
        status: result.status,
      },
      activityMessage: `GSTIN verify result: ${result.status}`,
    });

    return NextResponse.json({
      customer: toSafeUser(updated),
      verify: {
        status: result.status,
        legalName: result.legalName ?? null,
        tradeName: result.tradeName ?? null,
        state: result.state ?? null,
      },
      message: `GST verify: ${result.status}.`,
    });
  } catch (error) {
    console.error("POST /api/users/[id]/verify-gst error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
