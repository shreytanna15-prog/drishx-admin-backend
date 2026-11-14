import { NextRequest, NextResponse } from "next/server";
import {
  SecurityAction,
  buildAuditRequestContext,
  recordSecurityEvent,
} from "../../../../../lib/audit";
import { jsonError } from "../../../../../lib/auth-errors";
import { prisma, withDbRetry } from "../../../../../lib/prisma";
import { verifyOtpChallenge } from "../../../../../lib/otp";
import { isPlaceholderOtpEmail } from "../../../../../lib/otp/signup-from-mobile";
import { getSession } from "../../../../../lib/session-auth";
import { toSafeUser } from "../../../../../lib/user-public";
import { emailOtpVerifyBodySchema } from "../../../../../lib/validation/otp";
import { parseOrError } from "../../../../../lib/validation/parse";

export async function POST(req: NextRequest) {
  const auditCtx = buildAuditRequestContext(req);
  try {
    const body = await req.json();
    const parsed = parseOrError(emailOtpVerifyBodySchema, body);
    if (!parsed.ok) {
      return jsonError("OTP_INVALID", parsed.error, 400);
    }
    const { purpose, email, code, providerSessionId } = parsed.data;

    const verified = await verifyOtpChallenge({
      channel: "EMAIL",
      destination: email,
      purpose,
      code,
      providerSessionId,
    });

    if (!verified.ok) {
      await recordSecurityEvent(prisma, {
        action: SecurityAction.OTP_FAILED,
        actorEmail: email,
        result: "FAILURE",
        request: auditCtx,
        message: verified.message,
        context: { channel: "EMAIL", purpose, code: verified.code },
      });
      const status = verified.code === "OTP_RATE_LIMITED" ? 429 : 400;
      return jsonError(verified.code, verified.message, status);
    }

    const session = getSession(req);
    let user = await withDbRetry(() =>
      prisma.user.findUnique({
        where: { email },
        include: { staffRole: true },
      })
    );

    // Path A: attach verified email to the signed-in customer (placeholder → real).
    if (
      !user &&
      session?.role === "CUSTOMER" &&
      (purpose === "SIGNUP" || purpose === "VERIFY_EMAIL")
    ) {
      const sessionUser = await prisma.user.findUnique({
        where: { id: session.userId },
        include: { staffRole: true },
      });
      if (
        sessionUser?.role === "CUSTOMER" &&
        isPlaceholderOtpEmail(sessionUser.email)
      ) {
        try {
          user = await prisma.user.update({
            where: { id: sessionUser.id },
            data: {
              email,
              emailVerifiedAt: new Date(),
            },
            include: { staffRole: true },
          });
        } catch {
          return jsonError(
            "OTP_INVALID",
            "This email is already registered.",
            409
          );
        }
      }
    } else if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
        include: { staffRole: true },
      });
    }

    await recordSecurityEvent(prisma, {
      action: SecurityAction.OTP_VERIFIED,
      actorUserId: user?.id ?? session?.userId ?? null,
      actorEmail: email,
      result: "SUCCESS",
      request: auditCtx,
      message: `Email OTP verified (${purpose})`,
      context: {
        channel: "EMAIL",
        purpose,
        challengeId: verified.challengeId,
      },
    });

    return NextResponse.json({
      ok: true,
      purpose,
      email,
      emailVerified: true,
      challengeId: verified.challengeId,
      user: user ? toSafeUser(user) : null,
    });
  } catch (error) {
    console.error("POST /api/auth/otp/email/verify error:", error);
    return NextResponse.json(
      { error: "Failed to verify email OTP.", code: "OTP_INVALID" },
      { status: 502 }
    );
  }
}
