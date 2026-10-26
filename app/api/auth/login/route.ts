import { NextRequest, NextResponse } from "next/server";
import { prisma, withDbRetry } from "../../../lib/prisma";
import { verifyPassword } from "../../../lib/auth";
import { issueAuthTokens, inactiveStaffLoginError } from "../../../lib/auth-session";
import {
  SecurityAction,
  buildAuditRequestContext,
  recordSecurityEvent,
} from "../../../lib/audit";

export async function POST(req: NextRequest) {
  const auditCtx = buildAuditRequestContext(req);
  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "").trim();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const user = await withDbRetry(() =>
      prisma.user.findUnique({
        where: { email },
        include: {
          staffRole: true,
          pricingTier: { select: { code: true, discountPercent: true } },
        },
      })
    );
    if (!user) {
      await recordSecurityEvent(prisma, {
        action: SecurityAction.LOGIN_FAILED,
        actorEmail: email,
        result: "FAILURE",
        request: auditCtx,
        message: "Invalid credentials — user not found",
      });
      return NextResponse.json(
        { error: "Invalid credentials.", code: "TOKEN_INVALID" },
        { status: 401 }
      );
    }

    const isMatch = await verifyPassword(password, user.password);
    if (!isMatch) {
      await recordSecurityEvent(prisma, {
        action: SecurityAction.LOGIN_FAILED,
        actorUserId: user.id,
        actorEmail: email,
        result: "FAILURE",
        request: auditCtx,
        message: "Invalid credentials — password mismatch",
      });
      return NextResponse.json(
        { error: "Invalid credentials.", code: "TOKEN_INVALID" },
        { status: 401 }
      );
    }

    // Blocks inactive staff and suspended customers. Rejected customers may log in.
    const inactiveError = inactiveStaffLoginError(user);
    if (inactiveError) {
      return inactiveError;
    }

    await recordSecurityEvent(prisma, {
      action: SecurityAction.LOGIN_SUCCESS,
      actorUserId: user.id,
      actorEmail: email,
      result: "SUCCESS",
      request: auditCtx,
      message: `Login successful (${user.role})`,
      context: { role: user.role },
    });

    return issueAuthTokens(req, user);
  } catch (error) {
    console.error("POST /api/auth/login error:", error);
    const message =
      error instanceof Error && /max clients|emaxconn/i.test(error.message)
        ? "Database is busy. Please wait a few seconds and try again."
        : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
