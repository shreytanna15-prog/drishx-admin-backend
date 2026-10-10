import { NextRequest, NextResponse } from "next/server";
import {
  deactivateOrDeleteProductLine,
  getProductLineById,
  isCatalogLensType,
  updateProductLine,
  type CatalogLensType,
} from "../../../../lib/catalog-product-lines";
import { countProductsForLine } from "../../../../lib/wholesale-catalog-counts";
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

type CatalogLineRouteContext = { params: Promise<{ id: string }> };

// PUT /api/admin/catalog-lines/[id]
// Access: ADMIN
export async function PUT(req: NextRequest, context: CatalogLineRouteContext) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await context.params;
    const body = (await req.json()) as {
      name?: string;
      description?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    };

    const line = await updateProductLine(id, {
      name: body.name,
      description: body.description,
      sortOrder:
        typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
          ? body.sortOrder
          : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
    });

    const productCount = isCatalogLensType(line.lensType)
      ? await countProductsForLine(line.lensType as CatalogLensType, line.name)
      : 0;

    return NextResponse.json({
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    if (message === "Product line not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message === "Name is required." ||
      message === "System product lines cannot be renamed."
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("Unique constraint") || message.includes("unique")) {
      return NextResponse.json(
        { error: "A product line with this name already exists." },
        { status: 409 }
      );
    }
    console.error("Error updating catalog line:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/admin/catalog-lines/[id]?hard=true
// Access: ADMIN
// Default: soft-deactivate. hard=true permanently deletes custom zero-stock lines only.
export async function DELETE(req: NextRequest, context: CatalogLineRouteContext) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await context.params;
    const hard = req.nextUrl.searchParams.get("hard") === "true";

    const existing = await getProductLineById(id);
    if (!existing) {
      return NextResponse.json({ error: "Product line not found." }, { status: 404 });
    }

    const productCount = isCatalogLensType(existing.lensType)
      ? await countProductsForLine(
          existing.lensType as CatalogLensType,
          existing.name
        )
      : 0;

    const result = await deactivateOrDeleteProductLine(id, productCount, hard);

    return NextResponse.json({
      mode: result.mode,
      item: {
        id: result.line.id,
        lensType: result.line.lensType,
        name: result.line.name,
        description: result.line.description,
        sortOrder: result.line.sortOrder,
        isActive: result.mode === "deleted" ? false : result.line.isActive === false ? false : result.line.isActive,
        isSystem: result.line.isSystem,
        productCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    if (message === "Product line not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message.includes("cannot be permanently deleted") ||
      message.includes("still has stock")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Error deleting catalog line:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
