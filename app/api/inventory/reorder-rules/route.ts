import { NextRequest, NextResponse } from "next/server";
import { LensType } from "@prisma/client";
import { getSession } from "../../../lib/session-auth";
import { requireStaffPermission } from "../../../lib/staff-access";
import { prisma } from "../../../lib/prisma";
import {
  actorFromSession,
  buildAuditRequestContext,
} from "../../../lib/audit";
import {
  listReorderRules,
  listUnconfiguredSkus,
  recordReorderRuleChange,
  upsertReorderRule,
  validateReorderRule,
} from "../../../lib/reorder-rules";
import { isProcurementLensType, readLensDescriptor } from "../../../lib/procurement-lens";
import type { ReorderRuleInput } from "../../../lib/reorder-rules";

function isAdmin(session: { role: string }): boolean {
  return session.role === "ADMIN";
}

function parseLensType(raw: string | null): LensType | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  return (Object.values(LensType) as string[]).includes(upper)
    ? (upper as LensType)
    : undefined;
}

// ─────────────────────────────────────────────────────────────
// GET /api/inventory/reorder-rules
// Access: ADMIN | EMPLOYEE (inventory.view)
// Returns configured rules joined with live stock position.
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "inventory.view");
    if ("error" in gate) return gate.error;
  }
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const lensTypeParam = params.get("lensType");
  const lensType = lensTypeParam ? parseLensType(lensTypeParam) : undefined;
  if (lensTypeParam && !lensType) {
    return NextResponse.json({ error: "Invalid lensType." }, { status: 400 });
  }

  const onlyBelowMin = params.get("belowMin") === "true";
  const wantUnconfigured = params.get("includeUnconfigured") === "true";

  try {
    const rules = await listReorderRules({ lensType, onlyBelowMin });

    const suppliers = await prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      rules,
      suppliers,
      canEdit: isAdmin(session),
      supportedLensTypes: ["SINGLE_VISION", "KRYPTOK", "PROGRESSIVE"],
      ...(wantUnconfigured
        ? {
            unconfigured: await listUnconfiguredSkus({
              lensType,
              search: params.get("search") ?? undefined,
              limit: 40,
            }),
          }
        : {}),
    });
  } catch (error) {
    console.error("GET /api/inventory/reorder-rules error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/inventory/reorder-rules
// Access: ADMIN only — thresholds drive real purchasing decisions.
// ─────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const error = validateReorderRule(body ?? {});
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    if (!isProcurementLensType(body.lensType)) {
      return NextResponse.json(
        {
          error:
            "Reorder rules are only supported for Single Vision, Kryptok and Progressive lenses.",
        },
        { status: 400 }
      );
    }

    const lensType = body.lensType as LensType;
    const lensId = String(body.lensId);

    const lens = await readLensDescriptor(prisma, lensType, lensId);
    if (!lens) {
      return NextResponse.json({ error: "Lens not found." }, { status: 404 });
    }

    const before = await prisma.reorderRule.findUnique({
      where: { lensType_lensId: { lensType, lensId } },
    });

    if (body.preferredSupplierId) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: String(body.preferredSupplierId) },
        select: { id: true },
      });
      if (!supplier) {
        return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
      }
    }

    const input: ReorderRuleInput = {
      lensType,
      lensId,
      minStock: Number(body.minStock),
      targetStock: Number(body.targetStock),
      autoProcure: body.autoProcure,
      preferredSupplierId: body.preferredSupplierId ?? null,
      moq: body.moq,
      isActive: body.isActive,
    };

    const rule = await prisma.$transaction(async (tx) => {
      const saved = await upsertReorderRule(input, tx);

      // Threshold changes are the input to every future purchase decision,
      // so each one is logged (procurement PDF §31).
      await recordReorderRuleChange({
        before: before
          ? {
              minStock: before.minStock,
              targetStock: before.targetStock,
              autoProcure: before.autoProcure,
              preferredSupplierId: before.preferredSupplierId,
              moq: before.moq,
              isActive: before.isActive,
            }
          : null,
        after: {
          minStock: saved.minStock,
          targetStock: saved.targetStock,
          autoProcure: saved.autoProcure,
          preferredSupplierId: saved.preferredSupplierId,
          moq: saved.moq,
          isActive: saved.isActive,
        },
        lensType,
        lensId,
        lensLabel: [lens.brand, lens.item, lens.coating].filter(Boolean).join(" ") || null,
        actor: actorFromSession(session),
        request: buildAuditRequestContext(req),
        client: tx,
      });

      return saved;
    });

    return NextResponse.json({ rule });
  } catch (error) {
    console.error("PUT /api/inventory/reorder-rules error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Internal Server Error" },
      { status: 400 }
    );
  }
}
