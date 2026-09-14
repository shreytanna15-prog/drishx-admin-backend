import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredReservations } from "../../../lib/cart-reservations";

/** Call from Vercel Cron or manually with CRON_SECRET. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const querySecret = req.nextUrl.searchParams.get("secret");

  if (secret && bearer !== secret && querySecret !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const released = await releaseExpiredReservations();
    return NextResponse.json({ ok: true, released });
  } catch (error) {
    console.error("release-cart-reservations cron error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
