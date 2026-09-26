import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredReservations } from "../../../lib/cart-reservations";
import { authorizeCronRequest } from "../../../lib/cron-auth";

/**
 * Call from Vercel Cron or manually with CRON_SECRET.
 *
 * GET /api/cron/release-cart-reservations?secret=<CRON_SECRET>
 * GET /api/cron/release-cart-reservations  + `Authorization: Bearer <CRON_SECRET>`
 *
 * Fails closed with 503 when CRON_SECRET is unset — see app/lib/cron-auth.ts.
 */
export async function GET(req: NextRequest) {
  const denied = authorizeCronRequest(req);
  if (denied) return denied;

  try {
    const released = await releaseExpiredReservations();
    return NextResponse.json({ ok: true, released });
  } catch (error) {
    console.error("release-cart-reservations cron error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
