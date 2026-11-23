import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { actorFromSession, buildAuditRequestContext } from "@/app/lib/audit";
import {
  CatalogStockCheckError,
  listCatalogStockCheckSessions,
  startCatalogStockCheck,
} from "@/app/lib/catalog/catalog-stock-check";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

/** GET /api/admin/stock/check-sessions */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const sp = req.nextUrl.searchParams;
    const data = await listCatalogStockCheckSessions({
      status: sp.get("status") ?? undefined,
      page: Number(sp.get("page") ?? 1) || 1,
      limit: Number(sp.get("limit") ?? 20) || 20,
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof CatalogStockCheckError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("GET /api/admin/stock/check-sessions", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** POST /api/admin/stock/check-sessions — start (freeze leaves). */
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const powerIds = Array.isArray(body?.powerIds)
      ? body!.powerIds.map((x) => String(x))
      : null;
    const session = await startCatalogStockCheck({
      productId: typeof body?.productId === "string" ? body.productId : null,
      powerIds,
      notes: typeof body?.notes === "string" ? body.notes : null,
      actor: actorFromSession(auth.session),
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    if (error instanceof CatalogStockCheckError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("POST /api/admin/stock/check-sessions", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
