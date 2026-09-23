import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session-auth";
import {
  DEFAULT_DISPATCH_CUTOFF_SETTINGS,
  getDispatchCutoffSettings,
  setDispatchCutoffSettings,
} from "../../../lib/dispatch-cutoff";
import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  diffFields,
  recordAuditEvent,
} from "../../../lib/audit";
import { prisma } from "../../../lib/prisma";

/** GET /api/settings/dispatch-cutoff — admin only */
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const settings = await getDispatchCutoffSettings();
    return NextResponse.json({ settings, defaults: DEFAULT_DISPATCH_CUTOFF_SETTINGS });
  } catch (error) {
    console.error("GET /api/settings/dispatch-cutoff error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** PUT /api/settings/dispatch-cutoff — admin only */
export async function PUT(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null);
    const before = await getDispatchCutoffSettings();
    const settings = await setDispatchCutoffSettings({
      enabled:
        typeof body?.enabled === "boolean" ? body.enabled : undefined,
      time:
        typeof body?.time === "string" && body.time.trim() ? body.time : undefined,
      timezone:
        typeof body?.timezone === "string" && body.timezone.trim()
          ? body.timezone
          : undefined,
      skipWeekends:
        typeof body?.skipWeekends === "boolean" ? body.skipWeekends : undefined,
    });
    if (body === null) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (JSON.stringify(before) !== JSON.stringify(settings)) {
      await recordAuditEvent(prisma, {
        action: AuditAction.DISPATCH_CUTOFF_SETTINGS_UPDATED,
        module: AuditModule.CONFIG,
        entityType: "AppSetting",
        entityId: "dispatchCutoff",
        actor: actorFromSession(session),
        request: buildAuditRequestContext(req),
        changes: diffFields(
          before as unknown as Record<string, unknown>,
          settings as unknown as Record<string, unknown>,
          ["enabled", "time", "timezone", "skipWeekends"]
        ),
        context: { key: "dispatchCutoff" },
        activityMessage: `Dispatch cutoff settings updated.`,
      });
    }

    return NextResponse.json({ settings, defaults: DEFAULT_DISPATCH_CUTOFF_SETTINGS });
  } catch (error) {
    console.error("PUT /api/settings/dispatch-cutoff error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}