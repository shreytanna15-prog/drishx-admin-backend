import { NextResponse } from "next/server";

export type AuthErrorCode =
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALID"
  | "TOKEN_MISSING"
  | "ACCOUNT_PENDING"
  | "ACCOUNT_INACTIVE"
  | "ACCOUNT_REJECTED"
  | "ACCOUNT_BLOCKED"
  | "ACCOUNT_CLOSED"
  | "MISSING_PERMISSION"
  | "FORBIDDEN"
  | "OTP_INVALID"
  | "OTP_RATE_LIMITED"
  | "MOBILE_IN_USE"
  | "CREDIT_LIMIT_EXCEEDED"
  | "CREDIT_SUSPENDED"
  | "GSTIN_MISSING"
  | "GSTIN_PROVIDER_ERROR";

export function jsonError(
  code: AuthErrorCode | string,
  message: string,
  status: number
) {
  return NextResponse.json({ error: message, code }, { status });
}

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
