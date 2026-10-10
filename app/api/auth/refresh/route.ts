import { NextRequest, NextResponse } from "next/server";
import {
  buildRefreshCookie,
  clearRefreshCookie,
  isMobileClient,
  parseRefreshCookie,
  rotateRefreshToken,
  signAccessToken,
} from "../../../lib/auth";
import { unauthorizedResponse } from "../../../lib/auth-errors";
import { prisma, withDbRetry } from "../../../lib/prisma";
import { toSafeUser } from "../../../lib/user-public";

export async function POST(req: NextRequest) {
  let rawRefreshToken: string | null = null;

  if (isMobileClient(req)) {
    try {
      const body = await req.json();
      rawRefreshToken = body.refreshToken ? String(body.refreshToken) : null;
    } catch {
      rawRefreshToken = null;
    }
  } else {
    rawRefreshToken = parseRefreshCookie(req.headers.get("cookie"));
  }

  if (!rawRefreshToken) {
    return unauthorizedResponse("TOKEN_MISSING");
  }

  try {
    const rotated = await withDbRetry(() => rotateRefreshToken(rawRefreshToken!));
    if (!rotated.ok) {
      const response = unauthorizedResponse(rotated.code);
      response.headers.append("Set-Cookie", clearRefreshCookie());
      return response;
    }

    const user = await withDbRetry(() =>
      prisma.user.findUnique({
        where: { id: rotated.userId },
        include: { staffRole: true },
      })
    );

    if (!user || (user.role !== "CUSTOMER" && !user.isActive)) {
      const response = unauthorizedResponse("TOKEN_INVALID");
      response.headers.append("Set-Cookie", clearRefreshCookie());
      return response;
    }

    const accessToken = signAccessToken({ userId: user.id, role: user.role });
    const body: Record<string, unknown> = {
      user: toSafeUser(user),
      accessToken,
      token: accessToken,
    };

    if (isMobileClient(req)) {
      body.refreshToken = rotated.rawToken;
    }

    const response = NextResponse.json(body);
    response.headers.append("Set-Cookie", buildRefreshCookie(rotated.rawToken, rotated.expiresAt));
    return response;
  } catch {
    // Infra / DB blip — keep the refresh cookie; clients treat 5xx as transient.
    return NextResponse.json(
      {
        error: "Unable to refresh session. Please try again.",
        code: "TOKEN_INVALID",
      },
      { status: 503 }
    );
  }
}
