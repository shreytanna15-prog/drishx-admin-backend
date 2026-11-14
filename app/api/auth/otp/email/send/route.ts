import { NextRequest, NextResponse } from "next/server";
import {
  SecurityAction,
  buildAuditRequestContext,
  recordSecurityEvent,
} from "../../../../../lib/audit";
import { jsonError } from "../../../../../lib/auth-errors";
import { prisma } from "../../../../../lib/prisma";
import { sendOtpChallenge } from "../../../../../lib/otp";
import { getSession } from "../../../../../lib/session-auth";
import { emailOtpSendBodySchema } from "../../../../../lib/validation/otp";
import { parseOrError } from "../../../../../lib/validation/parse";

export async function POST(req: NextRequest) {
  const auditCtx = buildAuditRequestContext(req);
  try {
    const body = await req.json();
    const parsed = parseOrError(emailOtpSendBodySchema, body);
    if (!parsed.ok) {
      return jsonError("OTP_INVALID", parsed.error, 400);
    }
    const { purpose, email } = parsed.data;

    const session = getSession(req);
    if (purpose === "WALK_IN" || purpose === "ADMIN_INVITE") {
      if (!session || (session.role !== "ADMIN" && session.role !== "EMPLOYEE")) {
        return jsonError(
          "FORBIDDEN",
          "Staff login required for walk-in / invite OTP.",
          403
        );
      }
    }
    const createdByStaffId =
      session && (session.role === "ADMIN" || session.role === "EMPLOYEE")
        ? session.userId
        : null;

    const result = await sendOtpChallenge({
      channel: "EMAIL",
      destination: email,
      purpose,
      createdByStaffId,
    });

    if (!result.ok) {
      await recordSecurityEvent(prisma, {
        action: SecurityAction.OTP_FAILED,
        result: "FAILURE",
        request: auditCtx,
        message: result.message,
        context: { channel: "EMAIL", purpose, code: result.code },
      });
      return jsonError(result.code, result.message, 429);
    }

    await recordSecurityEvent(prisma, {
      action: SecurityAction.OTP_SENT,
      actorUserId: createdByStaffId ?? session?.userId ?? null,
      actorEmail: email,
      result: "SUCCESS",
      request: auditCtx,
      message: `Email OTP sent (${purpose})`,
      context: { channel: "EMAIL", purpose, provider: result.provider },
    });

    // Never return OTP/dev codes to clients — even in OTP_DEV_MODE.
    return NextResponse.json({
      ok: true,
      challengeId: result.challengeId,
      providerSessionId: result.providerSessionId,
      expiresAt: result.expiresAt.toISOString(),
      purpose,
      email,
    });
  } catch (error) {
    console.error("POST /api/auth/otp/email/send error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to send email OTP.";
    return NextResponse.json({ error: message, code: "OTP_INVALID" }, { status: 502 });
  }
}
