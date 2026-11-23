import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { actorFromSession, buildAuditRequestContext } from "@/app/lib/audit";
import {
  CatalogStockAdjustmentError,
  createCatalogStockAdjustment,
  listCatalogStockAdjustments,
} from "@/app/lib/catalog/catalog-stock-adjustment";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

/** GET /api/admin/stock/adjustments — history. */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const sp = req.nextUrl.searchParams;
    const data = await listCatalogStockAdjustments({
      q: sp.get("q") ?? undefined,
      powerId: sp.get("powerId") ?? undefined,
      page: Number(sp.get("page") ?? 1) || 1,
      limit: Number(sp.get("limit") ?? 20) || 20,
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof CatalogStockAdjustmentError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("GET /api/admin/stock/adjustments", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/stock/adjustments
 * Body: { powerId? } | { variantId, sph, cyl } + countedQty + reasonCode + reasonText?
 */
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return NextResponse.json(
        { error: "JSON body required.", code: "VALIDATION" },
        { status: 400 }
      );
    }

    const countedQty = Number(body.countedQty);
    if (!Number.isFinite(countedQty)) {
      return NextResponse.json(
        { error: "countedQty is required.", code: "VALIDATION" },
        { status: 400 }
      );
    }

    const adjustment = await createCatalogStockAdjustment({
      powerId:
        typeof body.powerId === "string" ? body.powerId : null,
      variantId:
        typeof body.variantId === "string" ? body.variantId : null,
      sph: body.sph != null ? Number(body.sph) : null,
      cyl: body.cyl != null ? Number(body.cyl) : null,
      countedQty,
      reasonCode: String(body.reasonCode ?? ""),
      reasonText:
        typeof body.reasonText === "string" ? body.reasonText : null,
      actor: actorFromSession(auth.session),
      request: buildAuditRequestContext(req),
    });

    return NextResponse.json({ adjustment }, { status: 201 });
  } catch (error) {
    if (error instanceof CatalogStockAdjustmentError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("POST /api/admin/stock/adjustments", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
