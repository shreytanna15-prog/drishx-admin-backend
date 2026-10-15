import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../../../lib/session-auth";
import {
  CatalogServiceError,
  previewOrAddCatalogRange,
  serializeCatalogRange,
} from "../../../../../../lib/catalog/catalog-service";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/admin/catalog/products/:id/ranges
// Body: sphStart, sphEnd, cylStart?, cylEnd?, add?, axis?, eye?, price?, previewOnly?
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const result = await previewOrAddCatalogRange({
      productId: id,
      sphStart: Number(body.sphStart),
      sphEnd: Number(body.sphEnd),
      cylStart: body.cylStart != null ? Number(body.cylStart) : null,
      cylEnd: body.cylEnd != null ? Number(body.cylEnd) : null,
      add: body.add != null ? Number(body.add) : null,
      axis: body.axis != null ? Number(body.axis) : null,
      eye: body.eye ?? null,
      price: body.price != null ? Number(body.price) : null,
      costPrice: body.costPrice != null ? Number(body.costPrice) : null,
      label: body.label ?? null,
      actorUserId: auth.session.userId,
      previewOnly: Boolean(body.previewOnly),
    });

    if ("range" in result && result.range) {
      return NextResponse.json(
        {
          range: serializeCatalogRange(result.range),
          preview: result.preview,
          lensId: result.lensId,
          lensIds: result.lensIds,
          lensType: result.lensType,
          powerCount: result.powerCount,
          leafStorage: "POWER_WISE",
        },
        { status: 201 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CatalogServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("POST catalog range", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const isValidation =
      message.includes("Range") ||
      message.includes("powers") ||
      message.includes("required");
    return NextResponse.json(
      { error: isValidation ? message : "Internal Server Error" },
      { status: isValidation ? 400 : 500 }
    );
  }
}
