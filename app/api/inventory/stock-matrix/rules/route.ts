import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { actorFromSession, buildAuditRequestContext } from "@/app/lib/audit";
import { parseMatrixEdits } from "@/app/lib/stock-matrix";
import {
  isMatrixLensType,
  saveMatrixRules,
  StockMatrixError,
} from "@/app/lib/stock-matrix-data";

/**
 * PUT /api/inventory/stock-matrix/rules
 * Body: { lensType, edits: [{ lensId, minStock, targetStock, expectedUpdatedAt }] }
 * Saves threshold/target only (ReorderRule). Never changes stock quantities.
 * Access: ADMIN only — thresholds drive purchasing (same as reorder rules).
 */
export async function PUT(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isMatrixLensType(body.lensType)) {
    return NextResponse.json({ error: "lensType is required." }, { status: 400 });
  }
  const parsed = parseMatrixEdits(body.edits);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, code: "MATRIX_INVALID", cellErrors: parsed.cellErrors ?? {} },
      { status: 400 }
    );
  }

  try {
    const result = await saveMatrixRules({
      lensType: body.lensType,
      edits: parsed.edits,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StockMatrixError) {
      return NextResponse.json(
        { error: error.message, code: error.code, ...(error.details ?? {}) },
        { status: error.status }
      );
    }
    console.error("PUT /api/inventory/stock-matrix/rules error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
