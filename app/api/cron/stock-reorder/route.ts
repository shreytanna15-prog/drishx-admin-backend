import { NextRequest, NextResponse } from "next/server";
import { authorizeCronRequest } from "../../../lib/cron-auth";

/**
 * GET /api/cron/stock-reorder
 *
 * RW-08 Phase A: automatic procurement demand creation is disabled.
 * Demand must be generated only via admin "Run Reorder"
 * (`POST /api/inventory/reorder-check`).
 *
 * This endpoint remains for cron schedule compatibility and returns a clear
 * disabled response without writing to the database.
 */
export async function GET(req: NextRequest) {
  const denied = authorizeCronRequest(req);
  if (denied) return denied;

  return NextResponse.json({
    ok: true,
    disabled: true,
    created: 0,
    scanned: 0,
    suppressed: 0,
    notNeeded: 0,
    message:
      "Automatic stock-reorder demand creation is disabled. Use admin Run Reorder.",
  });
}
