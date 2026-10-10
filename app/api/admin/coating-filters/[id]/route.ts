import { NextRequest, NextResponse } from "next/server";
import {
  countProductsForCoating,
  deactivateOrDeleteCoatingFilterLabel,
  getCoatingFilterLabelById,
  isCatalogLensType,
  updateCoatingFilterLabel,
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

type CoatingFilterRouteContext = { params: Promise<{ id: string }> };

// PUT /api/admin/coating-filters/[id]
// Access: ADMIN
export async function PUT(req: NextRequest, context: CoatingFilterRouteContext) {
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

    const label = await updateCoatingFilterLabel(id, {
      name: body.name,
      description: body.description,
      sortOrder:
        typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
          ? body.sortOrder
          : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
    });

    const productCount = isCatalogLensType(label.lensType)
      ? await countProductsForCoating(
          label.lensType as CatalogLensType,
          label.name
        )
      : 0;

    return NextResponse.json({
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    if (message === "Coating filter not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message === "Name is required." ||
      message.includes("Hardcoat grades") ||
      message.includes("Invalid lens type")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("Unique constraint") || message.includes("unique")) {
      return NextResponse.json(
        { error: "A coating filter with this name already exists." },
        { status: 409 }
      );
    }
    console.error("Error updating coating filter:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/admin/coating-filters/[id]?hard=true
// Access: ADMIN
// Default: soft-deactivate. hard=true permanently deletes custom zero-usage labels only.
export async function DELETE(
  req: NextRequest,
  context: CoatingFilterRouteContext
) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await context.params;
    const hard = req.nextUrl.searchParams.get("hard") === "true";

    const existing = await getCoatingFilterLabelById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Coating filter not found." },
        { status: 404 }
      );
    }

    const productCount = isCatalogLensType(existing.lensType)
      ? await countProductsForCoating(
          existing.lensType as CatalogLensType,
          existing.name
        )
      : 0;

    const result = await deactivateOrDeleteCoatingFilterLabel(
      id,
      productCount,
      hard
    );

    return NextResponse.json({
      mode: result.mode,
      item: {
        id: result.line.id,
        lensType: result.line.lensType,
        name: result.line.name,
        description: result.line.description,
        sortOrder: result.line.sortOrder,
        isActive:
          result.mode === "deleted"
            ? false
            : result.line.isActive === false
              ? false
              : result.line.isActive,
        isSystem: result.line.isSystem,
        productCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    if (message === "Coating filter not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message.includes("cannot be permanently deleted") ||
      message.includes("still has products")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Error deleting coating filter:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
