import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session-auth";
import { getDayRoster, getTodayKey } from "../../../lib/attendance";

/** GET /api/attendance/day?date=YYYY-MM-DD — admin roster for a day */
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("date");
    const dateKey =
      raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : getTodayKey();
    const roster = await getDayRoster(dateKey);
    return NextResponse.json(roster);
  } catch (error) {
    console.error("GET /api/attendance/day error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
