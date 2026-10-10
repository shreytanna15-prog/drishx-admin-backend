import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { requireStaffPermission } from "../../../lib/staff-access";
import { markPresentQr } from "../../../lib/attendance";
import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../lib/audit";
import { prisma } from "../../../lib/prisma";

/** POST /api/attendance/scan — employee: mark present via office QR token */
export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "EMPLOYEE") {
    return NextResponse.json(
      { error: "Only employees can scan the office attendance QR." },
      { status: 403 }
    );
  }

  const gate = await requireStaffPermission(session, "attendance.scan");
  if ("error" in gate) return gate.error;

  try {
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token) {
      return NextResponse.json({ error: "QR token is required." }, { status: 400 });
    }

    const result = await markPresentQr({
      employeeId: session.userId,
      token,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (!result.alreadyPresent) {
      const auditCtx = buildAuditRequestContext(req);
      await recordAuditEvent(prisma, {
        action: AuditAction.ATTENDANCE_QR_SCAN,
        module: AuditModule.ATTENDANCE,
        entityType: "AttendanceRecord",
        entityId: result.record.id,
        actor: actorFromSession(session),
        request: auditCtx,
        result: "SUCCESS",
        context: {
          method: "QR_SCAN",
          date: result.record.day.date,
        },
        activityMessage: `Attendance marked present via office QR.`,
      });
    }

    return NextResponse.json({
      alreadyPresent: result.alreadyPresent,
      message: result.alreadyPresent
        ? "Already marked present for today."
        : "Marked present for today.",
      record: {
        id: result.record.id,
        method: result.record.method,
        markedAt: result.record.markedAt.toISOString(),
        status: result.record.status,
      },
    });
  } catch (error) {
    console.error("POST /api/attendance/scan error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
