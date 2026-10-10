import { NextRequest, NextResponse } from "next/server";
import {
  countProductsForCoating,
  isCatalogLensType,
  mergeCoatingFilterLabels,
  type CatalogLensType,
} from "../../../../lib/coating-filter-labels";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return { error: auth.error };
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session };
}

// POST /api/admin/coating-filters/merge
// Access: ADMIN
// Body: { sourceId, targetId }
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = (await req.json()) as {
      sourceId?: string;
      targetId?: string;
    };

    const sourceId = body.sourceId?.trim() ?? "";
    const targetId = body.targetId?.trim() ?? "";
    if (!sourceId || !targetId) {
      return NextResponse.json(
        { error: "sourceId and targetId are required." },
        { status: 400 }
      );
    }

    const result = await mergeCoatingFilterLabels(sourceId, targetId);
    const productCount = isCatalogLensType(result.target.lensType)
      ? await countProductsForCoating(
          result.target.lensType as CatalogLensType,
          result.target.name
        )
      : 0;

    return NextResponse.json({
      rewrittenCount: result.rewrittenCount,
      item: {
        id: result.target.id,
        lensType: result.target.lensType,
        name: result.target.name,
        description: result.target.description,
        sortOrder: result.target.sortOrder,
        isActive: result.target.isActive,
        isSystem: result.target.isSystem,
        productCount,
        createdAt: result.target.createdAt,
        updatedAt: result.target.updatedAt,
      },
      source: {
        id: result.source.id,
        name: result.source.name,
        isSystem: result.source.isSystem,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    if (
      message === "Coating filter not found." ||
      message.includes("must be different") ||
      message.includes("across different lens types") ||
      message.includes("Invalid lens type")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Error merging coating filters:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
