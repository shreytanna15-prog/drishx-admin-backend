import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "./env";

/** Constant-time string comparison that tolerates differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Guard for `/api/cron/*` endpoints.
 *
 * Fails **closed**: when `CRON_SECRET` is not configured the endpoint refuses to
 * run and returns 503. The previous check was
 *
 *   if (secret && bearer !== secret && querySecret !== secret) -> 401
 *
 * which meant an unset CRON_SECRET made every cron endpoint publicly callable.
 * An unauthenticated `/api/cron/release-cart-reservations` can release live cart
 * holds and cause overselling, so an unconfigured secret must be an outage, not
 * an open door.
 *
 * Returns `null` when the request is authorised, otherwise the error response.
 */
export function authorizeCronRequest(req: NextRequest): NextResponse | null {
  const secret = getEnv().CRON_SECRET;
  if (!secret) {
    console.error(
      "CRON_SECRET is not configured — refusing to run the cron endpoint."
    );
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server." },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const querySecret = req.nextUrl.searchParams.get("secret");

  if (bearer !== null && safeEqual(bearer, secret)) return null;
  if (querySecret !== null && safeEqual(querySecret, secret)) return null;

  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}
