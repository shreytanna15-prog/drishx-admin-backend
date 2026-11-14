import { NextRequest, NextResponse } from "next/server";
import {
  SecurityAction,
  buildAuditRequestContext,
  recordSecurityEvent,
} from "../../../../../lib/audit";
import { jsonError } from "../../../../../lib/auth-errors";
import {
  inactiveStaffLoginError,
  issueAuthTokens,
} from "../../../../../lib/auth-session";
import { optionalTrim } from "../../../../../lib/customer-registration";
import { prisma, withDbRetry } from "../../../../../lib/prisma";
import { verifyOtpChallenge } from "../../../../../lib/otp";
import { createCustomerFromMobileOtp } from "../../../../../lib/otp/signup-from-mobile";
import { toSafeUser } from "../../../../../lib/user-public";
import { classifyWalkInCustomer } from "../../../../../lib/walk-in-classify";
import { mobileOtpVerifyBodySchema } from "../../../../../lib/validation/otp";
import { parseOrError } from "../../../../../lib/validation/parse";

export async function POST(req: NextRequest) {
  const auditCtx = buildAuditRequestContext(req);
  try {
    const body = await req.json();
    const parsed = parseOrError(mobileOtpVerifyBodySchema, body);
    if (!parsed.ok) {
      return jsonError("OTP_INVALID", parsed.error, 400);
    }
    const { purpose, mobileNumber, code, providerSessionId } = parsed.data;

    const verified = await verifyOtpChallenge({
      channel: "MOBILE",
      destination: mobileNumber,
      purpose,
      code,
      providerSessionId,
    });

    if (!verified.ok) {
      await recordSecurityEvent(prisma, {
        action: SecurityAction.OTP_FAILED,
        result: "FAILURE",
        request: auditCtx,
        message: verified.message,
        context: {
          channel: "MOBILE",
          purpose,
          destinationSuffix: mobileNumber.slice(-4),
          code: verified.code,
        },
      });
      const status = verified.code === "OTP_RATE_LIMITED" ? 429 : 400;
      return jsonError(verified.code, verified.message, status);
    }

    const userInclude = {
      staffRole: true,
      pricingTier: { select: { code: true, discountPercent: true } },
    } as const;

    let user = await withDbRetry(() =>
      prisma.user.findFirst({
        where: { mobileNumber, role: "CUSTOMER" },
        include: userInclude,
      })
    );

    // Path A: create customer on first successful SIGNUP OTP.
    if (purpose === "SIGNUP") {
      if (user) {
        await recordSecurityEvent(prisma, {
          action: SecurityAction.OTP_FAILED,
          actorUserId: user.id,
          actorEmail: user.email,
          result: "FAILURE",
          request: auditCtx,
          message: "Mobile already registered",
          context: { channel: "MOBILE", purpose, code: "MOBILE_IN_USE" },
        });
        return jsonError(
          "MOBILE_IN_USE",
          "This mobile number is already registered. Please log in.",
          409
        );
      }

      try {
        const created = await createCustomerFromMobileOtp({
          mobileNumber,
          name: optionalTrim(body.name),
          businessName: optionalTrim(body.businessName),
          alternateMobileNumber: optionalTrim(body.alternateMobileNumber),
          whatsappNumber: optionalTrim(body.whatsappNumber),
          email: optionalTrim(body.email),
        });
        user = await prisma.user.findUniqueOrThrow({
          where: { id: created.id },
          include: userInclude,
        });
      } catch (err) {
        if (err instanceof Error && err.message === "EMAIL_IN_USE") {
          return jsonError(
            "OTP_INVALID",
            "This email is already registered.",
            409
          );
        }
        throw err;
      }

      await recordSecurityEvent(prisma, {
        action: SecurityAction.OTP_VERIFIED,
        actorUserId: user.id,
        actorEmail: user.email,
        result: "SUCCESS",
        request: auditCtx,
        message: "Mobile OTP verified — Path A signup",
        context: {
          channel: "MOBILE",
          purpose,
          destinationSuffix: mobileNumber.slice(-4),
          challengeId: verified.challengeId,
        },
      });

      await recordSecurityEvent(prisma, {
        action: SecurityAction.LOGIN_SUCCESS,
        actorUserId: user.id,
        actorEmail: user.email,
        result: "SUCCESS",
        request: auditCtx,
        message: "Signup session issued via mobile OTP",
        context: { role: user.role, via: "MOBILE_OTP_SIGNUP" },
      });

      return issueAuthTokens(req, user);
    }

    // RC-06: classify before mutating Path A on WALK_IN.
    if (purpose === "WALK_IN") {
      const walkIn = classifyWalkInCustomer(user);
      if (walkIn.kind === "path_a") {
        await recordSecurityEvent(prisma, {
          action: SecurityAction.OTP_VERIFIED,
          actorUserId: user?.id ?? null,
          actorEmail: user?.email ?? null,
          result: "SUCCESS",
          request: auditCtx,
          message: "WALK_IN OTP verified but Path A rejected for walk-in",
          context: {
            channel: "MOBILE",
            purpose,
            destinationSuffix: mobileNumber.slice(-4),
            challengeId: verified.challengeId,
            code: "WALK_IN_PATH_A",
          },
        });
        return NextResponse.json({
          ok: true,
          purpose,
          mobileNumber,
          mobileVerified: false,
          challengeId: verified.challengeId,
          user: null,
          walkInKind: "path_a",
          code: "WALK_IN_PATH_A",
          message: walkIn.message,
        });
      }
      if (walkIn.kind === "staff_created" && !walkIn.orderable) {
        await recordSecurityEvent(prisma, {
          action: SecurityAction.OTP_VERIFIED,
          actorUserId: user?.id ?? null,
          actorEmail: user?.email ?? null,
          result: "SUCCESS",
          request: auditCtx,
          message: "WALK_IN OTP verified but customer not orderable",
          context: {
            channel: "MOBILE",
            purpose,
            destinationSuffix: mobileNumber.slice(-4),
            challengeId: verified.challengeId,
            code: "WALK_IN_NOT_ORDERABLE",
          },
        });
        return NextResponse.json({
          ok: true,
          purpose,
          mobileNumber,
          mobileVerified: Boolean(user?.mobileVerifiedAt),
          challengeId: verified.challengeId,
          user: null,
          walkInKind: "staff_created",
          code: "WALK_IN_NOT_ORDERABLE",
          message: walkIn.message,
        });
      }
    }

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { mobileVerifiedAt: new Date() },
      });
      user = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        include: userInclude,
      });
    }

    await recordSecurityEvent(prisma, {
      action: SecurityAction.OTP_VERIFIED,
      actorUserId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      result: "SUCCESS",
      request: auditCtx,
      message: `Mobile OTP verified (${purpose})`,
      context: {
        channel: "MOBILE",
        purpose,
        destinationSuffix: mobileNumber.slice(-4),
        challengeId: verified.challengeId,
      },
    });

    if (purpose === "LOGIN") {
      if (!user) {
        return jsonError(
          "OTP_INVALID",
          "No customer account found for this mobile number.",
          404
        );
      }
      const inactiveError = inactiveStaffLoginError(user);
      if (inactiveError) {
        return inactiveError;
      }
      await recordSecurityEvent(prisma, {
        action: SecurityAction.LOGIN_SUCCESS,
        actorUserId: user.id,
        actorEmail: user.email,
        result: "SUCCESS",
        request: auditCtx,
        message: "Login successful via mobile OTP",
        context: { role: user.role, via: "MOBILE_OTP" },
      });
      return issueAuthTokens(req, user);
    }

    // RC-06: only staff-created (or none) reach here for WALK_IN.
    if (purpose === "WALK_IN") {
      const walkIn = classifyWalkInCustomer(user);
      const selectableUser =
        walkIn.kind === "staff_created" && walkIn.selectable && user
          ? toSafeUser(user)
          : null;
      return NextResponse.json({
        ok: true,
        purpose,
        mobileNumber,
        mobileVerified: true,
        challengeId: verified.challengeId,
        user: selectableUser,
        walkInKind: walkIn.kind,
      });
    }

    return NextResponse.json({
      ok: true,
      purpose,
      mobileNumber,
      mobileVerified: true,
      challengeId: verified.challengeId,
      user: user ? toSafeUser(user) : null,
    });
  } catch (error) {
    console.error("POST /api/auth/otp/mobile/verify error:", error);
    return NextResponse.json(
      { error: "Failed to verify OTP.", code: "OTP_INVALID" },
      { status: 502 }
    );
  }
}
