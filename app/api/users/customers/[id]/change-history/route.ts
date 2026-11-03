import { NextRequest, NextResponse } from "next/server";

import { AuditAction, AuditModule } from "../../../../../lib/audit";
import { prisma } from "../../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../../lib/session-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * RC-01 — Admin change history for a customer (from AuditEvent).
 */
export async function GET(req: NextRequest, context: RouteContext) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Staff authorization required." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const customer = await prisma.user.findFirst({
      where: { id, role: "CUSTOMER" },
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const url = new URL(req.url);
    const take = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50)
    );

    const events = await prisma.auditEvent.findMany({
      where: {
        entityType: "User",
        entityId: id,
        module: AuditModule.CUSTOMER,
        action: {
          in: [
            AuditAction.CUSTOMER_UPDATED,
            AuditAction.CUSTOMER_APPROVED,
            AuditAction.CUSTOMER_REJECTED,
            AuditAction.CUSTOMER_PROFILE_RESUBMITTED,
            AuditAction.GSTIN_VERIFIED,
            AuditAction.GSTIN_VERIFICATION_CLEARED,
          ],
        },
      },
      orderBy: { occurredAt: "desc" },
      take,
      select: {
        id: true,
        publicId: true,
        action: true,
        occurredAt: true,
        actorName: true,
        actorUserId: true,
        reasonText: true,
        changes: true,
        context: true,
        message: true,
      },
    });

    const items = events.map((event) => {
      const changes = Array.isArray(event.changes) ? event.changes : [];
      const fieldLabels = changes
        .map((c) => {
          if (c && typeof c === "object" && "field" in c) {
            return String((c as { field: unknown }).field);
          }
          return null;
        })
        .filter((v): v is string => Boolean(v));

      return {
        id: event.id,
        publicId: event.publicId,
        action: event.action,
        createdAt: event.occurredAt,
        adminName: event.actorName,
        adminUserId: event.actorUserId,
        notes: event.reasonText,
        fieldLabels,
        changes,
        message: event.message,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/users/customers/[id]/change-history error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
