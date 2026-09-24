import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session-auth";
import {
  listActiveEmployees,
  refreshAttendanceToken,
  serializeTodayPayload,
} from "../../../../lib/attendance";
import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../../lib/audit";
import { prisma } from "../../../../lib/prisma";

/** POST /api/attendance/today/refresh — admin: force-rotate office QR token */
export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  try {
    const day = await refreshAttendanceToken();
    const employees = await listActiveEmployees();
    const payload = serializeTodayPayload(day, employees);

    const auditCtx = buildAuditRequestContext(req);
    await recordAuditEvent(prisma, {
      action: AuditAction.ATTENDANCE_TOKEN_REFRESHED,
      module: AuditModule.ATTENDANCE,
      entityType: "AttendanceDay",
      entityId: day.id,
      actor: actorFromSession(session),
      request: auditCtx,
      result: "SUCCESS",
      context: { date: payload.date },
      activityMessage: `Attendance QR token refreshed for ${payload.date}.`,
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("POST /api/attendance/today/refresh error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
