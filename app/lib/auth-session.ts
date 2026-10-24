import type { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  buildRefreshCookie,
  createRefreshToken,
  isMobileClient,
  signAccessToken,
  type SessionPayload,
} from "./auth";
import { accountAccessErrorResponse } from "./account-access";
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

/** Login gate for inactive staff, suspended, and closed customers. */
export function inactiveStaffLoginError(
  user: Pick<
    User,
    "role" | "isActive" | "isApproved" | "approvalStatus" | "accountAction"
  >
) {
  return accountAccessErrorResponse(user);
}

export function sessionPayload(user: Pick<User, "id" | "role">): SessionPayload {
  return { userId: user.id, role: user.role as UserRole };
}
