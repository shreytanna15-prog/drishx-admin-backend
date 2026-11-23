import { NextRequest, NextResponse } from "next/server";
import {
  clearRefreshCookie,
  isMobileClient,
  parseRefreshCookie,
  resolveAuthBrowserChannel,
  revokeRefreshToken,
} from "../../../lib/auth";
import { getSession } from "../../../lib/session-auth";
import {
  SecurityAction,
  buildAuditRequestContext,
  recordSecurityEvent,
} from "../../../lib/audit";
import { prisma } from "../../../lib/prisma";

export async function POST(req: NextRequest) {
  const auditCtx = buildAuditRequestContext(req);
  const session = getSession(req);
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

  if (rawRefreshToken) {
    await revokeRefreshToken(rawRefreshToken);
  }

  if (session) {
    await recordSecurityEvent(prisma, {
      action: SecurityAction.LOGOUT,
      actorUserId: session.userId,
      result: "SUCCESS",
      request: auditCtx,
      message: "User logged out",
    });
  }

  const response = NextResponse.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    clearRefreshCookie(browserChannel)
  );
  return response;
}
