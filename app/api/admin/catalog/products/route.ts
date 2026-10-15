import { NextRequest, NextResponse } from "next/server";
import { CatalogProductStatus, Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import {
  CatalogServiceError,
  createCatalogProduct,
  serializeCatalogProduct,
} from "../../../../lib/catalog/catalog-service";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

// GET /api/admin/catalog/products
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim().toLowerCase() || "";
    const family = searchParams.get("lensFamily")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20") || 20));

    const where: Prisma.CatalogProductWhereInput = {};
    if (
      family === "SINGLE_VISION" ||
      family === "KRYPTOK" ||
      family === "PROGRESSIVE"
    ) {
      where.lensFamily = family;
    }
    if (
      status === "ACTIVE" ||
      status === "HELD" ||
      status === "ARCHIVED"
    ) {
      where.status = status as CatalogProductStatus;
    }
    if (q) {
      where.OR = [
        { brand: { contains: q, mode: "insensitive" } },
        { coating: { contains: q, mode: "insensitive" } },
        { item: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { identityKey: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.catalogProduct.count({ where }),
      prisma.catalogProduct.findMany({
        where,
        include: { ranges: { select: { id: true, powerCount: true } } },
        orderBy: [{ brand: "asc" }, { coating: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      products: rows.map((p) => serializeCatalogProduct(p)),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    });
  } catch (error) {
    console.error("GET /api/admin/catalog/products", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/admin/catalog/products
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const product = await createCatalogProduct({
      lensFamily: String(body.lensFamily ?? ""),
      category: body.category ?? null,
      brand: String(body.brand ?? ""),
      item: body.item ?? null,
      index: body.index != null ? Number(body.index) : null,
      coating: String(body.coating ?? ""),
      progressiveType: body.progressiveType ?? null,
      defaultPrice: Number(body.defaultPrice),
      defaultCostPrice:
        body.defaultCostPrice != null ? Number(body.defaultCostPrice) : null,
      notes: body.notes ?? null,
      actorUserId: auth.session.userId,
      linkLegacy: Boolean(body.linkLegacy),
    });
    return NextResponse.json(
      { product: serializeCatalogProduct(product) },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof CatalogServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("POST /api/admin/catalog/products", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
