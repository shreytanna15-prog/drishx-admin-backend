import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { actorFromSession, buildAuditRequestContext } from "@/app/lib/audit";
import {
  CatalogReorderError,
  runCatalogReorderCheck,
  runCatalogReorderCheckAll,
} from "@/app/lib/catalog/catalog-reorder";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

/**
 * POST /api/admin/stock/reorder-check
 * Body: { powerId?: string } — single leaf, or omit to scan all configured leaves.
 */
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = (await req.json().catch(() => ({}))) as { powerId?: string };
    const actor = actorFromSession(auth.session);
    const request = buildAuditRequestContext(req);

    if (typeof body.powerId === "string" && body.powerId.trim()) {
      const result = await runCatalogReorderCheck({
        powerId: body.powerId.trim(),
        actor,
        request,
      });
      return NextResponse.json({ result });
    }

    const summary = await runCatalogReorderCheckAll({ actor, request });
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof CatalogReorderError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("POST /api/admin/stock/reorder-check", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
