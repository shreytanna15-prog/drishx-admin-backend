import { NextRequest, NextResponse } from "next/server";
import { parseDashboardRange } from "../../../lib/admin-dashboard";
import { loadAdminDashboard } from "../../../lib/load-admin-dashboard";
import { getSession } from "../../../lib/session-auth";

function requireAdmin(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }
  if (session.role !== "ADMIN") {
    return {
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }
  return { session };
}

// GET /api/admin/dashboard?range=today|7d|30d
// Access: ADMIN
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const range = parseDashboardRange(req.nextUrl.searchParams.get("range"));
    const payload = await loadAdminDashboard(range);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("GET /api/admin/dashboard error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
