import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { actorFromSession, buildAuditRequestContext } from "@/app/lib/audit";
import {
  AuditAction,
  AuditModule,
  diffFields,
  recordAuditEvent,
} from "@/app/lib/audit";
import { prisma } from "@/app/lib/prisma";
import { validateCatalogStockQuantities } from "@/app/lib/catalog/lens-product-stock-core";
import { getCatalogStockPosition } from "@/app/lib/catalog/catalog-stock-position";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/stock/powers/:id/rules — update threshold/target on a leaf. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      minStock?: number;
      targetStock?: number;
    };
    const leaf = await prisma.lensProductPower.findUnique({ where: { id } });
    if (!leaf) {
      return NextResponse.json({ error: "Stock leaf not found." }, { status: 404 });
    }

    const minStock =
      body.minStock != null ? Number(body.minStock) : leaf.minStock;
    const targetStock =
      body.targetStock != null ? Number(body.targetStock) : leaf.targetStock;
    const err = validateCatalogStockQuantities(minStock, targetStock);
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    const updated = await prisma.lensProductPower.update({
      where: { id },
      data: { minStock, targetStock },
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.REORDER_RULE_CHANGED,
      module: AuditModule.INVENTORY,
      entityType: "LensProductPower",
      entityId: id,
      actor: actorFromSession(auth.session),
      request: buildAuditRequestContext(req),
      changes: diffFields(
        { minStock: leaf.minStock, targetStock: leaf.targetStock },
        { minStock: updated.minStock, targetStock: updated.targetStock },
        ["minStock", "targetStock"]
      ),
      activityMessage: `Catalog leaf rules updated — threshold ${minStock} / target ${targetStock}`,
    });

    const power = await getCatalogStockPosition(id);
    return NextResponse.json({ power });
  } catch (error) {
    console.error("PATCH /api/admin/stock/powers/[id]/rules", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
