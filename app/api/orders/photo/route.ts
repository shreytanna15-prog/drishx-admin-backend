import { NextResponse } from "next/server";

/**
 * RC-02 — photo prescription orders are retired. RX form orders
 * (`POST /api/orders/rx`) are the only prescription entry point.
 * The `orderImageUrl` column is kept for legacy rows.
 */
const GONE_RESPONSE = {
  error:
    "Photo prescription orders have been retired. Please place a prescription order using the RX form instead.",
  code: "PHOTO_ORDERS_RETIRED",
};

function gone() {
  return NextResponse.json(GONE_RESPONSE, { status: 410 });
}

export async function POST() {
  return gone();
}
