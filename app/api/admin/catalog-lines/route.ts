import { NextRequest, NextResponse } from "next/server";
import {
  createProductLine,
  ensureSystemProductLinesSeeded,
  isCatalogLensType,
  listProductLines,
  type CatalogLensType,
} from "../../../lib/catalog-product-lines";
import { countProductsForLine } from "../../../lib/wholesale-catalog-counts";
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

// GET /api/admin/catalog-lines?type=single-vision
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

    await ensureSystemProductLinesSeeded();

    const includeInactive =
      req.nextUrl.searchParams.get("includeInactive") !== "false";
    const lines = await listProductLines(typeParam, { includeInactive });

    const countsMap = new Map<string, number>();
    // Resolve counts from catalog count helper once, then map by name.
    const { buildSingleVisionItemCounts, buildKryptokItemCounts, buildProgressiveItemCounts } =
      await import("../../../lib/wholesale-catalog-counts");
    const countItems =
      typeParam === "single-vision"
        ? await buildSingleVisionItemCounts()
        : typeParam === "kryptok"
          ? await buildKryptokItemCounts()
          : await buildProgressiveItemCounts();

    for (const entry of countItems) {
      countsMap.set(entry.name.toLowerCase(), entry.productCount);
    }

    const items = lines.map((line) => ({
      id: line.id,
      lensType: line.lensType,
      name: line.name,
      description: line.description,
      sortOrder: line.sortOrder,
      isActive: line.isActive,
      isSystem: line.isSystem,
      productCount: countsMap.get(line.name.toLowerCase()) ?? 0,
      createdAt: line.createdAt,
      updatedAt: line.updatedAt,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error listing catalog lines:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/admin/catalog-lines
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

    const line = await createProductLine({
      lensType: typeParam as CatalogLensType,
      name,
      description: body.description,
      sortOrder:
        typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
          ? body.sortOrder
          : undefined,
    });

    const productCount = await countProductsForLine(
      typeParam as CatalogLensType,
      line.name
    );

    return NextResponse.json(
      {
        item: {
          id: line.id,
          lensType: line.lensType,
          name: line.name,
          description: line.description,
          sortOrder: line.sortOrder,
          isActive: line.isActive,
          isSystem: line.isSystem,
          productCount,
          createdAt: line.createdAt,
          updatedAt: line.updatedAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    if (message.includes("Unique constraint") || message.includes("unique")) {
      return NextResponse.json(
        { error: "A product line with this name already exists." },
        { status: 409 }
      );
    }
    if (message === "Name is required.") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Error creating catalog line:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
