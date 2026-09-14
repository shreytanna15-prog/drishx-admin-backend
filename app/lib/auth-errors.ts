import { NextResponse } from "next/server";

export type AuthErrorCode =
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALID"
  | "TOKEN_MISSING"
  | "ACCOUNT_PENDING"
  | "ACCOUNT_INACTIVE"
  | "MISSING_PERMISSION"
  | "FORBIDDEN";

export function unauthorizedResponse(
  code: AuthErrorCode = "TOKEN_INVALID",
  message = "Unauthorized."
) {
  return NextResponse.json({ error: message, code }, { status: 401 });
}

export function forbiddenResponse(
  code: AuthErrorCode = "FORBIDDEN",
  message = "Forbidden."
) {
  return NextResponse.json({ error: message, code }, { status: 403 });
}
