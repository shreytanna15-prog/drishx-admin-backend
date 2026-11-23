import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { actorFromSession, buildAuditRequestContext } from "@/app/lib/audit";
import { LensProductServiceError } from "@/app/lib/catalog/lens-product-service";
import {
  CatalogStockError,
  saveCatalogProductMatrixRules,
  type CatalogMatrixRuleEdit,
} from "@/app/lib/catalog/lens-product-stock";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type Ctx = { params: Promise<{ id: string }> };

function parseEdits(raw: unknown): CatalogMatrixRuleEdit[] | null {
  if (!Array.isArray(raw)) return null;
  const edits: CatalogMatrixRuleEdit[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const variantId = String(row.variantId ?? "").trim();
    const sph = Number(row.sph);
    const cyl = Number(row.cyl);
    const minStock = Number(row.minStock);
    const targetStock = Number(row.targetStock);
    if (!variantId || !Number.isFinite(sph) || !Number.isFinite(cyl)) return null;
    if (!Number.isFinite(minStock) || !Number.isFinite(targetStock)) return null;
    edits.push({ variantId, sph, cyl, minStock, targetStock });
  }
  return edits;
}

/**
 * PATCH /api/admin/catalog/lens-products/:id/matrix/rules
 * Body: { edits: [{ variantId, sph, cyl, minStock, targetStock }] }
 * Upserts LensProductPower leaves — never changes quantity.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const edits = parseEdits(body?.edits);
    if (!edits) {
      return NextResponse.json(
        {
          error: "edits must be an array of { variantId, sph, cyl, minStock, targetStock }.",
          code: "VALIDATION",
        },
        { status: 400 }
      );
    }

    const result = await saveCatalogProductMatrixRules({
      productId: id,
      edits,
      actor: actorFromSession(auth.session),
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LensProductServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (error instanceof CatalogStockError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error(
      "PATCH /api/admin/catalog/lens-products/:id/matrix/rules",
      error
    );
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
