import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getCatalogReservedForPowers } from "@/app/lib/catalog/catalog-stock-position";

export async function listShopCatalogPowers(params: { q?: string; page?: number; limit?: number }) {
  const page = Number.isFinite(params.page) ? Math.max(1, Math.floor(params.page!)) : 1;
  const limit = Number.isFinite(params.limit) ? Math.min(50, Math.max(1, Math.floor(params.limit!))) : 24;
  const q = params.q?.trim().slice(0, 100);
  const where: Prisma.LensProductPowerWhereInput = {
    lensProductVariant: {
      isActive: true,
      product: { isActive: true },
      sellingPrice: { gt: 0 },
      ...(q ? { OR: [
        { skuCode: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { product: { base: { name: { contains: q, mode: "insensitive" } } } },
      ] } : {}),
    },
  };
  const [total, rows] = await Promise.all([
    prisma.lensProductPower.count({ where }),
    prisma.lensProductPower.findMany({
      where, skip: (page - 1) * limit, take: limit,
      orderBy: [{ lensProductVariant: { skuCode: "asc" } }, { sph: "asc" }, { cyl: "asc" }],
      select: {
        id: true, sph: true, cyl: true, quantity: true, blockedQty: true,
        lensProductVariant: {
          select: {
            id: true, skuCode: true, name: true, sellingPrice: true, axis: true, eye: true,
            addition: { select: { value: true } },
            product: { select: { family: { select: { code: true, name: true } }, base: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);
  const reserved = await getCatalogReservedForPowers(rows.map((row) => row.id));
  return {
    items: rows.map((row) => ({
      id: row.id,
      variantId: row.lensProductVariant.id,
      skuCode: row.lensProductVariant.skuCode,
      name: row.lensProductVariant.name,
      family: row.lensProductVariant.product.family.name,
      base: row.lensProductVariant.product.base.name,
      sph: Number(row.sph), cyl: Number(row.cyl),
      axis: row.lensProductVariant.axis,
      addition: row.lensProductVariant.addition?.value != null ? Number(row.lensProductVariant.addition.value) : null,
      eye: row.lensProductVariant.eye,
      price: Number(row.lensProductVariant.sellingPrice),
      available: Math.max(0, row.quantity - row.blockedQty - (reserved.get(row.id) ?? 0)),
    })),
    page, limit, total, hasMore: page * limit < total,
  };
}
