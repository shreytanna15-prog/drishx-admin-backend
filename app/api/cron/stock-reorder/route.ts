import { NextRequest, NextResponse } from "next/server";
import { runReorderCheckAll } from "../../../lib/procurement-requests";
import { authorizeCronRequest } from "../../../lib/cron-auth";

/**
 * GET /api/cron/stock-reorder
 * Call from Vercel Cron or manually with CRON_SECRET.
 *
 *   GET /api/cron/stock-reorder?secret=<CRON_SECRET>
 *   GET /api/cron/stock-reorder  + `Authorization: Bearer <CRON_SECRET>`
 *
 * Nightly stock-wise replenishment check. For every SKU with an active
 * `autoProcure` rule it compares available stock against the minimum and
 * raises a ProcurementRequest when short — accounting for stock already
 * incoming so the same shortage is never raised twice.
 *
 * This only ever creates internal requests. No purchase order is created and no
 * money is spent without an admin approving the request (procurement PDF §29).
 *
 * Fails closed with 503 when CRON_SECRET is unset — see app/lib/cron-auth.ts.
 */
export async function GET(req: NextRequest) {
  const denied = authorizeCronRequest(req);
  if (denied) return denied;

  try {
    const summary = await runReorderCheckAll();
    return NextResponse.json({
      ok: true,
      scanned: summary.scanned,
      created: summary.created,
      suppressed: summary.suppressed,
      notNeeded: summary.notNeeded,
    });
  } catch (error) {
    console.error("stock-reorder cron error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
