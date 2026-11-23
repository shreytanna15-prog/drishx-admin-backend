import { NextRequest, NextResponse } from "next/server";
import {
  buildRefreshCookie,
  clearRefreshCookie,
  isMobileClient,
  parseRefreshCookie,
  resolveAuthBrowserChannel,
  rotateRefreshToken,
  signAccessToken,
} from "../../../lib/auth";
import { shouldClearRefreshCookie } from "../../../lib/auth-refresh-policy";
import { accountAccessErrorResponse } from "../../../lib/account-access";
import { unauthorizedResponse } from "../../../lib/auth-errors";
import { prisma, withDbRetry } from "../../../lib/prisma";
import { toSafeUser } from "../../../lib/user-public";

export async function POST(req: NextRequest) {
  let rawRefreshToken: string | null = null;
  const browserChannel = resolveAuthBrowserChannel(req);

  if (isMobileClient(req)) {
    try {
      const body = await req.json();
      rawRefreshToken = body.refreshToken ? String(body.refreshToken) : null;
    } catch {
      rawRefreshToken = null;
    }
  } else {
    rawRefreshToken = parseRefreshCookie(
      req.headers.get("cookie"),
      browserChannel
    );
  }

  if (!rawRefreshToken) {
    return unauthorizedResponse("TOKEN_MISSING");
  }

  try {
    const rotated = await withDbRetry(() => rotateRefreshToken(rawRefreshToken!));
    if (!rotated.ok) {
      // Concurrent / in-flight race: keep the cookie so the winner's Set-Cookie
      // (or a client retry) can recover the session.
      if (rotated.retryable) {
        return NextResponse.json(
          {
            error: "Refresh in progress. Please try again.",
            code: "TOKEN_INVALID",
          },
          { status: 503 }
        );
      }

      const response = unauthorizedResponse(rotated.code);
      if (shouldClearRefreshCookie(rotated)) {
        response.headers.append(
          "Set-Cookie",
          clearRefreshCookie(browserChannel)
        );
      }
      return response;
    }

    const user = await withDbRetry(() =>
      prisma.user.findUnique({
        where: { id: rotated.userId },
        include: {
          staffRole: true,
          pricingTier: { select: { code: true, discountPercent: true } },
        },
      })
    );

    if (!user) {
      const response = unauthorizedResponse("TOKEN_INVALID");
      response.headers.append(
        "Set-Cookie",
        clearRefreshCookie(browserChannel)
      );
      return response;
    }

    // RW-04: suspended / rejected customers and inactive staff cannot refresh.
    const accessDenied = accountAccessErrorResponse(user);
    if (accessDenied) {
      accessDenied.headers.append(
        "Set-Cookie",
        clearRefreshCookie(browserChannel)
      );
      return accessDenied;
    }

    const accessToken = signAccessToken({ userId: user.id, role: user.role });
    const body: Record<string, unknown> = {
      user: toSafeUser(user),
      accessToken,
      token: accessToken,
    };

    // Concurrent loser: mint access only. Do not clear or overwrite refresh
    // cookie / mobile refresh token — the winner already rotated it.
    if (rotated.kind === "concurrent") {
      return NextResponse.json(body);
    }

    if (isMobileClient(req)) {
      body.refreshToken = rotated.rawToken;
    }

    const response = NextResponse.json(body);
    if (!isMobileClient(req)) {
      response.headers.append(
        "Set-Cookie",
        buildRefreshCookie(rotated.rawToken, rotated.expiresAt, browserChannel)
      );
    }
    return response;
  } catch (error) {
    // Infra / DB blip — keep the refresh cookie; clients treat 5xx as transient.
    console.error("POST /api/auth/refresh error:", error);
    return NextResponse.json(
      {
        error: "Unable to refresh session. Please try again.",
        code: "TOKEN_INVALID",
      },
      { status: 503 }
    );
  }
}
