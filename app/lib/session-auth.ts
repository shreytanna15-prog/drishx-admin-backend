import { NextRequest } from "next/server";
import { verifyAccessToken, type SessionPayload } from "./auth";
import { unauthorizedResponse } from "./auth-errors";

export function getSession(req: NextRequest): SessionPayload | null {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const result = verifyAccessToken(token);
  return result.ok ? result.payload : null;
}

export function getSessionOrUnauthorized(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return {
      session: null as SessionPayload | null,
      error: unauthorizedResponse("TOKEN_MISSING"),
    };
  }

  const result = verifyAccessToken(token);
  if (!result.ok) {
    return {
      session: null as SessionPayload | null,
      error: unauthorizedResponse(result.code),
    };
  }

  return { session: result.payload, error: null };
}
