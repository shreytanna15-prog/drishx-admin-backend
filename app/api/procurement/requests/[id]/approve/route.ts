import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../../lib/session-auth";
import { requireStaffPermission } from "../../../../../lib/staff-access";
import { buildAuditRequestContext } from "../../../../../lib/audit";
import { approveProcurementRequest } from "../../../../../lib/procurement-requests";

/**
 * POST /api/procurement/requests/:id/approve
 * Access: ADMIN only (procurement.approve).
 *
 * Approving authorises the purchase. It is deliberately a separate step from
 * the automatic trigger: the system may raise a request, but a human decides
 * whether money is committed (procurement PDF §29).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "procurement.approve");
    if ("error" in gate) return gate.error;
  }
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const request = await approveProcurementRequest({
      id,
      actorUserId: session.userId,
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json({ request });
  } catch (error) {
    console.error("POST /api/procurement/requests/:id/approve error:", error);
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
