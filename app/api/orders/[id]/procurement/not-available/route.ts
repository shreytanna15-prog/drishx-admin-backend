import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../../lib/session-auth";
import {
  markPowerNotAvailable,
  serializeAlternateSuggestion,
  serializePowerVersion,
} from "../../../../../lib/alternate-power-workflow";

/**
 * POST /api/orders/:id/procurement/not-available
 * Staff marks retail ordered power as not available and generates alternate suggestions.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const supplierOptions = Array.isArray(body?.supplierOptions)
      ? body.supplierOptions
          .map((row: Record<string, unknown>) => ({
            lensId: typeof row.lensId === "string" ? row.lensId : "",
            etaDays:
              row.etaDays === undefined || row.etaDays === null
                ? null
                : Number(row.etaDays),
            sph: row.sph !== undefined ? Number(row.sph) : undefined,
            cyl:
              row.cyl === undefined
                ? undefined
                : row.cyl === null
                  ? null
                  : Number(row.cyl),
          }))
          .filter((row: { lensId: string }) => Boolean(row.lensId))
      : [];

    const result = await markPowerNotAvailable({
      orderId: id,
      actorUserId: session.userId,
      supplierOptions,
      notes: typeof body?.notes === "string" ? body.notes : null,
    });

    return NextResponse.json({
      version: serializePowerVersion({
        ...result.version,
        createdBy: null,
        acceptedBy: null,
      }),
      suggestions: result.suggestions.map(serializeAlternateSuggestion),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    const status =
      message.includes("not found") || message.includes("only")
        ? 400
        : 500;
    console.error("POST /api/orders/[id]/procurement/not-available error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
