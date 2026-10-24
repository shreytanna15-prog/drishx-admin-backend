import { NextRequest, NextResponse } from "next/server";
import {
  SecurityAction,
  buildAuditRequestContext,
  recordSecurityEvent,
} from "../../../../../lib/audit";
import { jsonError } from "../../../../../lib/auth-errors";
import { prisma } from "../../../../../lib/prisma";
import {
  normalizeIndianMobile,
  parseOtpPurpose,
  sendOtpChallenge,
} from "../../../../../lib/otp";
import { getSession } from "../../../../../lib/session-auth";

export async function POST(req: NextRequest) {
  const auditCtx = buildAuditRequestContext(req);
  try {
    const body = await req.json();
    const purpose = parseOtpPurpose(body.purpose);
    const mobileNumber = normalizeIndianMobile(String(body.mobileNumber ?? ""));

    if (!purpose) {
      return jsonError("OTP_INVALID", "Invalid OTP purpose.", 400);
    }
    if (!mobileNumber) {
      return jsonError("OTP_INVALID", "Enter a valid Indian mobile number.", 400);
    }

    let createdByStaffId: string | null = null;
    if (purpose === "WALK_IN" || purpose === "ADMIN_INVITE") {
      const session = getSession(req);
      if (!session || (session.role !== "ADMIN" && session.role !== "EMPLOYEE")) {
        return jsonError(
          "FORBIDDEN",
          "Staff login required for walk-in / invite OTP.",
          403
        );
      }
      createdByStaffId = session.userId;
    }

    const result = await sendOtpChallenge({
      channel: "MOBILE",
      destination: mobileNumber,
      purpose,
      createdByStaffId,
    });

    if (!result.ok) {
      await recordSecurityEvent(prisma, {
        action: SecurityAction.OTP_FAILED,
        result: "FAILURE",
        request: auditCtx,
        message: result.message,
        context: { channel: "MOBILE", purpose, code: result.code },
      });
      return jsonError(result.code, result.message, 429);
    }

    await recordSecurityEvent(prisma, {
      action: SecurityAction.OTP_SENT,
      actorUserId: createdByStaffId,
      result: "SUCCESS",
      request: auditCtx,
      message: `Mobile OTP sent (${purpose})`,
      context: {
        channel: "MOBILE",
        purpose,
        destinationSuffix: mobileNumber.slice(-4),
        provider: result.provider,
      },
    });

    // Never return OTP/dev codes to clients — even in OTP_DEV_MODE.
    return NextResponse.json({
      ok: true,
      challengeId: result.challengeId,
      providerSessionId: result.providerSessionId,
      expiresAt: result.expiresAt.toISOString(),
      purpose,
      mobileNumber,
    });
  } catch (error) {
    console.error("POST /api/auth/otp/mobile/send error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to send OTP.";
    return NextResponse.json({ error: message, code: "OTP_INVALID" }, { status: 502 });
  }
}
