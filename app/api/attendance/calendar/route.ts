import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session-auth";
import { requireStaffPermission } from "../../../lib/staff-access";
import { getCalendar, getTodayKey } from "../../../lib/attendance";

/** GET /api/attendance/calendar?year=&month=&employeeId= */
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "attendance.view");
    if ("error" in gate) return gate.error;
  }

  try {
    const { searchParams } = new URL(req.url);
    const todayKey = getTodayKey();
    const [ty, tm] = todayKey.split("-").map(Number);
    const year = Number(searchParams.get("year") ?? ty);
    const month = Number(searchParams.get("month") ?? tm);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "Invalid year or month." }, { status: 400 });
    }

    let employeeId = searchParams.get("employeeId");
    if (session.role === "EMPLOYEE") {
      employeeId = session.userId;
    }

    const calendar = await getCalendar({
      year,
      month,
      employeeId: employeeId || null,
    });
    return NextResponse.json(calendar);
  } catch (error) {
    console.error("GET /api/attendance/calendar error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
