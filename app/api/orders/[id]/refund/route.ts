import { NextRequest, NextResponse } from "next/server";

import { getOrderRefundSummary } from "@/app/lib/finance/order-refund";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";

/** GET /api/orders/[id]/refund — admin refund summary. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const refund = await getOrderRefundSummary(id);
    if (!refund) {
      return NextResponse.json({ refund: null });
    }
    return NextResponse.json({ refund });
  } catch (error) {
    console.error("GET /api/orders/[id]/refund error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
