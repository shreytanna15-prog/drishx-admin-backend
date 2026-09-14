import { NextRequest, NextResponse } from "next/server";
import {
  createCoatingFilterLabel,
  ensureCoatingFilterLabelsSynced,
  countProductsForCoating,
  isCatalogLensType,
  listCoatingFilterLabels,
  type CatalogLensType,
} from "../../../lib/coating-filter-labels";
import { getSession } from "../../../lib/session-auth";

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

// GET /api/admin/coating-filters?type=single-vision
// Access: ADMIN
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const typeParam = (req.nextUrl.searchParams.get("type") ?? "").toLowerCase();
    if (!isCatalogLensType(typeParam)) {
      return NextResponse.json(
        {
          error:
            "Query param type is required (single-vision, kryptok, progressive).",
        },
        { status: 400 }
      );
    }

    await ensureCoatingFilterLabelsSynced(typeParam);

    const includeInactive =
      req.nextUrl.searchParams.get("includeInactive") !== "false";
    const labels = await listCoatingFilterLabels(typeParam, { includeInactive });

    const items = await Promise.all(
      labels.map(async (label) => ({
        id: label.id,
        lensType: label.lensType,
        name: label.name,
        description: label.description,
        sortOrder: label.sortOrder,
        isActive: label.isActive,
        isSystem: label.isSystem,
        productCount: await countProductsForCoating(
          typeParam as CatalogLensType,
          label.name
        ),
        createdAt: label.createdAt,
        updatedAt: label.updatedAt,
      }))
    );

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error listing coating filters:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/admin/coating-filters
// Access: ADMIN
// Body: { lensType, name, description?, sortOrder? }
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = (await req.json()) as {
      lensType?: string;
      name?: string;
      description?: string | null;
      sortOrder?: number;
    };

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

    const name = body.name?.trim() ?? "";
    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    const label = await createCoatingFilterLabel({
      lensType: typeParam as CatalogLensType,
      name,
      description: body.description,
      sortOrder:
        typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
          ? body.sortOrder
          : undefined,
    });

    const productCount = await countProductsForCoating(
      typeParam as CatalogLensType,
      label.name
    );

    return NextResponse.json(
      {
        item: {
          id: label.id,
          lensType: label.lensType,
          name: label.name,
          description: label.description,
          sortOrder: label.sortOrder,
          isActive: label.isActive,
          isSystem: label.isSystem,
          productCount,
          createdAt: label.createdAt,
          updatedAt: label.updatedAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    if (message.includes("Unique constraint") || message.includes("unique")) {
      return NextResponse.json(
        { error: "A coating filter with this name already exists." },
        { status: 409 }
      );
    }
    if (
      message === "Name is required." ||
      message.includes("Hardcoat grades")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Error creating coating filter:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
