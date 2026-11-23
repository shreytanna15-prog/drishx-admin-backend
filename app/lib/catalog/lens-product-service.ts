/**
 * RC-04 LensProduct parent + LensProductVariant.
 * Parent = attribute combo (+ optional diameter); variants = range × axis × ADD × eye SKUs.
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

/** Bases that must carry a coating on the parent (client rule: BRC). */
export function baseRequiresCoating(baseCode: string | null | undefined): boolean {
  return (baseCode ?? "").trim().toUpperCase() === "BRC";
}

function assertCoatingForBase(
  baseCode: string,
  coatingId: string | null
): void {
  if (baseRequiresCoating(baseCode) && !coatingId) {
    throw new LensProductServiceError(
      "Coating is required when base is BRC.",
      400,
      "COATING_REQUIRED"
    );
  }
}

const parentInclude = {
  family: true,
  base: true,
  material: true,
  index: true,
  color: true,
  coating: true,
  diameter: true,
  progressiveType: true,
  variants: {
    include: {
      powerRange: true,
      axisRef: true,
      addition: true,
    },
    orderBy: [{ updatedAt: "desc" as const }],
  },
} satisfies Prisma.LensProductInclude;

const variantInclude = {
  powerRange: true,
  axisRef: true,
  addition: true,
  product: {
    include: {
      family: true,
      base: true,
      material: true,
      index: true,
      color: true,
      coating: true,
      diameter: true,
      progressiveType: true,
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

/** Optional form/API money → always a finite non-negative number (blank → 0). */
function normalizeMoney(
  value: number | null | undefined,
  field: "purchasePrice" | "sellingPrice"
): number {
  if (value == null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) {
    throw new LensProductServiceError(
      `${field} must be zero or positive.`,
      400,
      "INVALID_PRICE"
    );
  }
  return n;
}

function attrRef(row: { id: string; code: string; name: string }) {
  return { id: row.id, code: row.code, name: row.name };
}

function serializeFamily(row: {
  id: string;
  code: string;
  name: string;
  supportsAxis: boolean;
  supportsAdd: boolean;
  supportsEye: boolean;
  supportsProgressiveType: boolean;
}) {
  return {
    ...attrRef(row),
    supportsAxis: row.supportsAxis,
    supportsAdd: row.supportsAdd,
    supportsEye: row.supportsEye,
    supportsProgressiveType: row.supportsProgressiveType,
  };
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

function nestedProductAttrs(row: ParentRow) {
  return {
    id: row.id,
    baseCode: row.baseCode,
    familyId: row.familyId,
    baseId: row.baseId,
    materialId: row.materialId,
    indexId: row.indexId,
    colorId: row.colorId,
    coatingId: row.coatingId,
    diameterId: row.diameterId,
    progressiveTypeId: row.progressiveTypeId,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    family: row.family,
    base: row.base,
    material: row.material,
    index: row.index,
    color: row.color,
    coating: row.coating,
    diameter: row.diameter,
    progressiveType: row.progressiveType,
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
    axisId: row.axisId,
    additionId: row.additionId,
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
    purchasePrice: Number(row.purchasePrice),
    sellingPrice: Number(row.sellingPrice),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    powerRange: serializePowerRange(row.powerRange),
    rangeLabel: formatPowerRangeCompact(sphMin, sphMax, cylMin, cylMax),
    rangeSummary: formatPowerRangeCompact(sphMin, sphMax, cylMin, cylMax),
    axisRef: row.axisRef
      ? { ...attrRef(row.axisRef), value: row.axisRef.value }
      : null,
    addition: row.addition
      ? { ...attrRef(row.addition), value: num(row.addition.value) }
      : null,
    product: {
      id: p.id,
      baseCode: p.baseCode,
      familyId: p.familyId,
      baseId: p.baseId,
      materialId: p.materialId,
      indexId: p.indexId,
      colorId: p.colorId,
      coatingId: p.coatingId,
      diameterId: p.diameterId,
      progressiveTypeId: p.progressiveTypeId,
      family: serializeFamily(p.family),
      base: attrRef(p.base),
      material: p.material ? attrRef(p.material) : null,
      index: p.index
        ? {
            ...attrRef(p.index),
            value: num(p.index.value),
          }
        : null,
      color: p.color ? attrRef(p.color) : null,
      coating: p.coating ? attrRef(p.coating) : null,
      diameter: p.diameter ? attrRef(p.diameter) : null,
      progressiveType: p.progressiveType ? attrRef(p.progressiveType) : null,
      attributeSummary: [
        p.family.code,
        p.progressiveType?.code,
        p.base.code,
        p.material?.code,
        p.index?.code,
        p.color?.code,
        p.coating?.code,
        p.diameter?.code,
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
    coatingId: row.coatingId,
    diameterId: row.diameterId,
    progressiveTypeId: row.progressiveTypeId,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    family: serializeFamily(row.family),
    base: attrRef(row.base),
    material: row.material ? attrRef(row.material) : null,
    index: row.index
      ? { ...attrRef(row.index), value: num(row.index.value) }
      : null,
    color: row.color ? attrRef(row.color) : null,
    coating: row.coating ? attrRef(row.coating) : null,
    diameter: row.diameter ? attrRef(row.diameter) : null,
    progressiveType: row.progressiveType
      ? attrRef(row.progressiveType)
      : null,
    attributeSummary: [
      row.family.code,
      row.progressiveType?.code,
      row.base.code,
      row.material?.code,
      row.index?.code,
      row.color?.code,
      row.coating?.code,
      row.diameter?.code,
    ]
      .filter(Boolean)
      .join(" · "),
    variantCount: row.variants.length,
    variants: row.variants.map((v) =>
      serializeLensProductVariant({
        ...v,
        product: nestedProductAttrs(row),
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

function uniqueIds(raw: string[] | undefined): string[] {
  return [
    ...new Set(
      (raw ?? [])
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ];
}

type ParentAttrs = {
  familyId: string;
  baseId: string;
  materialId: string | null;
  indexId: string | null;
  colorId: string | null;
  coatingId: string | null;
  diameterId: string | null;
  progressiveTypeId: string | null;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

type CodeParts = {
  familyCode: string;
  baseCode: string;
  materialCode?: string | null;
  indexCode?: string | null;
  colorCode?: string | null;
  colorLabel?: string | null;
  coatingCode?: string | null;
  coatingLabel?: string | null;
  diameterCode?: string | null;
  progressiveTypeCode?: string | null;
};

async function loadParentAttrs(ids: ParentAttrs) {
  const [family, base, material, indexRow, color, coating, diameter, progressiveType] =
    await Promise.all([
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
      ids.coatingId
        ? prisma.lensCoating.findUnique({ where: { id: ids.coatingId } })
        : Promise.resolve(null),
      ids.diameterId
        ? prisma.lensDiameter.findUnique({ where: { id: ids.diameterId } })
        : Promise.resolve(null),
      ids.progressiveTypeId
        ? prisma.lensProgressiveType.findUnique({
            where: { id: ids.progressiveTypeId },
          })
        : Promise.resolve(null),
    ]);

  await assertActiveFk("Family", ids.familyId, async () => family);
  await assertActiveFk("Base", ids.baseId, async () => base);
  await assertActiveFk("Material", ids.materialId, async () => material);
  await assertActiveFk("Index", ids.indexId, async () => indexRow);
  await assertActiveFk("Color", ids.colorId, async () => color);
  await assertActiveFk("Coating", ids.coatingId, async () => coating);
  await assertActiveFk("Diameter", ids.diameterId, async () => diameter);
  await assertActiveFk(
    "Progressive type",
    ids.progressiveTypeId,
    async () => progressiveType
  );

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
  if (ids.coatingId && !coating) {
    throw new LensProductServiceError("Coating not found.", 400, "INVALID_FK");
  }
  if (ids.diameterId && !diameter) {
    throw new LensProductServiceError("Diameter not found.", 400, "INVALID_FK");
  }
  if (ids.progressiveTypeId && !progressiveType) {
    throw new LensProductServiceError(
      "Progressive type not found.",
      400,
      "INVALID_FK"
    );
  }
  if (ids.materialId) {
    await ensureBaseMaterialCompat(ids.baseId, ids.materialId);
  }

  const codeParts: CodeParts = {
    familyCode: family.code,
    baseCode: base.code,
    materialCode: material?.code ?? null,
    indexCode: indexRow?.code ?? null,
    colorCode: color?.code ?? null,
    colorLabel: color ? color.name?.trim() || color.code : null,
    coatingCode: coating?.code ?? null,
    coatingLabel: coating ? coating.name?.trim() || coating.code : null,
    diameterCode: diameter?.code ?? null,
    progressiveTypeCode: progressiveType?.code ?? null,
  };

  return {
    family,
    base,
    material,
    indexRow,
    color,
    coating,
    diameter,
    progressiveType,
    codeParts,
  };
}

function resolveProgressiveTypeIdForFamily(
  family: { code: string; supportsProgressiveType: boolean },
  progressiveTypeId: string | null
): string | null {
  if (!family.supportsProgressiveType) {
    if (progressiveTypeId) {
      throw new LensProductServiceError(
        `Family ${family.code} does not support progressive type.`,
        400,
        "PROGRESSIVE_TYPE_NOT_SUPPORTED"
      );
    }
    return null;
  }
  return progressiveTypeId;
}

async function findParentByAttrs(ids: ParentAttrs, client: DbClient = prisma) {
  return client.lensProduct.findFirst({
    where: {
      familyId: ids.familyId,
      baseId: ids.baseId,
      materialId: ids.materialId,
      indexId: ids.indexId,
      colorId: ids.colorId,
      coatingId: ids.coatingId,
      diameterId: ids.diameterId,
      progressiveTypeId: ids.progressiveTypeId,
    },
    include: parentInclude,
  });
}

function assertFamilyVariantInputs(
  family: { code: string; supportsAxis: boolean; supportsAdd: boolean },
  axisIds: string[],
  additionIds: string[]
) {
  if (axisIds.length > 0 && !family.supportsAxis) {
    throw new LensProductServiceError(
      `Family ${family.code} does not support axis variants.`,
      400,
      "AXIS_NOT_SUPPORTED"
    );
  }
  if (additionIds.length > 0 && !family.supportsAdd) {
    throw new LensProductServiceError(
      `Family ${family.code} does not support addition variants.`,
      400,
      "ADDITION_NOT_SUPPORTED"
    );
  }
}

function powerRangeAllowsAxis(cylMin: number, cylMax: number): boolean {
  return Math.max(Math.abs(cylMin), Math.abs(cylMax)) !== 0;
}

type AxisRow = { id: string; code: string; name: string; value: number };
type AdditionRow = {
  id: string;
  code: string;
  name: string;
  value: number;
};

async function loadAxisMasters(axisIds: string[]): Promise<AxisRow[]> {
  if (axisIds.length === 0) return [];
  const rows = await prisma.lensAxis.findMany({
    where: { id: { in: axisIds } },
  });
  if (rows.length !== axisIds.length) {
    throw new LensProductServiceError(
      "One or more axis values were not found.",
      400,
      "INVALID_FK"
    );
  }
  for (const id of axisIds) {
    const row = rows.find((r) => r.id === id);
    await assertActiveFk("Axis", id, async () => row ?? null);
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  return axisIds.map((id) => {
    const r = byId.get(id)!;
    return { id: r.id, code: r.code, name: r.name, value: r.value };
  });
}

async function loadAdditionMasters(additionIds: string[]): Promise<AdditionRow[]> {
  if (additionIds.length === 0) return [];
  const rows = await prisma.lensAddition.findMany({
    where: { id: { in: additionIds } },
  });
  if (rows.length !== additionIds.length) {
    throw new LensProductServiceError(
      "One or more addition values were not found.",
      400,
      "INVALID_FK"
    );
  }
  for (const id of additionIds) {
    const row = rows.find((r) => r.id === id);
    await assertActiveFk("Addition", id, async () => row ?? null);
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  return additionIds.map((id) => {
    const r = byId.get(id)!;
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      value: Number(r.value),
    };
  });
}

type PlannedVariant = {
  powerRangeId: string;
  axisId: string | null;
  axisLabel: string | null;
  axisValue: number | null;
  additionId: string | null;
  additionLabel: string | null;
  additionCode: string | null;
  addMin: number | null;
  addMax: number | null;
  eye: string | null;
  skuCode: string;
  name: string;
  rangeLabel: string;
  bounds: {
    sphMin: number;
    sphMax: number;
    cylMin: number;
    cylMax: number;
  };
};

function buildEyeSlots(supportsEye: boolean): (string | null)[] {
  return supportsEye ? ["LEFT", "RIGHT"] : [null];
}

function buildAdditionSlots(
  additions: AdditionRow[]
): Array<{
  id: string | null;
  code: string | null;
  name: string | null;
  value: number | null;
}> {
  if (additions.length === 0) {
    return [{ id: null, code: null, name: null, value: null }];
  }
  return additions.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    value: a.value,
  }));
}

function buildAxisSlotsForRange(
  allowsAxis: boolean,
  axes: AxisRow[]
): Array<{ id: string | null; value: number | null; label: string | null }> {
  if (!allowsAxis || axes.length === 0) {
    return [{ id: null, value: null, label: null }];
  }
  return axes.map((a) => ({
    id: a.id,
    value: a.value,
    label: a.name?.trim() || String(a.value),
  }));
}

function planVariants(opts: {
  codeParts: CodeParts;
  supportsEye: boolean;
  ranges: Array<{
    id: string;
    sphMin: Prisma.Decimal;
    sphMax: Prisma.Decimal;
    cylMin: Prisma.Decimal;
    cylMax: Prisma.Decimal;
  }>;
  rangeIds: string[];
  axes: AxisRow[];
  additions: AdditionRow[];
}): PlannedVariant[] {
  const eyeSlots = buildEyeSlots(opts.supportsEye);
  const additionSlots = buildAdditionSlots(opts.additions);
  const rangeById = new Map(opts.ranges.map((r) => [r.id, r]));
  const planned: PlannedVariant[] = [];

  for (const rangeId of opts.rangeIds) {
    const pr = rangeById.get(rangeId);
    if (!pr) continue;
    const bounds = {
      sphMin: Number(pr.sphMin),
      sphMax: Number(pr.sphMax),
      cylMin: Number(pr.cylMin),
      cylMax: Number(pr.cylMax),
    };
    const rangeLabel = formatPowerRangeCompact(
      bounds.sphMin,
      bounds.sphMax,
      bounds.cylMin,
      bounds.cylMax
    );
    const allowsAxis = powerRangeAllowsAxis(bounds.cylMin, bounds.cylMax);
    const axisSlots = buildAxisSlotsForRange(allowsAxis, opts.axes);

    for (const axisSlot of axisSlots) {
      for (const addSlot of additionSlots) {
        for (const eye of eyeSlots) {
          const eyeToken =
            eye === "LEFT" || eye === "RIGHT"
              ? (eye as "LEFT" | "RIGHT")
              : null;
          const skuCode = buildLensProductSkuCode({
            ...opts.codeParts,
            additionCode: addSlot.code,
            eye: eyeToken,
            axisValue: axisSlot.value,
            ...bounds,
          });
          const name = buildLensProductName({
            familyCode: opts.codeParts.familyCode,
            baseCode: opts.codeParts.baseCode,
            materialCode: opts.codeParts.materialCode,
            indexCode: opts.codeParts.indexCode,
            colorLabel:
              opts.codeParts.colorLabel ?? opts.codeParts.colorCode ?? null,
            coatingLabel: opts.codeParts.coatingLabel,
            axisValue: axisSlot.value,
            ...bounds,
          });
          const addVal = addSlot.value;
          planned.push({
            powerRangeId: rangeId,
            axisId: axisSlot.id,
            axisLabel: axisSlot.label,
            axisValue: axisSlot.value,
            additionId: addSlot.id,
            additionLabel: addSlot.name,
            additionCode: addSlot.code,
            addMin: addVal,
            addMax: addVal,
            eye,
            skuCode,
            name,
            rangeLabel,
            bounds,
          });
        }
      }
    }
  }

  return planned;
}

export type CreateLensProductInput = {
  familyId: string;
  baseId: string;
  materialId?: string | null;
  indexId?: string | null;
  colorId?: string | null;
  /** Optional parent attr — included in uniqueness / SKU / name when set. */
  coatingId?: string | null;
  diameterId?: string | null;
  /** V2 only — optional; blank stays null. */
  progressiveTypeId?: string | null;
  /** One or more active power-range masters → variant cartesian */
  powerRangeIds: string[];
  axisIds?: string[];
  additionIds?: string[];
  /** Optional — blank/null → 0 on each new variant */
  purchasePrice?: number | null;
  /** Optional — blank/null → 0 on each new variant */
  sellingPrice?: number | null;
  isActive?: boolean;
  actorUserId: string;
};

export type PreviewVariant = {
  powerRangeId: string;
  axisId: string | null;
  axisLabel: string | null;
  additionId: string | null;
  additionLabel: string | null;
  eye: string | null;
  skuCode: string;
  name: string;
  rangeLabel: string;
};

type VariantExpansionInput = {
  familyId: string;
  baseId: string;
  materialId?: string | null;
  indexId?: string | null;
  colorId?: string | null;
  coatingId?: string | null;
  diameterId?: string | null;
  progressiveTypeId?: string | null;
  powerRangeIds: string[];
  axisIds?: string[];
  additionIds?: string[];
};

async function resolveVariantExpansion(input: VariantExpansionInput) {
  const familyId = requireId("familyId", input.familyId);
  const familyRow = await prisma.lensFamily.findUnique({
    where: { id: familyId },
  });
  if (!familyRow) {
    throw new LensProductServiceError("Family not found.", 400, "INVALID_FK");
  }
  await assertActiveFk("Family", familyId, async () => familyRow);

  const progressiveTypeId = resolveProgressiveTypeIdForFamily(
    familyRow,
    normalizeOptionalId(input.progressiveTypeId)
  );

  const ids: ParentAttrs = {
    familyId,
    baseId: requireId("baseId", input.baseId),
    materialId: normalizeOptionalId(input.materialId),
    indexId: normalizeOptionalId(input.indexId),
    colorId: normalizeOptionalId(input.colorId),
    coatingId: normalizeOptionalId(input.coatingId),
    diameterId: normalizeOptionalId(input.diameterId),
    progressiveTypeId,
  };

  const rangeIds = uniqueIds(input.powerRangeIds);
  if (rangeIds.length === 0) {
    throw new LensProductServiceError(
      "Select at least one power range.",
      400,
      "POWER_RANGE_REQUIRED"
    );
  }

  const axisIds = uniqueIds(input.axisIds);
  const additionIds = uniqueIds(input.additionIds);

  const { family, codeParts } = await loadParentAttrs(ids);
  assertCoatingForBase(codeParts.baseCode, ids.coatingId);
  assertFamilyVariantInputs(family, axisIds, additionIds);

  const [ranges, axes, additions] = await Promise.all([
    prisma.lensPowerRange.findMany({ where: { id: { in: rangeIds } } }),
    loadAxisMasters(axisIds),
    loadAdditionMasters(additionIds),
  ]);

  if (ranges.length !== rangeIds.length) {
    throw new LensProductServiceError(
      "One or more power ranges were not found.",
      400,
      "INVALID_FK"
    );
  }
  for (const pr of ranges) {
    await assertActiveFk("Power range", pr.id, async () => pr);
  }

  const baseCode = buildLensProductBaseCode({
    familyCode: codeParts.familyCode,
    baseCode: codeParts.baseCode,
    materialCode: codeParts.materialCode,
    indexCode: codeParts.indexCode,
    colorCode: codeParts.colorCode,
    coatingCode: codeParts.coatingCode,
    progressiveTypeCode: codeParts.progressiveTypeCode,
    diameterCode: codeParts.diameterCode,
  });

  const variants = planVariants({
    codeParts,
    supportsEye: family.supportsEye,
    ranges,
    rangeIds,
    axes,
    additions,
  });

  return { ids, codeParts, baseCode, variants, rangeIds, family };
}

/** Preview SKU/name for attrs + selected ranges (no DB write). */
export async function previewLensProductVariants(
  input: VariantExpansionInput
): Promise<{
  baseCode: string;
  existingParentId: string | null;
  variants: PreviewVariant[];
}> {
  const { ids, baseCode, variants } = await resolveVariantExpansion(input);
  const existing = await findParentByAttrs(ids);

  return {
    baseCode,
    existingParentId: existing?.id ?? null,
    variants: variants.map((v) => ({
      powerRangeId: v.powerRangeId,
      axisId: v.axisId,
      axisLabel: v.axisLabel,
      additionId: v.additionId,
      additionLabel: v.additionLabel,
      eye: v.eye,
      skuCode: v.skuCode,
      name: v.name,
      rangeLabel: v.rangeLabel,
    })),
  };
}

function variantIdentityKey(row: {
  powerRangeId: string;
  axisId: string | null;
  additionId: string | null;
  eye: string | null;
}): string {
  return [
    row.powerRangeId,
    row.axisId ?? "",
    row.additionId ?? "",
    row.eye ?? "",
  ].join("|");
}

function buildVariantCreateData(
  opts: {
    productId: string;
    purchasePrice: number;
    sellingPrice: number;
    isActive: boolean;
  },
  plan: PlannedVariant
): Prisma.LensProductVariantCreateManyInput {
  return {
    productId: opts.productId,
    powerRangeId: plan.powerRangeId,
    axisId: plan.axisId,
    additionId: plan.additionId,
    skuCode: plan.skuCode,
    name: plan.name,
    sphMin: dec(plan.bounds.sphMin),
    sphMax: dec(plan.bounds.sphMax),
    cylMin: dec(plan.bounds.cylMin),
    cylMax: dec(plan.bounds.cylMax),
    addMin:
      plan.addMin != null && Number.isFinite(plan.addMin)
        ? dec(plan.addMin)
        : null,
    addMax:
      plan.addMax != null && Number.isFinite(plan.addMax)
        ? dec(plan.addMax)
        : null,
    axis: plan.axisValue,
    eye: plan.eye,
    purchasePrice: dec(opts.purchasePrice),
    sellingPrice: dec(opts.sellingPrice),
    isActive: opts.isActive,
  };
}

async function createVariantsForParent(opts: {
  tx: Prisma.TransactionClient;
  productId: string;
  planned: PlannedVariant[];
  purchasePrice: number;
  sellingPrice: number;
  isActive: boolean;
}): Promise<{
  createdSkus: string[];
  skipped: Array<{ id: string; skuCode: string }>;
}> {
  const variantSelect = {
    id: true,
    skuCode: true,
    productId: true,
    powerRangeId: true,
    axisId: true,
    additionId: true,
    eye: true,
  } satisfies Prisma.LensProductVariantSelect;

  const existing = await opts.tx.lensProductVariant.findMany({
    where: { productId: opts.productId },
    select: variantSelect,
  });
  const existingByIdentity = new Map(
    existing.map((row) => [variantIdentityKey(row), row])
  );

  const skipped: Array<{ id: string; skuCode: string }> = [];
  const missing: PlannedVariant[] = [];
  const plannedSeen = new Set<string>();

  for (const plan of opts.planned) {
    const key = variantIdentityKey(plan);
    if (plannedSeen.has(key)) continue;
    plannedSeen.add(key);
    const hit = existingByIdentity.get(key);
    if (hit) {
      skipped.push({ id: hit.id, skuCode: hit.skuCode });
    } else {
      missing.push(plan);
    }
  }

  if (missing.length === 0) {
    return { createdSkus: [], skipped };
  }

  const createdRows = await opts.tx.lensProductVariant.createManyAndReturn({
    data: missing.map((plan) => buildVariantCreateData(opts, plan)),
    skipDuplicates: true,
    select: { id: true, skuCode: true },
  });
  const createdSkus = createdRows.map((row) => row.skuCode);
  const createdSet = new Set(createdSkus);
  const notCreated = missing.filter((plan) => !createdSet.has(plan.skuCode));

  if (notCreated.length > 0) {
    const conflicts = await opts.tx.lensProductVariant.findMany({
      where: { skuCode: { in: notCreated.map((plan) => plan.skuCode) } },
      select: variantSelect,
    });
    const conflictsBySku = new Map(conflicts.map((row) => [row.skuCode, row]));

    const refreshed = await opts.tx.lensProductVariant.findMany({
      where: { productId: opts.productId },
      select: variantSelect,
    });
    const refreshedByIdentity = new Map(
      refreshed.map((row) => [variantIdentityKey(row), row])
    );

    for (const plan of notCreated) {
      const same = refreshedByIdentity.get(variantIdentityKey(plan));
      if (same) {
        skipped.push({ id: same.id, skuCode: same.skuCode });
        continue;
      }
      const conflict = conflictsBySku.get(plan.skuCode);
      if (conflict) {
        throw new LensProductServiceError(
          `SKU ${plan.skuCode} is already used by another variant.`,
          409,
          "DUPLICATE_SKU",
          {
            skuCode: plan.skuCode,
            variantId: conflict.id,
            productId: conflict.productId,
          }
        );
      }
      throw new LensProductServiceError(
        `Could not create variant ${plan.skuCode}.`,
        500,
        "VARIANT_CREATE_FAILED"
      );
    }
  }

  return { createdSkus, skipped };
}

/**
 * Create parent + variants, or reuse existing parent and add ranges.
 */
export async function createLensProduct(input: CreateLensProductInput) {
  const { ids, baseCode, variants, rangeIds } = await resolveVariantExpansion(
    input
  );
  const purchasePrice = normalizeMoney(input.purchasePrice, "purchasePrice");
  const sellingPrice = normalizeMoney(input.sellingPrice, "sellingPrice");
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
          coatingId: ids.coatingId,
          diameterId: ids.diameterId,
          progressiveTypeId: ids.progressiveTypeId,
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

  if (!parent) {
    throw new LensProductServiceError(
      "Could not resolve product parent.",
      500,
      "PARENT_RESOLVE_FAILED"
    );
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const stillThere = await tx.lensProduct.findUnique({
          where: { id: parent.id },
          select: { id: true },
        });
        if (!stillThere) {
          throw new LensProductServiceError(
            "Product not found.",
            404,
            "NOT_FOUND"
          );
        }

        const variantResult = await createVariantsForParent({
          tx,
          productId: parent.id,
          planned: variants,
          purchasePrice,
          sellingPrice,
          isActive,
        });

        await recordAuditEvent(tx, {
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
            event: createdParent
              ? "LENS_PRODUCT_CREATED"
              : "LENS_PRODUCT_VARIANTS_ADDED",
            baseCode,
            powerRangeIds: rangeIds,
            createdVariantSkus: variantResult.createdSkus,
            skippedVariantSkus: variantResult.skipped.map((v) => v.skuCode),
            createdCount: variantResult.createdSkus.length,
            skippedCount: variantResult.skipped.length,
          },
          activityMessage: createdParent
            ? `Lens product parent created: ${baseCode} (${variantResult.createdSkus.length} variant(s))`
            : variantResult.createdSkus.length === 0
              ? `No new variants added to ${baseCode}; ${variantResult.skipped.length} already existed`
              : `Added ${variantResult.createdSkus.length} variant(s) to ${baseCode}${
                  variantResult.skipped.length > 0
                    ? `; ${variantResult.skipped.length} already existed`
                    : ""
                }`,
        });
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
  } catch (err) {
    if (createdParent) {
      await prisma.lensProduct
        .deleteMany({
          where: { id: parent.id, variants: { none: {} } },
        })
        .catch(() => undefined);
    }
    throw err;
  }

  const fresh = await prisma.lensProduct.findUniqueOrThrow({
    where: { id: parent.id },
    include: parentInclude,
  });
  return serializeLensProduct(fresh);
}

export async function addLensProductVariants(input: {
  productId: string;
  powerRangeIds: string[];
  axisIds?: string[];
  additionIds?: string[];
  purchasePrice?: number | null;
  sellingPrice?: number | null;
  actorUserId: string;
}) {
  const parent = await prisma.lensProduct.findUnique({
    where: { id: input.productId },
    include: parentInclude,
  });
  if (!parent) {
    throw new LensProductServiceError("Product not found.", 404, "NOT_FOUND");
  }

  const { variants, rangeIds } = await resolveVariantExpansion({
    familyId: parent.familyId,
    baseId: parent.baseId,
    materialId: parent.materialId,
    indexId: parent.indexId,
    colorId: parent.colorId,
    coatingId: parent.coatingId,
    diameterId: parent.diameterId,
    progressiveTypeId: parent.progressiveTypeId,
    powerRangeIds: input.powerRangeIds,
    axisIds: input.axisIds,
    additionIds: input.additionIds,
  });

  const purchasePrice = normalizeMoney(input.purchasePrice, "purchasePrice");
  const sellingPrice = normalizeMoney(input.sellingPrice, "sellingPrice");

  await prisma.$transaction(
    async (tx) => {
      const variantResult = await createVariantsForParent({
        tx,
        productId: parent.id,
        planned: variants,
        purchasePrice,
        sellingPrice,
        isActive: true,
      });

      await recordAuditEvent(tx, {
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
          createdVariantSkus: variantResult.createdSkus,
          skippedVariantSkus: variantResult.skipped.map((v) => v.skuCode),
          createdCount: variantResult.createdSkus.length,
          skippedCount: variantResult.skipped.length,
        },
        activityMessage:
          variantResult.createdSkus.length === 0
            ? `No new variants added to ${parent.baseCode}; ${variantResult.skipped.length} already existed`
            : `Added ${variantResult.createdSkus.length} variant(s) to ${parent.baseCode}${
                variantResult.skipped.length > 0
                  ? `; ${variantResult.skipped.length} already existed`
                  : ""
              }`,
      });
    },
    { maxWait: 10_000, timeout: 30_000 }
  );

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
  coatingId?: string;
  powerRangeId?: string;
  isActive?: boolean | null;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  /** Admin flat catalog may request up to 500 so Progressive / multi-axis sets are not truncated. */
  const limit = Math.min(500, Math.max(1, params.limit ?? 20));
  const where: Prisma.LensProductVariantWhereInput = {};

  if (params.powerRangeId) where.powerRangeId = params.powerRangeId;
  if (params.isActive === true || params.isActive === false) {
    where.isActive = params.isActive;
  }

  const productWhere: Prisma.LensProductWhereInput = {};
  if (params.familyId) productWhere.familyId = params.familyId;
  if (params.baseId) productWhere.baseId = params.baseId;
  if (params.materialId) productWhere.materialId = params.materialId;
  if (params.coatingId) productWhere.coatingId = params.coatingId;
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
      { product: { coating: { code: { contains: q, mode: "insensitive" } } } },
      { product: { coating: { name: { contains: q, mode: "insensitive" } } } },
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
  coatingId?: string;
  isActive?: boolean | null;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(500, Math.max(1, params.limit ?? 20));
  const where: Prisma.LensProductWhereInput = {};

  if (params.familyId) where.familyId = params.familyId;
  if (params.baseId) where.baseId = params.baseId;
  if (params.materialId) where.materialId = params.materialId;
  if (params.coatingId) where.coatingId = params.coatingId;
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
      { coating: { code: { contains: q, mode: "insensitive" } } },
      { coating: { name: { contains: q, mode: "insensitive" } } },
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

export type UpdateLensProductParentInput = {
  productId: string;
  /** Set or clear coating. Required when base is BRC. */
  coatingId: string | null;
  actorUserId: string;
};

async function assertParentAttrsEditable(productId: string) {
  const variants = await prisma.lensProductVariant.findMany({
    where: { productId },
    select: { id: true, skuCode: true },
  });
  const skus = variants.map((v) => v.skuCode).filter(Boolean);
  const variantIds = variants.map((v) => v.id);
  if (variantIds.length === 0) return;

  const [invoiceHit, purchaseHit, stockHit] = await Promise.all([
    skus.length === 0
      ? Promise.resolve(null)
      : prisma.invoiceLine.findFirst({
          where: { sku: { in: skus } },
          select: { id: true },
        }),
    skus.length === 0
      ? Promise.resolve(null)
      : prisma.purchaseBillLine.findFirst({
          where: { sku: { in: skus } },
          select: { id: true },
        }),
    prisma.lensProductPower.findFirst({
      where: {
        lensProductVariantId: { in: variantIds },
        OR: [{ quantity: { gt: 0 } }, { blockedQty: { gt: 0 } }],
      },
      select: { id: true },
    }),
  ]);

  if (invoiceHit || purchaseHit || stockHit) {
    throw new LensProductServiceError(
      "Parent attributes are locked because variants have stock or appear on invoices / purchase bills. Create a new product instead.",
      409,
      "ATTR_LOCKED"
    );
  }
}

/**
 * Update parent coating (identity). Regenerates baseCode + every variant SKU/name.
 * Locked once any sibling SKU appears on an invoice or purchase bill.
 */
export async function updateLensProductParent(
  input: UpdateLensProductParentInput
) {
  const parent = await prisma.lensProduct.findUnique({
    where: { id: input.productId },
    include: parentInclude,
  });
  if (!parent) {
    throw new LensProductServiceError("Product not found.", 404, "NOT_FOUND");
  }

  await assertParentAttrsEditable(parent.id);

  const nextCoatingId = normalizeOptionalId(input.coatingId);
  assertCoatingForBase(parent.base.code, nextCoatingId);

  if ((parent.coatingId ?? null) === nextCoatingId) {
    return serializeLensProduct(parent);
  }

  const ids: ParentAttrs = {
    familyId: parent.familyId,
    baseId: parent.baseId,
    materialId: parent.materialId,
    indexId: parent.indexId,
    colorId: parent.colorId,
    coatingId: nextCoatingId,
    diameterId: parent.diameterId,
    progressiveTypeId: parent.progressiveTypeId,
  };

  const conflict = await findParentByAttrs(ids);
  if (conflict && conflict.id !== parent.id) {
    throw new LensProductServiceError(
      "A parent with these attributes already exists.",
      409,
      "DUPLICATE_PARENT"
    );
  }

  const { codeParts } = await loadParentAttrs(ids);
  const baseCode = buildLensProductBaseCode({
    familyCode: codeParts.familyCode,
    baseCode: codeParts.baseCode,
    materialCode: codeParts.materialCode,
    indexCode: codeParts.indexCode,
    colorCode: codeParts.colorCode,
    coatingCode: codeParts.coatingCode,
    progressiveTypeCode: codeParts.progressiveTypeCode,
    diameterCode: codeParts.diameterCode,
  });

  const variantUpdates = parent.variants.map((v) => {
    const bounds = {
      sphMin: Number(v.sphMin),
      sphMax: Number(v.sphMax),
      cylMin: Number(v.cylMin),
      cylMax: Number(v.cylMax),
    };
    const eyeToken =
      v.eye === "LEFT" || v.eye === "RIGHT"
        ? (v.eye as "LEFT" | "RIGHT")
        : null;
    const skuCode = buildLensProductSkuCode({
      ...codeParts,
      additionCode: v.addition?.code ?? null,
      eye: eyeToken,
      axisValue: v.axis,
      ...bounds,
    });
    const name = buildLensProductName({
      familyCode: codeParts.familyCode,
      baseCode: codeParts.baseCode,
      materialCode: codeParts.materialCode,
      indexCode: codeParts.indexCode,
      colorLabel: codeParts.colorLabel ?? codeParts.colorCode ?? null,
      coatingLabel: codeParts.coatingLabel,
      axisValue: v.axis,
      ...bounds,
    });
    return { id: v.id, skuCode, name, previousSku: v.skuCode };
  });

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.lensProduct.update({
          where: { id: parent.id },
          data: {
            coatingId: nextCoatingId,
            baseCode,
          },
        });
        for (const u of variantUpdates) {
          await tx.lensProductVariant.update({
            where: { id: u.id },
            data: { skuCode: u.skuCode, name: u.name },
          });
        }
        await recordAuditEvent(tx, {
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
            event: "LENS_PRODUCT_PARENT_UPDATED",
            field: "coatingId",
            previousCoatingId: parent.coatingId,
            coatingId: nextCoatingId,
            baseCode,
            variantSkuChanges: variantUpdates.map((u) => ({
              id: u.id,
              from: u.previousSku,
              to: u.skuCode,
            })),
          },
          activityMessage: `Lens product coating updated: ${baseCode}`,
        });
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new LensProductServiceError(
        "SKU or parent code collision while updating coating.",
        409,
        "SKU_COLLISION"
      );
    }
    throw err;
  }

  const fresh = await prisma.lensProduct.findUniqueOrThrow({
    where: { id: parent.id },
    include: parentInclude,
  });
  return serializeLensProduct(fresh);
}

export type UpdateLensProductVariantInput = {
  id: string;
  purchasePrice?: number | null;
  sellingPrice?: number | null;
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
  if (input.purchasePrice !== undefined) {
    data.purchasePrice = dec(
      normalizeMoney(input.purchasePrice, "purchasePrice")
    );
  }
  if (input.sellingPrice !== undefined) {
    data.sellingPrice = dec(normalizeMoney(input.sellingPrice, "sellingPrice"));
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
