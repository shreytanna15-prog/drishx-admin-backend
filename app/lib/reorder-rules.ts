import { LensType } from "@prisma/client";
import { prisma } from "./prisma";
import {
  AuditAction,
  AuditModule,
  type AuditActor,
  type AuditRequestContext,
} from "./audit";
import { diffFields, recordAuditEvent } from "./audit";
import { readLensDescriptor, type DbClient, type LensDescriptor } from "./procurement-lens";
import { getStockPosition, type StockPosition } from "./procurement-requests";
import {
  PROCUREMENT_LENS_TYPES,
  isAtOrBelowMinimum,
  validateReorderRule,
} from "./procurement-rules";

export { validateReorderRule, isAtOrBelowMinimum };

export type ReorderRuleInput = {
  lensType: LensType;
  lensId: string;
  minStock: number;
  targetStock: number;
  autoProcure?: boolean;
  preferredSupplierId?: string | null;
  moq?: number | null;
  isActive?: boolean;
};

function toOptionalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toOptionalInt(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

/** Create or update the rule for a SKU. */
export async function upsertReorderRule(
  input: ReorderRuleInput,
  client: DbClient = prisma
) {
  const error = validateReorderRule(input);
  if (error) throw new Error(error);

  return client.reorderRule.upsert({
    where: {
      lensType_lensId: { lensType: input.lensType, lensId: input.lensId },
    },
    create: {
      lensType: input.lensType,
      lensId: input.lensId,
      minStock: input.minStock,
      targetStock: input.targetStock,
      autoProcure: input.autoProcure ?? false,
      preferredSupplierId: toOptionalId(input.preferredSupplierId),
      moq: toOptionalInt(input.moq),
      isActive: input.isActive ?? true,
    },
    update: {
      minStock: input.minStock,
      targetStock: input.targetStock,
      ...(input.autoProcure === undefined ? {} : { autoProcure: input.autoProcure }),
      ...(input.preferredSupplierId === undefined
        ? {}
        : { preferredSupplierId: toOptionalId(input.preferredSupplierId) }),
      ...(input.moq === undefined ? {} : { moq: toOptionalInt(input.moq) }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    },
    include: { preferredSupplier: { select: { id: true, name: true } } },
  });
}

const AUDITED_FIELDS = [
  "minStock",
  "targetStock",
  "autoProcure",
  "preferredSupplierId",
  "moq",
  "isActive",
] as const;

/** Log every threshold change (procurement PDF §31 — threshold audit trail). */
export async function recordReorderRuleChange(input: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  lensType: LensType;
  lensId: string;
  lensLabel?: string | null;
  actor: AuditActor;
  request?: AuditRequestContext | null;
  client?: DbClient;
}) {
  const db = input.client ?? prisma;
  const label = input.lensLabel ? ` — ${input.lensLabel}` : "";

  await recordAuditEvent(db, {
    action: AuditAction.REORDER_RULE_CHANGED,
    module: AuditModule.INVENTORY,
    entityType: "ReorderRule",
    entityId: input.lensId,
    actor: input.actor,
    request: input.request ?? null,
    changes: diffFields(
      (input.before ?? {}) as Record<string, unknown>,
      input.after,
      [...AUDITED_FIELDS]
    ),
    context: { lensType: input.lensType, lensId: input.lensId },
    activityMessage: `Reorder rule updated${label}`,
  });
}

export type ReorderRuleRow = {
  id: string;
  lensType: LensType;
  lensId: string;
  minStock: number;
  targetStock: number;
  autoProcure: boolean;
  preferredSupplierId: string | null;
  preferredSupplier: { id: string; name: string } | null;
  moq: number | null;
  isActive: boolean;
  updatedAt: Date;
  lens: LensDescriptor | null;
  position: StockPosition;
  /** True when available stock is at or below the minimum threshold. */
  belowMin: boolean;
  /** True when an unresolved procurement request already exists for this SKU. */
  hasOpenRequest: boolean;
};

/**
 * Rules joined with live stock position. Ordered by brand then power so the
 * admin grid reads like a price sheet.
 */
export async function listReorderRules(opts?: {
  lensType?: LensType;
  onlyBelowMin?: boolean;
  client?: DbClient;
}): Promise<ReorderRuleRow[]> {
  const db = opts?.client ?? prisma;

  const rules = await db.reorderRule.findMany({
    where: {
      ...(opts?.lensType ? { lensType: opts.lensType } : {}),
    },
    include: { preferredSupplier: { select: { id: true, name: true } } },
    orderBy: [{ lensType: "asc" }, { createdAt: "asc" }],
  });

  const openRequests = await db.procurementRequest.groupBy({
    by: ["lensType", "lensId"],
    where: {
      lensType: rules.length
        ? { in: Array.from(new Set(rules.map((r) => r.lensType))) }
        : undefined,
      status: { in: ["OPEN", "UNDER_REVIEW", "APPROVED"] },
    },
    _count: { _all: true },
  });
  const openCountBySku = new Map(
    openRequests.map((row) => [`${row.lensType}:${row.lensId}`, row._count._all])
  );

  const rows: ReorderRuleRow[] = [];
  for (const rule of rules) {
    const lens = await readLensDescriptor(db, rule.lensType, rule.lensId);
    const position = await getStockPosition(db, rule.lensType, rule.lensId);
    const hasOpenRequest = (openCountBySku.get(`${rule.lensType}:${rule.lensId}`) ?? 0) > 0;
    const belowMin = isAtOrBelowMinimum(position.available, rule.minStock);

    if (opts?.onlyBelowMin && !belowMin) continue;

    rows.push({
      id: rule.id,
      lensType: rule.lensType,
      lensId: rule.lensId,
      minStock: rule.minStock,
      targetStock: rule.targetStock,
      autoProcure: rule.autoProcure,
      preferredSupplierId: rule.preferredSupplierId,
      preferredSupplier: rule.preferredSupplier,
      moq: rule.moq,
      isActive: rule.isActive,
      updatedAt: rule.updatedAt,
      lens,
      position,
      belowMin,
      hasOpenRequest,
    });
  }

  return rows;
}

/** SKUs that have stock but no rule yet — the "configure me" list for the grid. */
export async function listUnconfiguredSkus(opts?: {
  lensType?: LensType;
  search?: string;
  limit?: number;
  client?: DbClient;
}): Promise<
  Array<{ lensType: LensType; lensId: string; lens: LensDescriptor; position: StockPosition }>
> {
  const db = opts?.client ?? prisma;
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const search = opts?.search?.trim();

  const configured = await db.reorderRule.findMany({
    where: opts?.lensType ? { lensType: opts.lensType } : undefined,
    select: { lensType: true, lensId: true },
  });
  const configuredKeys = new Set(configured.map((r) => `${r.lensType}:${r.lensId}`));

  const out: Array<{
    lensType: LensType;
    lensId: string;
    lens: LensDescriptor;
    position: StockPosition;
  }> = [];

  for (const lensType of PROCUREMENT_LENS_TYPES) {
    if (opts?.lensType && lensType !== opts.lensType) continue;

    const rows = await readUnconfigured(db, lensType, search, limit * 3);

    for (const row of rows) {
      const key = `${lensType}:${row.id}`;
      if (configuredKeys.has(key)) continue;
      const lens = await readLensDescriptor(db, lensType, row.id);
      if (!lens) continue;
      const position = await getStockPosition(db, lensType, row.id);
      out.push({ lensType, lensId: row.id, lens, position });
      if (out.length >= limit) return out;
    }
  }

  return out;
}

async function readUnconfigured(
  db: DbClient,
  lensType: LensType,
  search: string | undefined,
  limit: number
): Promise<Array<{ id: string }>> {
  const where = {
    isDisabled: false,
    ...(search
      ? {
          OR: [
            { brand: { contains: search, mode: "insensitive" as const } },
            { item: { contains: search, mode: "insensitive" as const } },
            { coating: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  if (lensType === LensType.SINGLE_VISION) {
    return db.singleVisionLens.findMany({ where, select: { id: true }, take: limit * 3 });
  }
  if (lensType === LensType.KRYPTOK) {
    return db.kryptokLens.findMany({ where, select: { id: true }, take: limit * 3 });
  }
  return db.progressiveLens.findMany({ where, select: { id: true }, take: limit * 3 });
}
