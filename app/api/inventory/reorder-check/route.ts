import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session-auth";
import {
  actorFromSession,
  buildAuditRequestContext,
} from "../../../lib/audit";
import { runReorderCheckAll } from "../../../lib/procurement-requests";

/**
 * POST /api/inventory/reorder-check
 * Access: ADMIN only.
 *
 * Runs the stock-wise replenishment checker on demand ("Run check now" button).
 * The same logic runs nightly via /api/cron/stock-reorder.
 *
 * Creates ProcurementRequest rows only. It never creates a purchase order,
 * never contacts a supplier and never spends money (procurement PDF §29).
 */
export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  try {
    const summary = await runReorderCheckAll({
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
    });

    return NextResponse.json({
      scanned: summary.scanned,
      created: summary.created,
      suppressed: summary.suppressed,
      notNeeded: summary.notNeeded,
      results: summary.results,
    });
  } catch (error) {
    console.error("POST /api/inventory/reorder-check error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
