import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session-auth";
import {
  ensureAttendanceDay,
  listActiveEmployees,
  serializeTodayPayload,
} from "../../../lib/attendance";

/** GET /api/attendance/today — admin: office QR + roster for today */
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  try {
    const day = await ensureAttendanceDay();
    const employees = await listActiveEmployees();
    return NextResponse.json(serializeTodayPayload(day, employees));
  } catch (error) {
    console.error("GET /api/attendance/today error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
