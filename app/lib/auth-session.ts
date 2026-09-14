import type { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  buildRefreshCookie,
  createRefreshToken,
  isMobileClient,
  signAccessToken,
  type SessionPayload,
} from "./auth";
import { toSafeUser } from "./user-public";
import type { User } from "@prisma/client";
import type { StaffRole } from "@prisma/client";

type UserWithStaffRole = User & { staffRole?: StaffRole | null };

export async function issueAuthTokens(
  req: NextRequest,
  user: UserWithStaffRole
) {
  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  const userAgent = req.headers.get("user-agent");
  const { rawToken: refreshToken, expiresAt } = await createRefreshToken(
    user.id,
    userAgent
  );

  const body: Record<string, unknown> = {
    user: toSafeUser(user),
    accessToken,
    token: accessToken,
  };

  if (isMobileClient(req)) {
    body.refreshToken = refreshToken;
  }

  const response = NextResponse.json(body);
  response.headers.append("Set-Cookie", buildRefreshCookie(refreshToken, expiresAt));
  return response;
}

export function inactiveStaffLoginError(user: Pick<User, "role" | "isActive">) {
  if (user.role !== "CUSTOMER" && !user.isActive) {
    return NextResponse.json(
      { error: "Your account is inactive. Contact an administrator.", code: "ACCOUNT_INACTIVE" },
      { status: 403 }
    );
  }
  return null;
}

export function sessionPayload(user: Pick<User, "id" | "role">): SessionPayload {
  return { userId: user.id, role: user.role as UserRole };
}
