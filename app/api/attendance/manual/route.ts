import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session-auth";
import { getTodayKey, markPresentAdmin } from "../../../lib/attendance";
import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../lib/audit";
import { prisma } from "../../../lib/prisma";

/** POST /api/attendance/manual — admin: mark employee present without QR */
export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null);
    const employeeId =
      typeof body?.employeeId === "string" ? body.employeeId.trim() : "";
    if (!employeeId) {
      return NextResponse.json({ error: "employeeId is required." }, { status: 400 });
    }
    const dateKey =
      typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date.trim())
        ? body.date.trim()
        : getTodayKey();

    const result = await markPresentAdmin({
      employeeId,
      adminId: session.userId,
      dateKey,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (!result.alreadyPresent) {
      const auditCtx = buildAuditRequestContext(req);
      await recordAuditEvent(prisma, {
        action: AuditAction.ATTENDANCE_MANUAL_MARK,
        module: AuditModule.ATTENDANCE,
        entityType: "AttendanceRecord",
        entityId: result.record.id,
        actor: actorFromSession(session),
        request: auditCtx,
        result: "SUCCESS",
        context: {
          method: "BY_ADMIN",
          employeeId,
          date: dateKey,
        },
        activityMessage: `Admin marked employee present for ${dateKey}.`,
      });
    }

    return NextResponse.json({
      alreadyPresent: result.alreadyPresent,
      message: result.alreadyPresent
        ? "Employee was already marked present."
        : "Employee marked present.",
      record: result.record,
    });
  } catch (error) {
    console.error("POST /api/attendance/manual error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
