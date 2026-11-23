import { LensType, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { type AuditActor, type AuditRequestContext } from "./audit";
import { orderLensIdField, type DbClient } from "./procurement-lens";
import { RESERVING_ORDER_STATUSES } from "./procurement-requests";
import { OPEN_PO_STATUSES_FOR_INCOMING, openPoLineOutstanding } from "./purchase-order-math";
import { recordReorderRuleChange } from "./reorder-rules";
import {
  buildProductMatrix,
  decodeProductKey,
  encodeProductKey,
  findRuleConflicts,
  type MatrixEdit,
  type MatrixLensRow,
  type MatrixProductKey,
  type MatrixRule,
  type ProductMatrix,
} from "./stock-matrix";

/**
 * Data access for the power-wise stock matrix (RW-08 Phase C).
 * Reads are batched per product (never one query per power) and the product
 * list is paginated, so ~800 ranges / tens of thousands of powers stay usable.
 * Saving only writes ReorderRule rows — lens stock quantities are never touched.
 */

export const MATRIX_LENS_TYPES = [
  LensType.SINGLE_VISION,
  LensType.KRYPTOK,
  LensType.PROGRESSIVE,
] as const;
export type MatrixLensType = (typeof MATRIX_LENS_TYPES)[number];

export function isMatrixLensType(value: unknown): value is MatrixLensType {
  return typeof value === "string" && (MATRIX_LENS_TYPES as readonly string[]).includes(value);
}

export class StockMatrixError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(message: string, status = 400, code = "MATRIX_ERROR", details?: Record<string, unknown>) {
    super(message);
    this.name = "StockMatrixError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Product-defining columns per lens family (power columns excluded). */
const GROUP_FIELDS: Record<MatrixLensType, readonly string[]> = {
  SINGLE_VISION: ["category", "brand", "item", "index", "coating"],
  KRYPTOK: ["category", "brand", "item", "coating"],
  PROGRESSIVE: ["category", "brand", "item", "index", "type", "coating"],
};

export type MatrixFilters = {
  category?: string | null;
  brand?: string | null;
  index?: string | null;
  coating?: string | null;
  search?: string | null;
};

type GroupRow = Record<string, unknown> & {
  _count: { _all: number };
  _sum: { quantity: number | null };
};

function lensWhere(lensType: MatrixLensType, filters: MatrixFilters) {
  const where: Record<string, unknown> = { isDisabled: false };
  if (filters.category) where.category = filters.category;
  if (filters.brand) where.brand = filters.brand;
  if (filters.coating) where.coating = filters.coating;
  if (filters.index && lensType !== LensType.KRYPTOK) {
    const idx = Number(filters.index);
    if (Number.isFinite(idx)) where.index = new Prisma.Decimal(idx);
  }
  const search = filters.search?.trim();
  if (search) {
    where.OR = ["brand", "item", "category", "coating"].map((field) => ({
      [field]: { contains: search, mode: "insensitive" },
    }));
  }
  return where;
}

function normalizeKeyValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (value instanceof Prisma.Decimal) return Number(value.toString());
  return String(value);
}

async function groupProducts(
  db: DbClient,
  lensType: MatrixLensType,
  where: Record<string, unknown>
): Promise<GroupRow[]> {
  const args = {
    by: GROUP_FIELDS[lensType],
    where,
    _count: { _all: true },
    _sum: { quantity: true },
  };
  // Prisma's groupBy generics cannot express a runtime-chosen `by`; the
  // field lists above are validated against the schema by the queries below.
  switch (lensType) {
    case LensType.SINGLE_VISION:
      return (await db.singleVisionLens.groupBy(args as never)) as unknown as GroupRow[];
    case LensType.KRYPTOK:
      return (await db.kryptokLens.groupBy(args as never)) as unknown as GroupRow[];
    default:
      return (await db.progressiveLens.groupBy(args as never)) as unknown as GroupRow[];
  }
}

function productKeyOf(lensType: MatrixLensType, row: Record<string, unknown>): MatrixProductKey {
  const key: MatrixProductKey = { lensType };
  for (const field of GROUP_FIELDS[lensType]) key[field] = normalizeKeyValue(row[field]);
  return key;
}

export function productTitle(key: MatrixProductKey): { title: string; subtitle: string } {
  const title = [key.brand, key.item].filter((v) => v !== null && v !== "").join(" · ") || "Lens";
  const subtitleParts = [
    key.category,
    key.index !== null && key.index !== undefined ? `Index ${Number(key.index).toFixed(2)}` : null,
    key.type,
    key.coating,
  ].filter((v) => v !== null && v !== undefined && v !== "");
  return { title, subtitle: subtitleParts.join(" · ") };
}

function keyWhere(lensType: MatrixLensType, key: MatrixProductKey) {
  const where: Record<string, unknown> = { isDisabled: false };
  for (const field of GROUP_FIELDS[lensType]) {
    const value = key[field];
    if (value === undefined) {
      throw new StockMatrixError("Invalid product reference.", 400, "MATRIX_KEY_INVALID");
    }
    where[field] =
      field === "index" && value !== null ? new Prisma.Decimal(Number(value)) : value;
  }
  return where;
}

export type MatrixProductSummary = {
  key: string;
  title: string;
  subtitle: string;
  leaves: number;
  onHand: number;
  withRule: number;
  belowThreshold: number;
};

export async function listMatrixProducts(input: {
  lensType: MatrixLensType;
  filters: MatrixFilters;
  page: number;
  pageSize: number;
  client?: DbClient;
}): Promise<{ products: MatrixProductSummary[]; total: number; page: number; pageSize: number }> {
  const db = input.client ?? prisma;
  const pageSize = Math.min(Math.max(Math.trunc(input.pageSize) || 20, 5), 50);
  const groups = await groupProducts(db, input.lensType, lensWhere(input.lensType, input.filters));
  const keyed = groups
    .map((g) => {
      const key = productKeyOf(input.lensType, g);
      const { title, subtitle } = productTitle(key);
      return { key, title, subtitle, leaves: g._count._all, onHand: g._sum.quantity ?? 0 };
    })
    .sort(
      (a, b) =>
        a.title.localeCompare(b.title, undefined, { numeric: true }) ||
        a.subtitle.localeCompare(b.subtitle, undefined, { numeric: true })
    );
  const total = keyed.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.trunc(input.page) || 1, 1), pages);
  const slice = keyed.slice((page - 1) * pageSize, page * pageSize);

  // Rule coverage + below-threshold counts for this page only (batched).
  const matrices: MatrixLensRow[][] = [];
  // One matrix loads several relations in parallel. Avoid issuing 20 such
  // batches at once against the small Supabase transaction pool.
  for (let i = 0; i < slice.length; i += 2) {
    matrices.push(
      ...(await Promise.all(
        slice.slice(i, i + 2).map((p) => loadMatrixRows(db, input.lensType, p.key))
      ))
    );
  }
  const products = slice.map((p, i) => {
    const matrix = buildProductMatrix(matrices[i]!);
    return {
      key: encodeProductKey(p.key),
      title: p.title,
      subtitle: p.subtitle,
      leaves: p.leaves,
      onHand: p.onHand,
      withRule: matrix.totals.withRule,
      belowThreshold: matrix.totals.belowThreshold,
    };
  });
  return { products, total, page, pageSize };
}

type RawLens = {
  id: string;
  quantity: number;
  sph: Prisma.Decimal | null;
  sphStartRange: Prisma.Decimal | null;
  cyl: Prisma.Decimal | null;
  cylStartRange: Prisma.Decimal | null;
  crossPower?: Prisma.Decimal | null;
  add?: Prisma.Decimal | null;
  axis?: number | null;
  eye?: string | null;
};

const num = (v: Prisma.Decimal | null | undefined) =>
  v === null || v === undefined ? null : Number(v.toString());

async function readProductLenses(
  db: DbClient,
  lensType: MatrixLensType,
  key: MatrixProductKey
): Promise<RawLens[]> {
  const where = keyWhere(lensType, key);
  const base = {
    id: true,
    quantity: true,
    sph: true,
    sphStartRange: true,
    cyl: true,
    cylStartRange: true,
  } as const;
  const take = 2000;
  switch (lensType) {
    case LensType.SINGLE_VISION:
      return db.singleVisionLens.findMany({
        where: where as Prisma.SingleVisionLensWhereInput,
        select: { ...base, crossPower: true },
        take,
      });
    case LensType.KRYPTOK:
      return db.kryptokLens.findMany({
        where: where as Prisma.KryptokLensWhereInput,
        select: { ...base, crossPower: true, add: true, axis: true },
        take,
      });
    default:
      return db.progressiveLens.findMany({
        where: where as Prisma.ProgressiveLensWhereInput,
        select: { ...base, add: true, axis: true, eye: true },
        take,
      });
  }
}

async function loadMatrixRows(
  db: DbClient,
  lensType: MatrixLensType,
  key: MatrixProductKey
): Promise<MatrixLensRow[]> {
  const lenses = await readProductLenses(db, lensType, key);
  if (!lenses.length) return [];
  const ids = lenses.map((l) => l.id);
  const field = orderLensIdField(lensType);

  const [rules, orders, poLines, locks] = await Promise.all([
    db.reorderRule.findMany({
      where: { lensType, lensId: { in: ids } },
      select: {
        id: true,
        lensId: true,
        minStock: true,
        targetStock: true,
        autoProcure: true,
        isActive: true,
        updatedAt: true,
      },
    }),
    db.order.findMany({
      where: {
        lensType,
        [field]: { in: ids },
        status: { in: [...RESERVING_ORDER_STATUSES] },
      },
      select: {
        singleVisionLensId: true,
        kryptokLensId: true,
        progressiveLensId: true,
        reservedQuantity: true,
        pickedQuantity: true,
      },
    }),
    db.purchaseOrderLine.findMany({
      where: {
        lensType,
        lensId: { in: ids },
        purchaseOrder: { status: { in: [...OPEN_PO_STATUSES_FOR_INCOMING] } },
      },
      select: { lensId: true, poQuantity: true, receivedQuantity: true, cancelledQuantity: true },
    }),
    db.openPurchaseOrderPower.findMany({
      where: { lensType, lensId: { in: ids } },
      select: { lensId: true, purchaseOrder: { select: { id: true, publicId: true } } },
    }),
  ]);

  const ruleById = new Map(rules.map((r) => [r.lensId, r]));
  const reserved = new Map<string, number>();
  for (const order of orders) {
    const id = order[field as "singleVisionLensId" | "kryptokLensId" | "progressiveLensId"];
    if (!id) continue;
    reserved.set(id, (reserved.get(id) ?? 0) + Math.max(0, order.reservedQuantity - order.pickedQuantity));
  }
  const onOrder = new Map<string, number>();
  for (const line of poLines) {
    if (!line.lensId) continue;
    onOrder.set(line.lensId, (onOrder.get(line.lensId) ?? 0) + openPoLineOutstanding(line));
  }
  const lockById = new Map(locks.filter((l) => l.lensId).map((l) => [l.lensId!, l.purchaseOrder]));

  return lenses.map((lens) => {
    const rule = ruleById.get(lens.id);
    const matrixRule: MatrixRule | null = rule
      ? {
          id: rule.id,
          minStock: rule.minStock,
          targetStock: rule.targetStock,
          autoProcure: rule.autoProcure,
          isActive: rule.isActive,
          updatedAt: rule.updatedAt.toISOString(),
        }
      : null;
    return {
      lensId: lens.id,
      sph: num(lens.sph),
      sphStartRange: num(lens.sphStartRange),
      cyl: num(lens.cyl),
      cylStartRange: num(lens.cylStartRange),
      crossPower: num(lens.crossPower),
      add: num(lens.add),
      axis: lens.axis ?? null,
      eye: lens.eye ?? null,
      onHand: lens.quantity,
      reserved: reserved.get(lens.id) ?? 0,
      onOrder: onOrder.get(lens.id) ?? 0,
      openPurchaseOrder: lockById.get(lens.id) ?? null,
      rule: matrixRule,
    };
  });
}

export async function getProductMatrix(input: {
  lensType: MatrixLensType;
  key: string;
  client?: DbClient;
}): Promise<{ key: string; title: string; subtitle: string; matrix: ProductMatrix }> {
  const decoded = decodeProductKey(input.key);
  if (!decoded || decoded.lensType !== input.lensType) {
    throw new StockMatrixError("Invalid product reference.", 400, "MATRIX_KEY_INVALID");
  }
  const rows = await loadMatrixRows(input.client ?? prisma, input.lensType, decoded);
  if (!rows.length) {
    throw new StockMatrixError("This product has no active powers.", 404, "MATRIX_PRODUCT_NOT_FOUND");
  }
  const { title, subtitle } = productTitle(decoded);
  return { key: input.key, title, subtitle, matrix: buildProductMatrix(rows) };
}

export type MatrixFilterOptions = {
  categories: string[];
  brands: string[];
  indexes: string[];
  coatings: string[];
};

async function distinctOptions(
  db: DbClient,
  lensType: MatrixLensType,
  by: string[],
  where: Record<string, unknown>
): Promise<Array<Record<string, unknown>>> {
  const args = { by, where, _count: { _all: true } };
  switch (lensType) {
    case LensType.SINGLE_VISION:
      return (await db.singleVisionLens.groupBy(args as never)) as unknown as Array<Record<string, unknown>>;
    case LensType.KRYPTOK:
      return (await db.kryptokLens.groupBy(args as never)) as unknown as Array<Record<string, unknown>>;
    default:
      return (await db.progressiveLens.groupBy(args as never)) as unknown as Array<Record<string, unknown>>;
  }
}

function collectOptions(groups: Array<Record<string, unknown>>, field: string): string[] {
  return Array.from(
    new Set(
      groups
        .map((g) => normalizeKeyValue(g[field]))
        .filter((v): v is string | number => v !== null && v !== "")
        .map((v) => (field === "index" ? Number(v).toFixed(2) : String(v)))
    )
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Dropdown options; brands/indexes/coatings narrow to the chosen category. */
export async function getMatrixFilterOptions(
  lensType: MatrixLensType,
  category: string | null,
  client: DbClient = prisma
): Promise<MatrixFilterOptions> {
  const base = { isDisabled: false };
  const fields =
    lensType === LensType.KRYPTOK ? ["brand", "coating"] : ["brand", "coating", "index"];
  const [categoryGroups, detailGroups] = await Promise.all([
    distinctOptions(client, lensType, ["category"], base),
    distinctOptions(client, lensType, fields, category ? { ...base, category } : base),
  ]);
  return {
    categories: collectOptions(categoryGroups, "category"),
    brands: collectOptions(detailGroups, "brand"),
    indexes: lensType === LensType.KRYPTOK ? [] : collectOptions(detailGroups, "index"),
    coatings: collectOptions(detailGroups, "coating"),
  };
}

async function lensIdsExist(
  db: DbClient,
  lensType: MatrixLensType,
  ids: string[]
): Promise<Set<string>> {
  const where = { id: { in: ids } };
  const rows =
    lensType === LensType.SINGLE_VISION
      ? await db.singleVisionLens.findMany({ where, select: { id: true } })
      : lensType === LensType.KRYPTOK
        ? await db.kryptokLens.findMany({ where, select: { id: true } })
        : await db.progressiveLens.findMany({ where, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

/**
 * Persist threshold/target edits from the matrix.
 * - Atomic: all edits or none.
 * - Optimistic concurrency: an edit whose rule changed since load → 409.
 * - New rules are created active and included in Run Reorder; existing rules
 *   keep their reorder flag / supplier / MOQ.
 * - Never modifies physical stock.
 */
export async function saveMatrixRules(input: {
  lensType: MatrixLensType;
  edits: MatrixEdit[];
  actor: AuditActor;
  request?: AuditRequestContext | null;
}): Promise<{ saved: number; rules: Record<string, MatrixRule> }> {
  const ids = input.edits.map((e) => e.lensId);
  const existing = await lensIdsExist(prisma, input.lensType, ids);
  const missing = ids.filter((id) => !existing.has(id));
  if (missing.length) {
    throw new StockMatrixError(
      `${missing.length} power(s) no longer exist in the catalog. Reload the matrix.`,
      404,
      "MATRIX_LENS_NOT_FOUND",
      { lensIds: missing }
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.reorderRule.findMany({
        where: { lensType: input.lensType, lensId: { in: ids } },
      });
      const beforeById = new Map(before.map((r) => [r.lensId, r]));
      const conflicts = findRuleConflicts(
        input.edits,
        new Map(ids.map((id) => {
          const rule = beforeById.get(id);
          return [id, rule ? { updatedAt: rule.updatedAt.toISOString() } : null];
        }))
      );
      if (conflicts.length) {
        throw new StockMatrixError(
          "Some thresholds were changed by someone else since you opened this matrix. Reload to see the latest values.",
          409,
          "MATRIX_CONFLICT",
          { lensIds: conflicts }
        );
      }

      const saved: Record<string, MatrixRule> = {};
      for (const edit of input.edits) {
        const prev = beforeById.get(edit.lensId);
        let rule;
        if (prev) {
          // Compare-and-set on updatedAt closes the race between check and write.
          const result = await tx.reorderRule.updateMany({
            where: { id: prev.id, updatedAt: prev.updatedAt },
            data: {
              minStock: edit.minStock,
              targetStock: edit.targetStock,
              updatedById: input.actor.actorUserId ?? null,
            },
          });
          if (result.count !== 1) {
            throw new StockMatrixError(
              "A threshold changed while saving. Reload and try again.",
              409,
              "MATRIX_CONFLICT",
              { lensIds: [edit.lensId] }
            );
          }
          rule = await tx.reorderRule.findUniqueOrThrow({ where: { id: prev.id } });
        } else {
          rule = await tx.reorderRule.create({
            data: {
              lensType: input.lensType,
              lensId: edit.lensId,
              minStock: edit.minStock,
              targetStock: edit.targetStock,
              autoProcure: true,
              isActive: true,
              updatedById: input.actor.actorUserId ?? null,
            },
          });
        }
        await recordReorderRuleChange({
          before: prev
            ? {
                minStock: prev.minStock,
                targetStock: prev.targetStock,
                autoProcure: prev.autoProcure,
                preferredSupplierId: prev.preferredSupplierId,
                moq: prev.moq,
                isActive: prev.isActive,
              }
            : null,
          after: {
            minStock: rule.minStock,
            targetStock: rule.targetStock,
            autoProcure: rule.autoProcure,
            preferredSupplierId: rule.preferredSupplierId,
            moq: rule.moq,
            isActive: rule.isActive,
          },
          lensType: input.lensType,
          lensId: edit.lensId,
          lensLabel: "Stock matrix",
          actor: input.actor,
          request: input.request ?? null,
          client: tx,
        });
        saved[edit.lensId] = {
          id: rule.id,
          minStock: rule.minStock,
          targetStock: rule.targetStock,
          autoProcure: rule.autoProcure,
          isActive: rule.isActive,
          updatedAt: rule.updatedAt.toISOString(),
        };
      }
      return { saved: input.edits.length, rules: saved };
    }, { timeout: 60_000, maxWait: 10_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new StockMatrixError(
        "A threshold was created by someone else while saving. Reload and try again.",
        409,
        "MATRIX_CONFLICT"
      );
    }
    throw error;
  }
}
