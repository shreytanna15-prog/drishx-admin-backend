import { NextRequest, NextResponse } from "next/server";
import {
  isCatalogLensType,
  syncCoatingFilterLabelsFromProducts,
  type CatalogLensType,
} from "../../../../lib/coating-filter-labels";
import { getSession } from "../../../../lib/session-auth";

function requireAdmin(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  if (session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session };
}

// POST /api/admin/coating-filters/sync
// Access: ADMIN
// Body: { lensType }
// Upserts missing distinct product coatings as managed labels.
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = (await req.json()) as { lensType?: string };
    const typeParam = (body.lensType ?? "").toLowerCase();
    if (!isCatalogLensType(typeParam)) {
      return NextResponse.json(
        {
          error:
            "lensType is required (single-vision, kryptok, progressive).",
        },
        { status: 400 }
      );
    }

    const result = await syncCoatingFilterLabelsFromProducts(
      typeParam as CatalogLensType
    );

    return NextResponse.json({
      created: result.created,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("Error syncing coating filters:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
