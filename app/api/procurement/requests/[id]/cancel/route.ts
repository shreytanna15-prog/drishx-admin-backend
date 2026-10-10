import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../../lib/session-auth";
import { requireStaffPermission } from "../../../../../lib/staff-access";
import { buildAuditRequestContext } from "../../../../../lib/audit";
import { cancelProcurementRequest } from "../../../../../lib/procurement-requests";

/**
 * POST /api/procurement/requests/:id/cancel
 * Access: ADMIN only (procurement.approve).
 *
 * Cancelling never deletes history — the row stays with a CANCELLED status and
 * a recorded reason, so the audit trail of what was wanted and why it stopped
 * is preserved (procurement PDF §42).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "procurement.approve");
    if ("error" in gate) return gate.error;
  }
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const request = await cancelProcurementRequest({
      id,
      reason: typeof body?.reason === "string" ? body.reason : null,
      actorUserId: session.userId,
      request: buildAuditRequestContext(req),
    });

    return NextResponse.json({ request });
  } catch (error) {
    console.error("POST /api/procurement/requests/:id/cancel error:", error);
    const message = (error as Error).message;
    if (message === "Procurement request not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json(
      { error: message || "Internal Server Error" },
      { status: 400 }
    );
  }
}
