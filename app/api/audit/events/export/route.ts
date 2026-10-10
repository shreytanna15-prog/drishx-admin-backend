import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { buildAuditListWhere } from "../../../../lib/audit-query";

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const where = buildAuditListWhere(req.nextUrl.searchParams, {});
    const items = await prisma.auditEvent.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: 5000,
    });

    const header = [
      "publicId",
      "occurredAt",
      "action",
      "module",
      "entityType",
      "entityId",
      "actorName",
      "source",
      "result",
      "message",
    ].join(",");

    const rows = items.map((e) =>
      [
        e.publicId,
        e.occurredAt.toISOString(),
        e.action,
        e.module,
        e.entityType,
        e.entityId,
        e.actorName,
        e.source,
        e.result,
        e.message,
      ]
        .map(csvEscape)
        .join(",")
    );

    const csv = [header, ...rows].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="audit-export.csv"',
      },
    });
  } catch (error) {
    console.error("GET /api/audit/events/export", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
