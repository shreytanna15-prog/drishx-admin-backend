import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../../lib/session-auth";
import {
  CatalogServiceError,
  serializeCatalogProduct,
  setCatalogProductStatus,
} from "../../../../../lib/catalog/catalog-service";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/admin/catalog/products/:id
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const product = await prisma.catalogProduct.findUnique({
      where: { id },
      include: {
        ranges: {
          orderBy: { createdAt: "asc" },
          include: {
            leaves: {
              select: {
                id: true,
                lensId: true,
                lensType: true,
                disabledByProductHold: true,
              },
            },
          },
        },
      },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    return NextResponse.json({ product: serializeCatalogProduct(product) });
  } catch (error) {
    console.error("GET catalog product", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/admin/catalog/products/:id
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = await req.json();

    if (body.status === "ACTIVE" || body.status === "HELD" || body.status === "ARCHIVED") {
      const product = await setCatalogProductStatus({
        productId: id,
        status: body.status,
        actorUserId: auth.session.userId,
      });
      return NextResponse.json({ product: serializeCatalogProduct(product) });
    }

    const existing = await prisma.catalogProduct.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const data: {
      notes?: string | null;
      defaultPrice?: number;
      defaultCostPrice?: number | null;
    } = {};
    if ("notes" in body) data.notes = body.notes?.trim() || null;
    if (body.defaultPrice != null && Number(body.defaultPrice) > 0) {
      data.defaultPrice = Number(body.defaultPrice);
    }
    if ("defaultCostPrice" in body) {
      data.defaultCostPrice =
        body.defaultCostPrice != null ? Number(body.defaultCostPrice) : null;
    }

    const product = await prisma.catalogProduct.update({
      where: { id },
      data,
      include: {
        ranges: {
          orderBy: { createdAt: "asc" },
          include: {
            leaves: {
              select: {
                id: true,
                lensId: true,
                lensType: true,
                disabledByProductHold: true,
              },
            },
          },
        },
      },
    });
    return NextResponse.json({ product: serializeCatalogProduct(product) });
  } catch (error) {
    if (error instanceof CatalogServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("PATCH catalog product", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
