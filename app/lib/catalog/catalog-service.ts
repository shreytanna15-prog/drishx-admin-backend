/**
 * RW-09 catalog product + range service (Option 1B).
 *
 * New ranges → POWER_WISE exact-power leaves (sphStartRange=sph, cylStartRange=cyl).
 * Legacy bands stay LEGACY_BAND via backfill — never auto-split stock.
 */

import {
  CatalogLeafStorage,
  CatalogLensFamily,
  CatalogProductStatus,
  Eye,
  LensType,
  Prisma,
} from "@prisma/client";
import { createHash } from "crypto";
import { prisma } from "../prisma";
import {
  AuditAction,
  AuditModule,
  recordAuditEvent,
} from "../audit";
import {
  buildCatalogIdentityKey,
  type CatalogLensFamily as FamilyAlias,
  type CatalogProductIdentityInput,
} from "./product-identity";
import {
  findLegacyLeavesByIdentity,
  findLegacyOverlaps,
} from "./legacy-leaves";
import {
  assertRangeSizeAllowed,
  buildMatrixPreview,
  countMatrixPowers,
  enumeratePowerCells,
  formatRangeLabel,
  normalizeAxisBounds,
  rangesOverlap,
  suggestNonOverlappingBounds,
  toExactPowerLeafFields,
  type PowerCell,
  type SphCylRangeBounds,
} from "./range-math";

export class CatalogServiceError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status = 400,
    code = "CATALOG_ERROR",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CatalogServiceError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function toFamily(value: string): CatalogLensFamily {
  if (
    value === "SINGLE_VISION" ||
    value === "KRYPTOK" ||
    value === "PROGRESSIVE"
  ) {
    return value;
  }
  throw new CatalogServiceError("Invalid lensFamily.", 400, "INVALID_FAMILY");
}

function dec(n: number | null | undefined): Prisma.Decimal | null {
  if (n == null || !Number.isFinite(n)) return null;
  return new Prisma.Decimal(n);
}

function familyToLensType(family: CatalogLensFamily): LensType {
  if (family === CatalogLensFamily.SINGLE_VISION) return LensType.SINGLE_VISION;
  if (family === CatalogLensFamily.KRYPTOK) return LensType.KRYPTOK;
  return LensType.PROGRESSIVE;
}

/** Stable 32-bit advisory lock key from identity string. */
export function advisoryLockKey(identityKey: string): number {
  const hash = createHash("sha256").update(identityKey).digest();
  return hash.readInt32BE(0);
}

async function withIdentityLock<T>(
  tx: Prisma.TransactionClient,
  identityKey: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = advisoryLockKey(identityKey);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
  return fn();
}

export type CreateCatalogProductInput = {
  lensFamily: string;
  category?: string | null;
  brand: string;
  item?: string | null;
  index?: number | null;
  coating: string;
  progressiveType?: string | null;
  defaultPrice: number;
  defaultCostPrice?: number | null;
  notes?: string | null;
  actorUserId: string;
  /** When true and legacy leaves exist, link them instead of erroring. */
  linkLegacy?: boolean;
};

export async function createCatalogProduct(input: CreateCatalogProductInput) {
  const lensFamily = toFamily(input.lensFamily);
  const brand = input.brand.trim();
  const coating = input.coating.trim();
  if (!brand || !coating) {
    throw new CatalogServiceError("brand and coating are required.");
  }
  if (!(input.defaultPrice > 0) || !Number.isFinite(input.defaultPrice)) {
    throw new CatalogServiceError("defaultPrice must be a positive number.");
  }

  const identityInput: CatalogProductIdentityInput = {
    lensFamily: lensFamily as FamilyAlias,
    category: input.category,
    brand,
    item: input.item,
    index: input.index ?? null,
    coating,
    progressiveType: input.progressiveType,
  };

  let identityKey: string;
  try {
    identityKey = buildCatalogIdentityKey(identityInput);
  } catch (err) {
    throw new CatalogServiceError(
      err instanceof Error ? err.message : "Invalid product identity.",
      400,
      "INVALID_IDENTITY"
    );
  }

  const existingFacade = await prisma.catalogProduct.findUnique({
    where: { identityKey },
    include: { ranges: true },
  });
  if (existingFacade) {
    throw new CatalogServiceError(
      "A product with this identity already exists.",
      409,
      "DUPLICATE_PRODUCT",
      { productId: existingFacade.id, identityKey }
    );
  }

  const legacyLeaves = await findLegacyLeavesByIdentity(identityInput);
  if (legacyLeaves.length > 0 && !input.linkLegacy) {
    throw new CatalogServiceError(
      `Legacy inventory already exists for this identity (${legacyLeaves.length} lens row(s)). Open the existing product or pass linkLegacy to attach a facade without duplicating stock.`,
      409,
      "LEGACY_IDENTITY_EXISTS",
      {
        identityKey,
        leafCount: legacyLeaves.length,
        sampleLensIds: legacyLeaves.slice(0, 5).map((l) => l.id),
      }
    );
  }

  if (legacyLeaves.length > 0 && input.linkLegacy) {
    return linkLegacyLeavesAsProduct({
      identityInput,
      identityKey,
      lensFamily,
      brand,
      coating,
      defaultPrice: input.defaultPrice,
      defaultCostPrice: input.defaultCostPrice ?? null,
      notes: input.notes ?? null,
      actorUserId: input.actorUserId,
      legacyLeaves,
    });
  }

  const product = await prisma.catalogProduct.create({
    data: {
      lensFamily,
      category: input.category?.trim() || null,
      brand,
      item: input.item?.trim() || null,
      index: dec(input.index ?? null),
      coating,
      progressiveType: input.progressiveType?.trim() || null,
      defaultPrice: input.defaultPrice,
      defaultCostPrice: dec(input.defaultCostPrice ?? null),
      notes: input.notes?.trim() || null,
      identityKey,
      status: CatalogProductStatus.ACTIVE,
    },
  });

  await recordAuditEvent(prisma, {
    action: AuditAction.STOCK_ADJUSTED,
    module: AuditModule.INVENTORY,
    entityType: "CatalogProduct",
    entityId: product.id,
    actor: {
      actorType: "HUMAN",
      actorUserId: input.actorUserId,
      actorName: null,
    },
    context: {
      event: "CATALOG_PRODUCT_CREATED",
      identityKey,
      lensFamily,
      brand,
      coating,
    },
    activityMessage: `Catalog product created: ${brand} · ${coating}`,
    message: "Catalog product created",
  });

  return product;
}

async function linkLegacyLeavesAsProduct(input: {
  identityInput: CatalogProductIdentityInput;
  identityKey: string;
  lensFamily: CatalogLensFamily;
  brand: string;
  coating: string;
  defaultPrice: number;
  defaultCostPrice: number | null;
  notes: string | null;
  actorUserId: string;
  legacyLeaves: Awaited<ReturnType<typeof findLegacyLeavesByIdentity>>;
}) {
  const { identityInput, identityKey, lensFamily, legacyLeaves } = input;
  const lensType = familyToLensType(lensFamily);
  const price =
    legacyLeaves.find((l) => l.price > 0)?.price ?? input.defaultPrice;

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.catalogProduct.create({
      data: {
        lensFamily,
        category: identityInput.category?.trim() || null,
        brand: input.brand,
        item: identityInput.item?.trim() || null,
        index: dec(identityInput.index ?? null),
        coating: input.coating,
        progressiveType: identityInput.progressiveType?.trim() || null,
        defaultPrice: price,
        defaultCostPrice: dec(input.defaultCostPrice),
        notes: input.notes?.trim() || null,
        identityKey,
        status: CatalogProductStatus.ACTIVE,
      },
    });

    // One CatalogRange per legacy leaf (each band/exact row is its own range slice).
    for (const leaf of legacyLeaves) {
      if (!leaf.bounds) continue;
      const already = await tx.catalogRangeLeaf.findUnique({
        where: {
          lensType_lensId: { lensType, lensId: leaf.id },
        },
      });
      if (already) continue;

      const labelBase = formatRangeLabel(leaf.bounds);
      let label = labelBase.slice(0, 48);
      const clash = await tx.catalogRange.findUnique({
        where: { productId_label: { productId: created.id, label } },
      });
      if (clash) label = `${label}-${leaf.id.slice(0, 6)}`.slice(0, 64);

      const range = await tx.catalogRange.create({
        data: {
          productId: created.id,
          label,
          sphStart: leaf.bounds.sph.start,
          sphEnd: leaf.bounds.sph.end,
          cylStart: leaf.bounds.cyl?.start ?? null,
          cylEnd: leaf.bounds.cyl?.end ?? null,
          add: leaf.add,
          axis: leaf.axis,
          eye: leaf.eye === "LEFT" || leaf.eye === "RIGHT" ? leaf.eye : null,
          price: leaf.price,
          costPrice: leaf.costPrice,
          powerCount: 1,
          leafStorage: CatalogLeafStorage.LEGACY_BAND,
          lensType,
          lensId: leaf.id,
        },
      });
      await tx.catalogRangeLeaf.create({
        data: {
          rangeId: range.id,
          lensType,
          lensId: leaf.id,
        },
      });
    }

    return created;
  });

  await recordAuditEvent(prisma, {
    action: AuditAction.STOCK_ADJUSTED,
    module: AuditModule.INVENTORY,
    entityType: "CatalogProduct",
    entityId: product.id,
    actor: {
      actorType: "HUMAN",
      actorUserId: input.actorUserId,
      actorName: null,
    },
    context: {
      event: "CATALOG_PRODUCT_LINKED_LEGACY",
      identityKey,
      leafCount: legacyLeaves.length,
    },
    activityMessage: `Catalog product linked to ${legacyLeaves.length} legacy lens row(s)`,
    message: "Catalog product linked from legacy",
  });

  return prisma.catalogProduct.findUniqueOrThrow({
    where: { id: product.id },
    include: { ranges: { include: { leaves: true }, orderBy: { createdAt: "asc" } } },
  });
}

export type AddCatalogRangeInput = {
  productId: string;
  sphStart: number;
  sphEnd: number;
  cylStart?: number | null;
  cylEnd?: number | null;
  add?: number | null;
  axis?: number | null;
  eye?: string | null;
  price?: number | null;
  costPrice?: number | null;
  label?: string | null;
  actorUserId: string;
  previewOnly?: boolean;
};

function parseEye(value: string | null | undefined): Eye | null {
  if (!value) return null;
  const s = value.trim().toUpperCase();
  if (s === "LEFT" || s === "RIGHT") return s as Eye;
  if (s === "OD") return Eye.RIGHT;
  if (s === "OS") return Eye.LEFT;
  throw new CatalogServiceError("eye must be LEFT or RIGHT.");
}

function boundsFromInput(input: AddCatalogRangeInput): SphCylRangeBounds {
  const sph = normalizeAxisBounds(input.sphStart, input.sphEnd);
  const hasCyl =
    input.cylEnd != null &&
    Number.isFinite(input.cylEnd) &&
    input.cylStart != null &&
    Number.isFinite(input.cylStart);
  return {
    sph,
    cyl: hasCyl
      ? normalizeAxisBounds(Number(input.cylStart), Number(input.cylEnd))
      : null,
  };
}

function existingRangeToBounds(row: {
  sphStart: Prisma.Decimal;
  sphEnd: Prisma.Decimal;
  cylStart: Prisma.Decimal | null;
  cylEnd: Prisma.Decimal | null;
}): SphCylRangeBounds {
  return {
    sph: normalizeAxisBounds(Number(row.sphStart), Number(row.sphEnd)),
    cyl:
      row.cylEnd != null && row.cylStart != null
        ? normalizeAxisBounds(Number(row.cylStart), Number(row.cylEnd))
        : null,
  };
}

const INSERT_CHUNK = 200;

export async function previewOrAddCatalogRange(input: AddCatalogRangeInput) {
  const product = await prisma.catalogProduct.findUnique({
    where: { id: input.productId },
    include: { ranges: true },
  });
  if (!product) {
    throw new CatalogServiceError("Product not found.", 404, "NOT_FOUND");
  }
  if (product.status === CatalogProductStatus.ARCHIVED) {
    throw new CatalogServiceError(
      "Cannot add ranges to an archived product.",
      400,
      "PRODUCT_ARCHIVED"
    );
  }

  const bounds = boundsFromInput(input);
  assertRangeSizeAllowed(bounds);
  const cells = enumeratePowerCells(bounds);
  const preview = buildMatrixPreview(bounds);
  const label = (input.label?.trim() || preview.label).slice(0, 64);

  for (const existing of product.ranges) {
    const existingBounds = existingRangeToBounds(existing);
    if (rangesOverlap(bounds, existingBounds)) {
      const suggestion = suggestNonOverlappingBounds(
        bounds,
        existingBounds,
        existing.label
      );
      throw new CatalogServiceError(
        suggestion.message,
        400,
        "RANGE_OVERLAP",
        {
          conflictingRangeId: existing.id,
          conflictingLabel: existing.label,
          suggestedSphStart: suggestion.suggestedSphStart,
          suggestedBounds: suggestion.suggestedBounds,
        }
      );
    }
  }

  const dupLabel = product.ranges.find(
    (r) => r.label.toLowerCase() === label.toLowerCase()
  );
  if (dupLabel) {
    throw new CatalogServiceError(
      `Range label "${label}" already exists on this product.`,
      409,
      "DUPLICATE_LABEL"
    );
  }

  const identityInput: CatalogProductIdentityInput = {
    lensFamily: product.lensFamily as FamilyAlias,
    category: product.category,
    brand: product.brand,
    item: product.item,
    index: product.index != null ? Number(product.index) : null,
    coating: product.coating,
    progressiveType: product.progressiveType,
  };

  const legacyLeaves = await findLegacyLeavesByIdentity(identityInput);
  // Exclude leaves already linked to this product's ranges
  const linkedIds = new Set(
    (
      await prisma.catalogRangeLeaf.findMany({
        where: { range: { productId: product.id } },
        select: { lensId: true },
      })
    ).map((l) => l.lensId)
  );
  const unlinkedLegacy = legacyLeaves.filter((l) => !linkedIds.has(l.id));
  const legacyHit = findLegacyOverlaps(bounds, cells, unlinkedLegacy, {
    add: input.add,
    axis: input.axis,
    eye: input.eye,
  });
  if (legacyHit) {
    throw new CatalogServiceError(
      legacyHit.suggestion.message,
      400,
      "RANGE_OVERLAP_LEGACY",
      {
        conflictingLensId: legacyHit.leafId,
        conflictingLabel: legacyHit.label,
        suggestedSphStart: legacyHit.suggestion.suggestedSphStart,
        suggestedBounds: legacyHit.suggestion.suggestedBounds,
      }
    );
  }

  if (input.previewOnly) {
    return {
      preview,
      label,
      productId: product.id,
      leafStorage: CatalogLeafStorage.POWER_WISE,
    };
  }

  if (product.lensFamily === CatalogLensFamily.KRYPTOK) {
    if (input.add == null || !Number.isFinite(input.add)) {
      throw new CatalogServiceError("add is required for Kryptok ranges.");
    }
  }
  if (product.lensFamily === CatalogLensFamily.PROGRESSIVE) {
    if (input.add == null || !Number.isFinite(input.add)) {
      throw new CatalogServiceError("add is required for Progressive ranges.");
    }
    if (!input.eye) {
      throw new CatalogServiceError("eye is required for Progressive ranges.");
    }
    if (!product.item || !product.progressiveType || product.index == null) {
      throw new CatalogServiceError(
        "Progressive product is missing item, type, or index."
      );
    }
  }

  const price =
    input.price != null && Number.isFinite(input.price) && input.price > 0
      ? input.price
      : Number(product.defaultPrice);
  const costPrice =
    input.costPrice != null && Number.isFinite(input.costPrice)
      ? input.costPrice
      : product.defaultCostPrice != null
        ? Number(product.defaultCostPrice)
        : null;

  const powerCount = cells.length;
  const disabled = product.status !== CatalogProductStatus.ACTIVE;
  const lensType = familyToLensType(product.lensFamily);
  const eye =
    product.lensFamily === CatalogLensFamily.PROGRESSIVE
      ? parseEye(input.eye)
      : null;

  const result = await prisma.$transaction(
    async (tx) => {
      return withIdentityLock(tx, product.identityKey, async () => {
        // Re-check exact-power collisions under lock
        await assertNoExactPowerCollision(tx, product, cells, {
          add: input.add,
          axis: input.axis,
          eye,
        });

        const lensIds = await createExactPowerLeaves(tx, {
          product,
          cells,
          price,
          costPrice,
          disabled,
          add: input.add,
          axis: input.axis,
          eye,
        });

        const range = await tx.catalogRange.create({
          data: {
            productId: product.id,
            label,
            sphStart: bounds.sph.start,
            sphEnd: bounds.sph.end,
            cylStart: bounds.cyl?.start ?? null,
            cylEnd: bounds.cyl?.end ?? null,
            add: input.add != null ? input.add : null,
            axis: input.axis ?? null,
            eye,
            price,
            costPrice: costPrice != null ? costPrice : null,
            powerCount,
            leafStorage: CatalogLeafStorage.POWER_WISE,
            lensType,
            lensId: lensIds[0] ?? null,
          },
        });

        for (let i = 0; i < lensIds.length; i += INSERT_CHUNK) {
          const chunk = lensIds.slice(i, i + INSERT_CHUNK);
          await tx.catalogRangeLeaf.createMany({
            data: chunk.map((lensId) => ({
              rangeId: range.id,
              lensType,
              lensId,
            })),
          });
        }

        return {
          range,
          lensIds,
          lensId: lensIds[0] ?? null,
          lensType,
          preview,
          powerCount,
        };
      });
    },
    { timeout: 120_000 }
  );

  await recordAuditEvent(prisma, {
    action: AuditAction.STOCK_ADJUSTED,
    module: AuditModule.INVENTORY,
    entityType: "CatalogRange",
    entityId: result.range.id,
    actor: {
      actorType: "HUMAN",
      actorUserId: input.actorUserId,
      actorName: null,
    },
    context: {
      event: "CATALOG_RANGE_GENERATED_POWER_WISE",
      productId: product.id,
      label,
      powerCount,
      lensType: result.lensType,
      representativeLensId: result.lensId,
    },
    activityMessage: `Catalog range ${label} generated (${powerCount} power SKUs)`,
    message: "Catalog range generated (power-wise)",
  });

  return result;
}

async function assertNoExactPowerCollision(
  tx: Prisma.TransactionClient,
  product: {
    lensFamily: CatalogLensFamily;
    category: string | null;
    brand: string;
    item: string | null;
    index: Prisma.Decimal | null;
    coating: string;
    progressiveType: string | null;
  },
  cells: PowerCell[],
  extras: { add?: number | null; axis?: number | null; eye?: Eye | null }
) {
  // Sample-check: if any existing exact-power row matches product + first/last cells.
  // Full protection is advisory lock + create; this catches obvious dupes early.
  const sample = [
    cells[0],
    cells[Math.floor(cells.length / 2)],
    cells[cells.length - 1],
  ].filter(Boolean) as PowerCell[];

  for (const cell of sample) {
    if (product.lensFamily === CatalogLensFamily.SINGLE_VISION) {
      const hit = await tx.singleVisionLens.findFirst({
        where: {
          brand: product.brand,
          coating: product.coating,
          index: product.index ?? undefined,
          category: product.category,
          item: product.item,
          sph: cell.sph,
          sphStartRange: cell.sph,
          cyl: cell.cyl,
          cylStartRange: cell.cyl,
        },
        select: { id: true },
      });
      if (hit) {
        throw new CatalogServiceError(
          `Exact power ${cell.sph}/${cell.cyl ?? "—"} already exists for this product (${hit.id}).`,
          409,
          "DUPLICATE_POWER_SKU",
          { lensId: hit.id, cell }
        );
      }
    } else if (product.lensFamily === CatalogLensFamily.KRYPTOK) {
      const hit = await tx.kryptokLens.findFirst({
        where: {
          brand: product.brand,
          coating: product.coating,
          category: product.category,
          sph: cell.sph,
          sphStartRange: cell.sph,
          cyl: cell.cyl,
          cylStartRange: cell.cyl,
          add: extras.add ?? undefined,
          axis: extras.axis ?? undefined,
        },
        select: { id: true },
      });
      if (hit) {
        throw new CatalogServiceError(
          `Exact Kryptok power already exists (${hit.id}).`,
          409,
          "DUPLICATE_POWER_SKU",
          { lensId: hit.id, cell }
        );
      }
    } else {
      const hit = await tx.progressiveLens.findFirst({
        where: {
          brand: product.brand,
          coating: product.coating,
          item: product.item ?? undefined,
          type: product.progressiveType ?? undefined,
          index: product.index ?? undefined,
          category: product.category,
          sph: cell.sph,
          sphStartRange: cell.sph,
          cyl: cell.cyl,
          cylStartRange: cell.cyl,
          add: extras.add ?? undefined,
          axis: extras.axis ?? undefined,
          eye: extras.eye ?? undefined,
        },
        select: { id: true },
      });
      if (hit) {
        throw new CatalogServiceError(
          `Exact Progressive power already exists (${hit.id}).`,
          409,
          "DUPLICATE_POWER_SKU",
          { lensId: hit.id, cell }
        );
      }
    }
  }
}

async function createExactPowerLeaves(
  tx: Prisma.TransactionClient,
  args: {
    product: {
      lensFamily: CatalogLensFamily;
      category: string | null;
      brand: string;
      item: string | null;
      index: Prisma.Decimal | null;
      coating: string;
      progressiveType: string | null;
    };
    cells: PowerCell[];
    price: number;
    costPrice: number | null;
    disabled: boolean;
    add?: number | null;
    axis?: number | null;
    eye?: Eye | null;
  }
): Promise<string[]> {
  const { product, cells, price, costPrice, disabled } = args;
  const ids: string[] = [];

  if (product.lensFamily === CatalogLensFamily.SINGLE_VISION) {
    const index = product.index ?? new Prisma.Decimal(1.56);
    for (let i = 0; i < cells.length; i += INSERT_CHUNK) {
      const chunk = cells.slice(i, i + INSERT_CHUNK);
      const created = await tx.singleVisionLens.createManyAndReturn({
        data: chunk.map((cell) => {
          const fields = toExactPowerLeafFields(cell);
          return {
            category: product.category,
            brand: product.brand,
            item: product.item,
            index,
            coating: product.coating,
            sph: fields.sph,
            sphStartRange: fields.sphStartRange,
            cyl: fields.cyl,
            cylStartRange: fields.cylStartRange,
            price,
            costPrice: costPrice != null ? costPrice : undefined,
            quantity: 0,
            isDisabled: disabled,
          };
        }),
      });
      ids.push(...created.map((r) => r.id));
    }
    return ids;
  }

  if (product.lensFamily === CatalogLensFamily.KRYPTOK) {
    for (let i = 0; i < cells.length; i += INSERT_CHUNK) {
      const chunk = cells.slice(i, i + INSERT_CHUNK);
      const created = await tx.kryptokLens.createManyAndReturn({
        data: chunk.map((cell) => {
          const fields = toExactPowerLeafFields(cell);
          return {
            category: product.category,
            brand: product.brand,
            item: product.item,
            coating: product.coating,
            sph: fields.sph,
            sphStartRange: fields.sphStartRange,
            cyl: fields.cyl,
            cylStartRange: fields.cylStartRange,
            axis: args.axis ?? null,
            add: Number(args.add),
            price,
            costPrice: costPrice != null ? costPrice : undefined,
            quantity: 0,
            isDisabled: disabled,
          };
        }),
      });
      ids.push(...created.map((r) => r.id));
    }
    return ids;
  }

  for (let i = 0; i < cells.length; i += INSERT_CHUNK) {
    const chunk = cells.slice(i, i + INSERT_CHUNK);
    const created = await tx.progressiveLens.createManyAndReturn({
      data: chunk.map((cell) => {
        const fields = toExactPowerLeafFields(cell);
        return {
          category: product.category,
          item: product.item!,
          brand: product.brand,
          index: product.index!,
          type: product.progressiveType!,
          coating: product.coating,
          sph: fields.sph,
          sphStartRange: fields.sphStartRange,
          cyl: fields.cyl,
          cylStartRange: fields.cylStartRange,
          axis: args.axis ?? null,
          add: Number(args.add),
          eye: args.eye!,
          price,
          costPrice: costPrice != null ? costPrice : undefined,
          quantity: 0,
          isDisabled: disabled,
        };
      }),
    });
    ids.push(...created.map((r) => r.id));
  }
  return ids;
}

export async function setCatalogProductStatus(input: {
  productId: string;
  status: "ACTIVE" | "HELD" | "ARCHIVED";
  actorUserId: string;
}) {
  const product = await prisma.catalogProduct.findUnique({
    where: { id: input.productId },
    include: {
      ranges: { include: { leaves: true } },
    },
  });
  if (!product) {
    throw new CatalogServiceError("Product not found.", 404, "NOT_FOUND");
  }

  const next = input.status as CatalogProductStatus;
  if (
    product.status === CatalogProductStatus.ARCHIVED &&
    next === CatalogProductStatus.HELD
  ) {
    throw new CatalogServiceError(
      "Unarchive to ACTIVE before holding.",
      400,
      "INVALID_TRANSITION"
    );
  }

  const holding = next !== CatalogProductStatus.ACTIVE;
  const activating = next === CatalogProductStatus.ACTIVE;

  await prisma.$transaction(async (tx) => {
    await tx.catalogProduct.update({
      where: { id: product.id },
      data: {
        status: next,
        heldAt: next === CatalogProductStatus.HELD ? new Date() : null,
        heldByUserId:
          next === CatalogProductStatus.HELD ? input.actorUserId : null,
        archivedAt: next === CatalogProductStatus.ARCHIVED ? new Date() : null,
        archivedByUserId:
          next === CatalogProductStatus.ARCHIVED ? input.actorUserId : null,
      },
    });

    for (const range of product.ranges) {
      const leafRefs =
        range.leaves.length > 0
          ? range.leaves
          : range.lensId
            ? [
                {
                  id: "",
                  lensType: range.lensType,
                  lensId: range.lensId,
                  disabledByProductHold: false,
                },
              ]
            : [];

      for (const leaf of leafRefs) {
        if (holding) {
          const current = await readLeafDisabled(tx, leaf.lensType, leaf.lensId);
          if (current == null) continue;
          const shouldMarkHold = !current;
          if (shouldMarkHold) {
            await setLeafDisabled(tx, leaf.lensType, leaf.lensId, true);
            if (leaf.id) {
              await tx.catalogRangeLeaf.update({
                where: { id: leaf.id },
                data: { disabledByProductHold: true },
              });
            }
          }
        } else if (activating) {
          if (leaf.id && leaf.disabledByProductHold) {
            await setLeafDisabled(tx, leaf.lensType, leaf.lensId, false);
            await tx.catalogRangeLeaf.update({
              where: { id: leaf.id },
              data: { disabledByProductHold: false },
            });
          } else if (!leaf.id && range.lensId) {
            // Legacy single-pointer fallback: only clear if we cannot track provenance — leave as-is if independently disabled unknown
            // Prefer no-op for untracked leaves when activating without leaf rows.
          }
        }
      }
    }
  });

  await recordAuditEvent(prisma, {
    action: AuditAction.STOCK_ADJUSTED,
    module: AuditModule.INVENTORY,
    entityType: "CatalogProduct",
    entityId: product.id,
    actor: {
      actorType: "HUMAN",
      actorUserId: input.actorUserId,
      actorName: null,
    },
    context: {
      event: "CATALOG_PRODUCT_STATUS",
      from: product.status,
      to: next,
    },
    activityMessage: `Catalog product status ${product.status} → ${next}`,
    message: `Catalog product ${next}`,
  });

  return prisma.catalogProduct.findUniqueOrThrow({
    where: { id: product.id },
    include: {
      ranges: { include: { leaves: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

async function readLeafDisabled(
  tx: Prisma.TransactionClient,
  lensType: LensType,
  lensId: string
): Promise<boolean | null> {
  if (lensType === LensType.SINGLE_VISION) {
    const row = await tx.singleVisionLens.findUnique({
      where: { id: lensId },
      select: { isDisabled: true },
    });
    return row?.isDisabled ?? null;
  }
  if (lensType === LensType.KRYPTOK) {
    const row = await tx.kryptokLens.findUnique({
      where: { id: lensId },
      select: { isDisabled: true },
    });
    return row?.isDisabled ?? null;
  }
  if (lensType === LensType.PROGRESSIVE) {
    const row = await tx.progressiveLens.findUnique({
      where: { id: lensId },
      select: { isDisabled: true },
    });
    return row?.isDisabled ?? null;
  }
  return null;
}

async function setLeafDisabled(
  tx: Prisma.TransactionClient,
  lensType: LensType,
  lensId: string,
  isDisabled: boolean
) {
  if (lensType === LensType.SINGLE_VISION) {
    await tx.singleVisionLens.updateMany({
      where: { id: lensId },
      data: { isDisabled },
    });
  } else if (lensType === LensType.KRYPTOK) {
    await tx.kryptokLens.updateMany({
      where: { id: lensId },
      data: { isDisabled },
    });
  } else if (lensType === LensType.PROGRESSIVE) {
    await tx.progressiveLens.updateMany({
      where: { id: lensId },
      data: { isDisabled },
    });
  }
}

export function serializeCatalogProduct(
  product: Awaited<ReturnType<typeof prisma.catalogProduct.findFirst>> & {
    ranges?: Array<Record<string, unknown>>;
  }
) {
  if (!product) return null;
  return {
    ...product,
    index: product.index != null ? Number(product.index) : null,
    defaultPrice: Number(product.defaultPrice),
    defaultCostPrice:
      product.defaultCostPrice != null ? Number(product.defaultCostPrice) : null,
    rangeCount: product.ranges?.length ?? 0,
    powerCount:
      product.ranges?.reduce(
        (sum, r) => sum + Number((r as { powerCount?: number }).powerCount ?? 0),
        0
      ) ?? 0,
    ranges: product.ranges?.map((r) => serializeCatalogRange(r as never)),
  };
}

export function serializeCatalogRange(range: {
  id: string;
  productId: string;
  label: string;
  sphStart: Prisma.Decimal | number;
  sphEnd: Prisma.Decimal | number;
  cylStart: Prisma.Decimal | number | null;
  cylEnd: Prisma.Decimal | number | null;
  add: Prisma.Decimal | number | null;
  axis: number | null;
  eye: Eye | null;
  price: Prisma.Decimal | number;
  costPrice: Prisma.Decimal | number | null;
  powerCount: number;
  leafStorage?: CatalogLeafStorage | string;
  lensType: LensType;
  lensId: string | null;
  createdAt: Date;
  updatedAt: Date;
  leaves?: Array<{ id: string; lensId: string; lensType: LensType }>;
}) {
  return {
    ...range,
    sphStart: Number(range.sphStart),
    sphEnd: Number(range.sphEnd),
    cylStart: range.cylStart != null ? Number(range.cylStart) : null,
    cylEnd: range.cylEnd != null ? Number(range.cylEnd) : null,
    add: range.add != null ? Number(range.add) : null,
    price: Number(range.price),
    costPrice: range.costPrice != null ? Number(range.costPrice) : null,
    leafStorage: range.leafStorage ?? CatalogLeafStorage.POWER_WISE,
    leafCount: range.leaves?.length ?? range.powerCount,
    createdAt: range.createdAt.toISOString(),
    updatedAt: range.updatedAt.toISOString(),
  };
}

export { formatRangeLabel, countMatrixPowers, enumeratePowerCells };
