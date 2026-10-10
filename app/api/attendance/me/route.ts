import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { requireStaffPermission } from "../../../lib/staff-access";
import { getEmployeeMe } from "../../../lib/attendance";

/** GET /api/attendance/me — employee: today status + recent history */
export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "EMPLOYEE") {
    return NextResponse.json(
      { error: "This endpoint is for employees only." },
      { status: 403 }
    );
  }

  const gate = await requireStaffPermission(session, "attendance.view");
  if ("error" in gate) return gate.error;

  try {
    const data = await getEmployeeMe(session.userId);
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/attendance/me error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
