/**
 * RC-04 LensProduct parent + LensProductVariant.
 * Parent = attribute combo; variants = power-range sellable SKUs.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { AuditAction, AuditModule, recordAuditEvent } from "../audit";
import {
  assertMaterialAllowedForBase,
  LensAttributeServiceError,
} from "./lens-attribute-service";
import { formatPowerRangeCompact } from "./catalog-power-select-options";
import { steppedRange } from "./lens-product-range";
import {
  buildLensProductBaseCode,
  buildLensProductName,
  buildLensProductSkuCode,
} from "./lens-product-sku";

export { steppedRange };
export {
  buildLensProductBaseCode,
  buildLensProductName,
  buildLensProductSkuCode,
} from "./lens-product-sku";

export class LensProductServiceError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status = 400,
    code = "LENS_PRODUCT_ERROR",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "LensProductServiceError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function ensureBaseMaterialCompat(baseId: string, materialId: string) {
  try {
    await assertMaterialAllowedForBase(baseId, materialId);
  } catch (err) {
    if (err instanceof LensAttributeServiceError) {
      throw new LensProductServiceError(err.message, err.status, err.code);
    }
    throw err;
  }
}

const parentInclude = {
  family: true,
  base: true,
  material: true,
  index: true,
  color: true,
  variants: {
    include: { powerRange: true },
    orderBy: [{ updatedAt: "desc" as const }],
  },
} satisfies Prisma.LensProductInclude;

const variantInclude = {
  powerRange: true,
  product: {
    include: {
      family: true,
      base: true,
      material: true,
      index: true,
      color: true,
    },
  },
} satisfies Prisma.LensProductVariantInclude;

type ParentRow = Prisma.LensProductGetPayload<{ include: typeof parentInclude }>;
type VariantRow = Prisma.LensProductVariantGetPayload<{
  include: typeof variantInclude;
}>;

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function num(d: Prisma.Decimal | null | undefined): number | null {
  if (d == null) return null;
  return Number(d);
}

function attrRef(row: { id: string; code: string; name: string }) {
  return { id: row.id, code: row.code, name: row.name };
}

function serializePowerRange(pr: {
  id: string;
  sphMin: Prisma.Decimal;
  sphMax: Prisma.Decimal;
  cylMin: Prisma.Decimal;
  cylMax: Prisma.Decimal;
}) {
  const sphMin = Number(pr.sphMin);
  const sphMax = Number(pr.sphMax);
  const cylMin = Number(pr.cylMin);
  const cylMax = Number(pr.cylMax);
  return {
    id: pr.id,
    label: formatPowerRangeCompact(sphMin, sphMax, cylMin, cylMax),
    cylSummary: formatPowerRangeCompact(sphMin, sphMax, cylMin, cylMax),
    sphMin,
    sphMax,
    cylMin,
    cylMax,
  };
}

export function serializeLensProductVariant(row: VariantRow) {
  const p = row.product;
  const sphMin = Number(row.sphMin);
  const sphMax = Number(row.sphMax);
  const cylMin = Number(row.cylMin);
  const cylMax = Number(row.cylMax);
  return {
    id: row.id,
    productId: row.productId,
    powerRangeId: row.powerRangeId,
    skuCode: row.skuCode,
    name: row.name,
    rangeType: row.rangeType,
    sphMin,
    sphMax,
    cylMin,
    cylMax,
    addMin: num(row.addMin),
    addMax: num(row.addMax),
    axis: row.axis,
    eye: row.eye,
    defaultPrice: num(row.defaultPrice),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    powerRange: serializePowerRange(row.powerRange),
    rangeLabel: formatPowerRangeCompact(sphMin, sphMax, cylMin, cylMax),
    rangeSummary: formatPowerRangeCompact(sphMin, sphMax, cylMin, cylMax),
    product: {
      id: p.id,
      baseCode: p.baseCode,
      familyId: p.familyId,
      baseId: p.baseId,
      materialId: p.materialId,
      indexId: p.indexId,
      colorId: p.colorId,
      family: attrRef(p.family),
      base: attrRef(p.base),
      material: p.material ? attrRef(p.material) : null,
      index: p.index
        ? {
            ...attrRef(p.index),
            value: num(p.index.value),
          }
        : null,
      color: p.color ? attrRef(p.color) : null,
      attributeSummary: [
        p.family.code,
        p.base.code,
        p.material?.code,
        p.index?.code,
        p.color?.code,
      ]
        .filter(Boolean)
        .join(" · "),
    },
  };
}

export function serializeLensProduct(row: ParentRow) {
  return {
    id: row.id,
    baseCode: row.baseCode,
    familyId: row.familyId,
    baseId: row.baseId,
    materialId: row.materialId,
    indexId: row.indexId,
    colorId: row.colorId,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    family: attrRef(row.family),
    base: attrRef(row.base),
    material: row.material ? attrRef(row.material) : null,
    index: row.index
      ? { ...attrRef(row.index), value: num(row.index.value) }
      : null,
    color: row.color ? attrRef(row.color) : null,
    attributeSummary: [
      row.family.code,
      row.base.code,
      row.material?.code,
      row.index?.code,
      row.color?.code,
    ]
      .filter(Boolean)
      .join(" · "),
    variantCount: row.variants.length,
    variants: row.variants.map((v) =>
      serializeLensProductVariant({
        ...v,
        product: {
          id: row.id,
          baseCode: row.baseCode,
          familyId: row.familyId,
          baseId: row.baseId,
          materialId: row.materialId,
          indexId: row.indexId,
          colorId: row.colorId,
          isActive: row.isActive,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          family: row.family,
          base: row.base,
          material: row.material,
          index: row.index,
          color: row.color,
        },
      } as VariantRow)
    ),
  };
}

async function assertActiveFk(
  label: string,
  id: string | null | undefined,
  loader: (id: string) => Promise<{ isActive: boolean } | null>
) {
  if (!id) return;
  const row = await loader(id);
  if (!row) {
    throw new LensProductServiceError(`${label} not found.`, 400, "INVALID_FK");
  }
  if (!row.isActive) {
    throw new LensProductServiceError(
      `${label} is inactive and cannot be used.`,
      400,
      "INACTIVE_FK"
    );
  }
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function requireId(label: string, value: string | null | undefined): string {
  const v = value?.trim();
  if (!v) {
    throw new LensProductServiceError(`${label} is required.`);
  }
  return v;
}

type ParentAttrs = {
  familyId: string;
  baseId: string;
  materialId: string | null;
  indexId: string | null;
  colorId: string | null;
};

async function loadParentAttrs(ids: ParentAttrs) {
  const [family, base, material, indexRow, color] = await Promise.all([
    prisma.lensFamily.findUnique({ where: { id: ids.familyId } }),
    prisma.lensBase.findUnique({ where: { id: ids.baseId } }),
    ids.materialId
      ? prisma.lensMaterial.findUnique({ where: { id: ids.materialId } })
      : Promise.resolve(null),
    ids.indexId
      ? prisma.lensIndex.findUnique({ where: { id: ids.indexId } })
      : Promise.resolve(null),
    ids.colorId
      ? prisma.lensColor.findUnique({ where: { id: ids.colorId } })
      : Promise.resolve(null),
  ]);

  await assertActiveFk("Family", ids.familyId, async () => family);
  await assertActiveFk("Base", ids.baseId, async () => base);
  await assertActiveFk("Material", ids.materialId, async () => material);
  await assertActiveFk("Index", ids.indexId, async () => indexRow);
  await assertActiveFk("Color", ids.colorId, async () => color);

  if (!family || !base) {
    throw new LensProductServiceError("Attribute not found.", 400, "INVALID_FK");
  }
  if (ids.materialId && !material) {
    throw new LensProductServiceError("Material not found.", 400, "INVALID_FK");
  }
  if (ids.indexId && !indexRow) {
    throw new LensProductServiceError("Index not found.", 400, "INVALID_FK");
  }
  if (ids.colorId && !color) {
    throw new LensProductServiceError("Color not found.", 400, "INVALID_FK");
  }
  if (ids.materialId) {
    await ensureBaseMaterialCompat(ids.baseId, ids.materialId);
  }

  const codeParts = {
    familyCode: family.code,
    baseCode: base.code,
    materialCode: material?.code ?? null,
    indexCode: indexRow?.code ?? null,
    colorCode: color?.code ?? null,
    /** CLIENT-PLAN name uses display color (e.g. Green), not SKU token GREEN. */
    colorLabel: color ? color.name?.trim() || color.code : null,
  };

  return { family, base, material, indexRow, color, codeParts };
}

async function findParentByAttrs(ids: ParentAttrs) {
  return prisma.lensProduct.findFirst({
    where: {
      familyId: ids.familyId,
      baseId: ids.baseId,
      materialId: ids.materialId,
      indexId: ids.indexId,
      colorId: ids.colorId,
    },
    include: parentInclude,
  });
}

export type CreateLensProductInput = {
  familyId: string;
  baseId: string;
  materialId?: string | null;
  indexId?: string | null;
  colorId?: string | null;
  /** One or more active power-range masters → variants */
  powerRangeIds: string[];
  defaultPrice?: number | null;
  isActive?: boolean;
  actorUserId: string;
};

export type PreviewVariant = {
  powerRangeId: string;
  skuCode: string;
  name: string;
  rangeLabel: string;
};

/** Preview SKU/name for attrs + selected ranges (no DB write). */
export async function previewLensProductVariants(input: {
  familyId: string;
  baseId: string;
  materialId?: string | null;
  indexId?: string | null;
  colorId?: string | null;
  powerRangeIds: string[];
}): Promise<{
  baseCode: string;
  existingParentId: string | null;
  variants: PreviewVariant[];
}> {
  const ids: ParentAttrs = {
    familyId: requireId("familyId", input.familyId),
    baseId: requireId("baseId", input.baseId),
    materialId: normalizeOptionalId(input.materialId),
    indexId: normalizeOptionalId(input.indexId),
    colorId: normalizeOptionalId(input.colorId),
  };
  const { codeParts } = await loadParentAttrs(ids);
  const baseCode = buildLensProductBaseCode(codeParts);
  const existing = await findParentByAttrs(ids);

  const rangeIds = [
    ...new Set(
      (input.powerRangeIds ?? [])
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (rangeIds.length === 0) {
    throw new LensProductServiceError(
      "Select at least one power range.",
      400,
      "POWER_RANGE_REQUIRED"
    );
  }

  const ranges = await prisma.lensPowerRange.findMany({
    where: { id: { in: rangeIds } },
  });
  if (ranges.length !== rangeIds.length) {
    throw new LensProductServiceError(
      "One or more power ranges were not found.",
      400,
      "INVALID_FK"
    );
  }

  const variants: PreviewVariant[] = [];
  for (const rangeId of rangeIds) {
    const pr = ranges.find((r) => r.id === rangeId)!;
    await assertActiveFk("Power range", pr.id, async () => pr);
    const bounds = {
      sphMin: Number(pr.sphMin),
      sphMax: Number(pr.sphMax),
      cylMin: Number(pr.cylMin),
      cylMax: Number(pr.cylMax),
    };
    variants.push({
      powerRangeId: pr.id,
      skuCode: buildLensProductSkuCode({ ...codeParts, ...bounds }),
      name: buildLensProductName({
        familyCode: codeParts.familyCode,
        baseCode: codeParts.baseCode,
        materialCode: codeParts.materialCode,
        indexCode: codeParts.indexCode,
        colorLabel: codeParts.colorLabel,
        ...bounds,
      }),
      rangeLabel: formatPowerRangeCompact(
        bounds.sphMin,
        bounds.sphMax,
        bounds.cylMin,
        bounds.cylMax
      ),
    });
  }

  return {
    baseCode,
    existingParentId: existing?.id ?? null,
    variants,
  };
}

async function createVariantsForParent(opts: {
  productId: string;
  codeParts: {
    familyCode: string;
    baseCode: string;
    materialCode?: string | null;
    indexCode?: string | null;
    colorCode?: string | null;
    colorLabel?: string | null;
  };
  powerRangeIds: string[];
  defaultPrice: number | null;
  isActive: boolean;
}) {
  const created = [];
  for (const rangeId of opts.powerRangeIds) {
    const pr = await prisma.lensPowerRange.findUnique({ where: { id: rangeId } });
    await assertActiveFk("Power range", rangeId, async () => pr);
    if (!pr) {
      throw new LensProductServiceError("Power range not found.", 400, "INVALID_FK");
    }

    const existing = await prisma.lensProductVariant.findUnique({
      where: {
        productId_powerRangeId: {
          productId: opts.productId,
          powerRangeId: rangeId,
        },
      },
    });
    if (existing) {
      throw new LensProductServiceError(
        `Variant for power range ${formatPowerRangeCompact(Number(pr.sphMin), Number(pr.sphMax), Number(pr.cylMin), Number(pr.cylMax))} already exists on this parent.`,
        409,
        "DUPLICATE_VARIANT",
        { variantId: existing.id, skuCode: existing.skuCode }
      );
    }

    const bounds = {
      sphMin: Number(pr.sphMin),
      sphMax: Number(pr.sphMax),
      cylMin: Number(pr.cylMin),
      cylMax: Number(pr.cylMax),
    };
    const skuCode = buildLensProductSkuCode({ ...opts.codeParts, ...bounds });
    const name = buildLensProductName({
      familyCode: opts.codeParts.familyCode,
      baseCode: opts.codeParts.baseCode,
      materialCode: opts.codeParts.materialCode,
      indexCode: opts.codeParts.indexCode,
      colorLabel:
        opts.codeParts.colorLabel ?? opts.codeParts.colorCode ?? null,
      ...bounds,
    });

    try {
      const row = await prisma.lensProductVariant.create({
        data: {
          productId: opts.productId,
          powerRangeId: rangeId,
          skuCode,
          name,
          sphMin: dec(bounds.sphMin),
          sphMax: dec(bounds.sphMax),
          cylMin: dec(bounds.cylMin),
          cylMax: dec(bounds.cylMax),
          defaultPrice:
            opts.defaultPrice != null && Number.isFinite(opts.defaultPrice)
              ? dec(opts.defaultPrice)
              : null,
          isActive: opts.isActive,
        },
        include: variantInclude,
      });
      created.push(serializeLensProductVariant(row));
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new LensProductServiceError(
          `SKU or name already exists (${skuCode}).`,
          409,
          "DUPLICATE_SKU"
        );
      }
      throw err;
    }
  }
  return created;
}

/**
 * Create parent + variants, or reuse existing parent and add ranges.
 */
export async function createLensProduct(input: CreateLensProductInput) {
  const ids: ParentAttrs = {
    familyId: requireId("familyId", input.familyId),
    baseId: requireId("baseId", input.baseId),
    materialId: normalizeOptionalId(input.materialId),
    indexId: normalizeOptionalId(input.indexId),
    colorId: normalizeOptionalId(input.colorId),
  };

  const rangeIds = [
    ...new Set(
      (input.powerRangeIds ?? [])
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (rangeIds.length === 0) {
    throw new LensProductServiceError(
      "Select at least one power range.",
      400,
      "POWER_RANGE_REQUIRED"
    );
  }

  const { codeParts } = await loadParentAttrs(ids);
  const baseCode = buildLensProductBaseCode(codeParts);
  const defaultPrice =
    input.defaultPrice != null && Number.isFinite(input.defaultPrice)
      ? input.defaultPrice
      : null;
  const isActive = input.isActive !== false;

  let parent = await findParentByAttrs(ids);
  let createdParent = false;

  if (!parent) {
    try {
      parent = await prisma.lensProduct.create({
        data: {
          baseCode,
          familyId: ids.familyId,
          baseId: ids.baseId,
          materialId: ids.materialId,
          indexId: ids.indexId,
          colorId: ids.colorId,
          isActive,
        },
        include: parentInclude,
      });
      createdParent = true;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        parent = await findParentByAttrs(ids);
        if (!parent) {
          throw new LensProductServiceError(
            "A parent with these attributes already exists.",
            409,
            "DUPLICATE_PARENT"
          );
        }
      } else {
        throw err;
      }
    }
  }

  const variants = await createVariantsForParent({
    productId: parent!.id,
    codeParts,
    powerRangeIds: rangeIds,
    defaultPrice,
    isActive,
  });

  await recordAuditEvent(prisma, {
    action: AuditAction.SETTINGS_UPDATED,
    module: AuditModule.INVENTORY,
    entityType: "LensProduct",
    entityId: parent!.id,
    actor: {
      actorType: "HUMAN",
      actorUserId: input.actorUserId,
      actorName: null,
    },
    context: {
      event: createdParent ? "LENS_PRODUCT_CREATED" : "LENS_PRODUCT_VARIANTS_ADDED",
      baseCode,
      powerRangeIds: rangeIds,
      variantSkus: variants.map((v) => v.skuCode),
    },
    activityMessage: createdParent
      ? `Lens product parent created: ${baseCode} (${variants.length} variant(s))`
      : `Added ${variants.length} variant(s) to ${baseCode}`,
  });

  const fresh = await prisma.lensProduct.findUniqueOrThrow({
    where: { id: parent!.id },
    include: parentInclude,
  });
  return serializeLensProduct(fresh);
}

export async function addLensProductVariants(input: {
  productId: string;
  powerRangeIds: string[];
  defaultPrice?: number | null;
  actorUserId: string;
}) {
  const parent = await prisma.lensProduct.findUnique({
    where: { id: input.productId },
    include: parentInclude,
  });
  if (!parent) {
    throw new LensProductServiceError("Product not found.", 404, "NOT_FOUND");
  }

  const ids: ParentAttrs = {
    familyId: parent.familyId,
    baseId: parent.baseId,
    materialId: parent.materialId,
    indexId: parent.indexId,
    colorId: parent.colorId,
  };
  const { codeParts } = await loadParentAttrs(ids);

  const rangeIds = [
    ...new Set(
      (input.powerRangeIds ?? [])
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (rangeIds.length === 0) {
    throw new LensProductServiceError(
      "Select at least one power range.",
      400,
      "POWER_RANGE_REQUIRED"
    );
  }

  const defaultPrice =
    input.defaultPrice != null && Number.isFinite(input.defaultPrice)
      ? input.defaultPrice
      : null;

  await createVariantsForParent({
    productId: parent.id,
    codeParts,
    powerRangeIds: rangeIds,
    defaultPrice,
    isActive: true,
  });

  await recordAuditEvent(prisma, {
    action: AuditAction.SETTINGS_UPDATED,
    module: AuditModule.INVENTORY,
    entityType: "LensProduct",
    entityId: parent.id,
    actor: {
      actorType: "HUMAN",
      actorUserId: input.actorUserId,
      actorName: null,
    },
    context: {
      event: "LENS_PRODUCT_VARIANTS_ADDED",
      powerRangeIds: rangeIds,
    },
    activityMessage: `Added power range(s) to ${parent.baseCode}`,
  });

  const fresh = await prisma.lensProduct.findUniqueOrThrow({
    where: { id: parent.id },
    include: parentInclude,
  });
  return serializeLensProduct(fresh);
}

export async function getLensProduct(id: string) {
  const row = await prisma.lensProduct.findUnique({
    where: { id },
    include: parentInclude,
  });
  if (!row) {
    throw new LensProductServiceError("Product not found.", 404, "NOT_FOUND");
  }
  return serializeLensProduct(row);
}

export async function getLensProductVariant(id: string) {
  const row = await prisma.lensProductVariant.findUnique({
    where: { id },
    include: variantInclude,
  });
  if (!row) {
    throw new LensProductServiceError("Variant not found.", 404, "NOT_FOUND");
  }
  return serializeLensProductVariant(row);
}

/** Flat list: one row per variant (default catalog view). */
export async function listLensProductVariants(params: {
  q?: string;
  familyId?: string;
  baseId?: string;
  materialId?: string;
  powerRangeId?: string;
  isActive?: boolean | null;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const where: Prisma.LensProductVariantWhereInput = {};

  if (params.powerRangeId) where.powerRangeId = params.powerRangeId;
  if (params.isActive === true || params.isActive === false) {
    where.isActive = params.isActive;
  }

  const productWhere: Prisma.LensProductWhereInput = {};
  if (params.familyId) productWhere.familyId = params.familyId;
  if (params.baseId) productWhere.baseId = params.baseId;
  if (params.materialId) productWhere.materialId = params.materialId;
  if (Object.keys(productWhere).length > 0) {
    where.product = productWhere;
  }

  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { skuCode: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { product: { family: { code: { contains: q, mode: "insensitive" } } } },
      { product: { base: { code: { contains: q, mode: "insensitive" } } } },
      { product: { material: { code: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.lensProductVariant.count({ where }),
    prisma.lensProductVariant.findMany({
      where,
      include: variantInclude,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: rows.map(serializeLensProductVariant),
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

/** Grouped list: parents + nested variants (UI expands rows per CLIENT-PLAN / RC-04). */
export async function listLensProducts(params: {
  q?: string;
  familyId?: string;
  baseId?: string;
  materialId?: string;
  isActive?: boolean | null;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const where: Prisma.LensProductWhereInput = {};

  if (params.familyId) where.familyId = params.familyId;
  if (params.baseId) where.baseId = params.baseId;
  if (params.materialId) where.materialId = params.materialId;
  if (params.isActive === true || params.isActive === false) {
    where.isActive = params.isActive;
  }
  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { baseCode: { contains: q, mode: "insensitive" } },
      { family: { code: { contains: q, mode: "insensitive" } } },
      { base: { code: { contains: q, mode: "insensitive" } } },
      { material: { code: { contains: q, mode: "insensitive" } } },
      { variants: { some: { skuCode: { contains: q, mode: "insensitive" } } } },
      { variants: { some: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.lensProduct.count({ where }),
    prisma.lensProduct.findMany({
      where,
      include: parentInclude,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: rows.map(serializeLensProduct),
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

export type UpdateLensProductVariantInput = {
  id: string;
  defaultPrice?: number | null;
  isActive?: boolean;
  actorUserId: string;
};

export async function updateLensProductVariant(
  input: UpdateLensProductVariantInput
) {
  const existing = await prisma.lensProductVariant.findUnique({
    where: { id: input.id },
  });
  if (!existing) {
    throw new LensProductServiceError("Variant not found.", 404, "NOT_FOUND");
  }

  const data: Prisma.LensProductVariantUpdateInput = {};
  if (input.defaultPrice !== undefined) {
    data.defaultPrice =
      input.defaultPrice != null && Number.isFinite(input.defaultPrice)
        ? dec(input.defaultPrice)
        : null;
  }
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const row = await prisma.lensProductVariant.update({
    where: { id: input.id },
    data,
    include: variantInclude,
  });

  await recordAuditEvent(prisma, {
    action: AuditAction.SETTINGS_UPDATED,
    module: AuditModule.INVENTORY,
    entityType: "LensProductVariant",
    entityId: row.id,
    actor: {
      actorType: "HUMAN",
      actorUserId: input.actorUserId,
      actorName: null,
    },
    context: { event: "LENS_PRODUCT_VARIANT_UPDATED", skuCode: row.skuCode },
    activityMessage: `Lens variant updated: ${row.skuCode}`,
  });

  return serializeLensProductVariant(row);
}
