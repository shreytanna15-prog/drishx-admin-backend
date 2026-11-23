/**
 * Stock S3 — resolve / upsert LensProductPower for PO draft lines.
 */

import { Prisma, type LensType } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  formatCatalogPowerLabel,
  hasAnyPoIdentity,
  hasCatalogIdentity,
  hasLegacyIdentity,
  type PoLineIdentityInput,
} from "@/app/lib/catalog/catalog-po-identity-core";
import { normalizeStockPower } from "@/app/lib/catalog/lens-product-stock-core";

type DbClient = Prisma.TransactionClient | typeof prisma;

export class CatalogPoResolveError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "CATALOG_PO_RESOLVE") {
    super(message);
    this.name = "CatalogPoResolveError";
    this.status = status;
    this.code = code;
  }
}

function dec(value: number): Prisma.Decimal {
  return new Prisma.Decimal(normalizeStockPower(value).toFixed(2));
}

function num(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : Number(value.toString());
}

const powerLabelInclude = {
  lensProductVariant: {
    select: {
      name: true,
      skuCode: true,
      sellingPrice: true,
      addition: { select: { value: true } },
      product: {
        select: {
          family: { select: { name: true } },
          base: { select: { name: true } },
          material: { select: { name: true } },
          coating: { select: { name: true } },
          color: { select: { name: true } },
        },
      },
    },
  },
} as const;

export type ResolvedPoCatalogIdentity = {
  lensProductPowerId: string;
  lensProductVariantId: string;
  sph: number;
  cyl: number;
  productLabel: string;
  rangeLabel: string | null;
  powerLabel: string;
  sellingPrice: number;
  legacyLensType: LensType | null;
  legacyLensId: string | null;
};

function labelsFromPower(row: {
  sph: Prisma.Decimal;
  cyl: Prisma.Decimal;
  lensProductVariant: {
    name: string;
    skuCode: string;
    addition: { value: Prisma.Decimal | null } | null;
    product: {
      family: { name: string };
      base: { name: string };
      material: { name: string } | null;
      coating: { name: string } | null;
      color: { name: string } | null;
    };
  };
}): Pick<ResolvedPoCatalogIdentity, "productLabel" | "rangeLabel" | "powerLabel"> {
  const p = row.lensProductVariant.product;
  const productLabel = [
    p.family.name,
    p.base.name,
    p.material?.name,
    p.coating?.name,
    p.color?.name,
  ]
    .filter(Boolean)
    .join(" · ");
  const rangeLabel = row.lensProductVariant.name || row.lensProductVariant.skuCode;
  const powerLabel = formatCatalogPowerLabel(num(row.sph), num(row.cyl));
  return {
    productLabel: productLabel || row.lensProductVariant.skuCode,
    rangeLabel,
    powerLabel,
  };
}

/** Find or create a catalog leaf for variant + sph + cyl. */
export async function ensureCatalogPowerLeaf(
  client: DbClient,
  variantId: string,
  sph: number,
  cyl: number
) {
  const ns = normalizeStockPower(sph);
  const nc = normalizeStockPower(cyl);
  const sphDec = dec(ns);
  const cylDec = dec(nc);

  const existing = await client.lensProductPower.findUnique({
    where: {
      lensProductVariantId_sph_cyl: {
        lensProductVariantId: variantId,
        sph: sphDec,
        cyl: cylDec,
      },
    },
    include: powerLabelInclude,
  });
  if (existing) return existing;

  const variant = await client.lensProductVariant.findUnique({
    where: { id: variantId },
    select: { id: true, isActive: true },
  });
  if (!variant || !variant.isActive) {
    throw new CatalogPoResolveError(
      "Catalog variant not found or inactive.",
      400,
      "VARIANT_NOT_FOUND"
    );
  }

  return client.lensProductPower.create({
    data: {
      lensProductVariantId: variantId,
      sph: sphDec,
      cyl: cylDec,
      quantity: 0,
      blockedQty: 0,
      minStock: 0,
      targetStock: 0,
    },
    include: powerLabelInclude,
  });
}

/**
 * Resolve draft line identity to a concrete catalog leaf (and optional legacy bridge).
 * Upserts the leaf when variant+sph+cyl is provided.
 */
export async function resolveDraftLineCatalogIdentity(
  client: DbClient,
  line: PoLineIdentityInput
): Promise<ResolvedPoCatalogIdentity | null> {
  if (!hasCatalogIdentity(line)) {
    // Legacy-only: try bridge lookup so confirm can post to catalog when linked.
    if (hasLegacyIdentity(line)) {
      const bridged = await client.lensProductPower.findFirst({
        where: {
          legacyLensType: line.lensType as LensType,
          legacyLensId: line.lensId!.trim(),
        },
        include: powerLabelInclude,
      });
      if (!bridged) return null;
      const labels = labelsFromPower(bridged);
      return {
        lensProductPowerId: bridged.id,
        lensProductVariantId: bridged.lensProductVariantId,
        sph: num(bridged.sph),
        cyl: num(bridged.cyl),
        ...labels,
        sellingPrice: Number(bridged.lensProductVariant.sellingPrice),
        legacyLensType: bridged.legacyLensType,
        legacyLensId: bridged.legacyLensId,
      };
    }
    return null;
  }

  const leaf = line.lensProductPowerId?.trim()
    ? await client.lensProductPower.findUnique({
        where: { id: line.lensProductPowerId.trim() },
        include: powerLabelInclude,
      })
    : await ensureCatalogPowerLeaf(
        client,
        line.lensProductVariantId!.trim(),
        Number(line.sph),
        Number(line.cyl)
      );

  if (!leaf) {
    throw new CatalogPoResolveError(
      "Catalog stock leaf not found.",
      404,
      "POWER_NOT_FOUND"
    );
  }

  const labels = labelsFromPower(leaf);
  return {
    lensProductPowerId: leaf.id,
    lensProductVariantId: leaf.lensProductVariantId,
    sph: num(leaf.sph),
    cyl: num(leaf.cyl),
    ...labels,
    sellingPrice: Number(leaf.lensProductVariant.sellingPrice),
    legacyLensType: leaf.legacyLensType,
    legacyLensId: leaf.legacyLensId,
  };
}

export function assertDraftLineHasIdentity(line: PoLineIdentityInput, index: number) {
  if (!hasAnyPoIdentity(line)) {
    throw new CatalogPoResolveError(
      `Line ${index + 1}: provide lensProductPowerId, or variantId+sph+cyl, or legacy lensType+lensId.`,
      400,
      "IDENTITY_REQUIRED"
    );
  }
}

export { hasAnyPoIdentity, hasCatalogIdentity, hasLegacyIdentity };
