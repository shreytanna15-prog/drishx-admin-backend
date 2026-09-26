import {
  LensType,
  OrderStatus,
  ProcurementPriority,
  ProcurementRequestSource,
  ProcurementRequestStatus,
} from "@prisma/client";
import { prisma } from "./prisma";
import {
  AuditAction,
  AuditModule,
  systemActor,
  type AuditActor,
  type AuditRequestContext,
} from "./audit";
import { recordAuditEvent } from "./audit";
import {
  calculateRequiredQuantity,
  deriveReorderPriority,
  orderLensIdField,
} from "./procurement-rules";
import { readLensDescriptor, type DbClient, type LensDescriptor } from "./procurement-lens";

export { calculateRequiredQuantity, deriveReorderPriority };

/**
 * Statuses that still count as "we owe someone stock".
 * Used for the `incoming` figure and for duplicate suppression.
 */
export const OPEN_REQUEST_STATUSES: readonly ProcurementRequestStatus[] = [
  ProcurementRequestStatus.OPEN,
  ProcurementRequestStatus.UNDER_REVIEW,
  ProcurementRequestStatus.APPROVED,
] as const;

/** Order statuses that hold stock (mirrors ACTIVE_RESERVATION_STATUSES in order-inventory.ts). */
const RESERVING_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PICKING,
  OrderStatus.PACKED,
  OrderStatus.DISPATCHED,
  OrderStatus.PARTIALLY_FULFILLED,
  OrderStatus.AWAITING_PROCUREMENT,
] as const;

export type StockPosition = {
  onHand: number;
  /** Units held for open orders (reserved but not yet picked). */
  committed: number;
  /** Sellable on-hand minus reserved. This — not onHand — drives thresholds. */
  available: number;
  /** Units already requested on unresolved procurement requests. */
  incoming: number;
};

/**
 * Units already requested but not yet received, for one SKU.
 * This is the "incoming stock" of procurement PDF §6 — derived, never stored,
 * so it can never drift out of sync with the open requests.
 */
export async function getIncomingQuantity(
  client: DbClient,
  lensType: LensType,
  lensId: string
): Promise<number> {
  const rows = await client.procurementRequest.findMany({
    where: { lensType, lensId, status: { in: [...OPEN_REQUEST_STATUSES] } },
    select: { requestedQuantity: true, receivedQuantity: true },
  });

  return rows.reduce(
    (sum, row) => sum + Math.max(0, row.requestedQuantity - row.receivedQuantity),
    0
  );
}

/** Reserved-but-not-picked units for one SKU, client-aware. */
export async function getCommittedQuantity(
  client: DbClient,
  lensType: LensType,
  lensId: string
): Promise<number> {
  const field = orderLensIdField(lensType);
  const orders = await client.order.findMany({
    where: {
      lensType,
      [field]: lensId,
      status: { in: [...RESERVING_ORDER_STATUSES] },
    },
    select: { reservedQuantity: true, pickedQuantity: true },
  });

  return orders.reduce(
    (sum, row) => sum + Math.max(0, row.reservedQuantity - row.pickedQuantity),
    0
  );
}

/**
 * Full stock position for a SKU. Available excludes reserved units and, by
 * construction, non-sellable/damaged stock (procurement PDF §5).
 */
export async function getStockPosition(
  client: DbClient,
  lensType: LensType,
  lensId: string
): Promise<StockPosition> {
  const lens = await readLensDescriptor(client, lensType, lensId);
  const onHand = lens?.quantity ?? 0;
  const committed = await getCommittedQuantity(client, lensType, lensId);
  const incoming = await getIncomingQuantity(client, lensType, lensId);

  return {
    onHand,
    committed,
    available: Math.max(0, onHand - committed),
    incoming,
  };
}

export type ReorderCheckResult =
  | { outcome: "created"; request: ProcurementRequestRecord }
  | { outcome: "suppressed_existing"; request: ProcurementRequestRecord; reason: string }
  | { outcome: "not_needed"; reason: string };

type ProcurementRequestRecord = {
  id: string;
  publicId: string;
  lensType: LensType;
  lensId: string;
  source: ProcurementRequestSource;
  status: ProcurementRequestStatus;
  priority: ProcurementPriority;
  requiredQuantity: number;
  requestedQuantity: number;
  receivedQuantity: number;
  orderId: string | null;
  triggerReason: string | null;
  createdAt: Date;
};

export type RunReorderCheckInput = {
  lensType: LensType;
  lensId: string;
  actor?: AuditActor;
  request?: AuditRequestContext | null;
  client?: DbClient;
};

/**
 * The single choke point that decides whether a SKU needs replenishing.
 *
 * Safety properties (procurement PDF §7, §28, §29):
 *  - only fires for rules with `autoProcure = true` and `isActive = true`
 *  - never creates a second request while an existing one still covers the gap
 *  - records the trigger snapshot (stock/min/target/available/incoming)
 *  - creates a REQUEST only. No purchase order, no supplier order, no money.
 */
export async function runReorderCheck(
  input: RunReorderCheckInput
): Promise<ReorderCheckResult> {
  const db = input.client ?? prisma;

  const rule = await db.reorderRule.findUnique({
    where: {
      lensType_lensId: { lensType: input.lensType, lensId: input.lensId },
    },
  });

  if (!rule) return { outcome: "not_needed", reason: "No reorder rule configured." };
  if (!rule.isActive) return { outcome: "not_needed", reason: "Reorder rule is inactive." };
  if (!rule.autoProcure) {
    return { outcome: "not_needed", reason: "Auto procurement is off for this SKU." };
  }

  const position = await getStockPosition(db, input.lensType, input.lensId);

  if (position.available > rule.minStock) {
    return {
      outcome: "not_needed",
      reason: `Available ${position.available} is above minimum ${rule.minStock}.`,
    };
  }

  const required = calculateRequiredQuantity({
    available: position.available,
    targetStock: rule.targetStock,
    incoming: position.incoming,
    moq: rule.moq,
  });

  if (required <= 0) {
    return {
      outcome: "not_needed",
      reason: `Incoming ${position.incoming} already covers the target of ${rule.targetStock}.`,
    };
  }

  // ── Duplicate suppression (PDF §7) ──────────────────────────────────────
  // An unresolved request for this SKU means someone already decided to buy.
  // Only raise another one if what is already on order is genuinely short of
  // the target — never a fresh independent request for the same shortage.
  const existing = await db.procurementRequest.findMany({
    where: {
      lensType: input.lensType,
      lensId: input.lensId,
      status: { in: [...OPEN_REQUEST_STATUSES] },
    },
    orderBy: { createdAt: "asc" },
  });

  const outstanding = existing.reduce(
    (sum, row) => sum + Math.max(0, row.requestedQuantity - row.receivedQuantity),
    0
  );
  const coveredTotal = position.available + position.incoming + outstanding;

  if (existing.length > 0 && coveredTotal >= rule.targetStock) {
    return {
      outcome: "suppressed_existing",
      request: existing[0],
      reason: `${existing.length} open request(s) already cover this SKU (${outstanding} units outstanding, ${coveredTotal}/${rule.targetStock} covered).`,
    };
  }

  const lens = await readLensDescriptor(db, input.lensType, input.lensId);
  const priority = deriveReorderPriority(position.available, rule.minStock);
  const triggerReason = [
    "MINIMUM_STOCK_THRESHOLD",
    `Available ${position.available} <= minimum ${rule.minStock}`,
    `Target ${rule.targetStock}, incoming ${position.incoming}`,
    `Required ${required}${rule.moq ? ` (raised to MOQ ${rule.moq})` : ""}`,
    outstanding > 0 ? `Existing outstanding ${outstanding} was insufficient` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const created = await db.procurementRequest.create({
    data: {
      publicId: await nextProcurementRequestPublicId(db),
      lensType: input.lensType,
      lensId: input.lensId,
      source: ProcurementRequestSource.MINIMUM_STOCK_THRESHOLD,
      status: ProcurementRequestStatus.OPEN,
      priority,
      requiredQuantity: required,
      requestedQuantity: required,
      stockAtTrigger: position.onHand,
      availableAtTrigger: position.available,
      incomingAtTrigger: position.incoming,
      minStockAtTrigger: rule.minStock,
      targetStockAtTrigger: rule.targetStock,
      triggerReason,
      reorderRuleId: rule.id,
      createdById: input.actor && "actorUserId" in input.actor && input.actor.actorUserId
        ? input.actor.actorUserId
        : null,
    },
  });

  await recordAuditEvent(db, {
    action: AuditAction.PROCUREMENT_REQUEST_AUTO_TRIGGERED,
    module: AuditModule.INVENTORY,
    entityType: "ProcurementRequest",
    entityId: created.id,
    actor: input.actor ?? systemActor(),
    request: input.request ?? null,
    context: {
      publicId: created.publicId,
      lensType: input.lensType,
      available: String(position.available),
      minStock: String(rule.minStock),
      targetStock: String(rule.targetStock),
      required: String(required),
    },
    activityMessage: `Auto reorder ${created.publicId} — ${lens ? lens.brand ?? input.lensId : input.lensId} (+${required})`,
  });

  return { outcome: "created", request: created };
}

/** Run the checker across every auto-enabled rule. Used by the nightly cron. */
export async function runReorderCheckAll(input?: {
  actor?: AuditActor;
  request?: AuditRequestContext | null;
  client?: DbClient;
}): Promise<{
  scanned: number;
  created: number;
  suppressed: number;
  notNeeded: number;
  results: Array<{ lensType: LensType; lensId: string; outcome: ReorderCheckResult["outcome"]; publicId?: string }>;
}> {
  const db = input?.client ?? prisma;

  const rules = await db.reorderRule.findMany({
    where: { autoProcure: true, isActive: true },
    select: { lensType: true, lensId: true },
  });

  const results: Array<{
    lensType: LensType;
    lensId: string;
    outcome: ReorderCheckResult["outcome"];
    publicId?: string;
  }> = [];
  let created = 0;
  let suppressed = 0;
  let notNeeded = 0;

  for (const rule of rules) {
    const outcome = await runReorderCheck({
      lensType: rule.lensType,
      lensId: rule.lensId,
      actor: input?.actor,
      request: input?.request,
      client: db,
    });
    if (outcome.outcome === "created") {
      created += 1;
      results.push({
        lensType: rule.lensType,
        lensId: rule.lensId,
        outcome: "created",
        publicId: outcome.request.publicId,
      });
    } else if (outcome.outcome === "suppressed_existing") {
      suppressed += 1;
      results.push({
        lensType: rule.lensType,
        lensId: rule.lensId,
        outcome: "suppressed_existing",
        publicId: outcome.request.publicId,
      });
    } else {
      notNeeded += 1;
      results.push({ lensType: rule.lensType, lensId: rule.lensId, outcome: "not_needed" });
    }
  }

  return { scanned: rules.length, created, suppressed, notNeeded, results };
}

export type CreateManualRequestInput = {
  lensType: LensType;
  lensId: string;
  quantity: number;
  priority?: ProcurementPriority;
  orderId?: string | null;
  reason?: string | null;
  actorUserId?: string | null;
  request?: AuditRequestContext | null;
  client?: DbClient;
};

/** Manual procurement requirement (procurement PDF §2.3). */
export async function createManualProcurementRequest(
  input: CreateManualRequestInput
): Promise<ProcurementRequestRecord> {
  const db = input.client ?? prisma;

  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("quantity must be a whole number greater than 0.");
  }
  const lens = await readLensDescriptor(db, input.lensType, input.lensId);
  if (!lens) throw new Error("Lens not found.");

  const position = await getStockPosition(db, input.lensType, input.lensId);
  const created = await db.procurementRequest.create({
    data: {
      publicId: await nextProcurementRequestPublicId(db),
      lensType: input.lensType,
      lensId: input.lensId,
      source: ProcurementRequestSource.MANUAL,
      status: ProcurementRequestStatus.OPEN,
      priority: input.priority ?? ProcurementPriority.NORMAL,
      requiredQuantity: input.quantity,
      requestedQuantity: input.quantity,
      stockAtTrigger: position.onHand,
      availableAtTrigger: position.available,
      incomingAtTrigger: position.incoming,
      triggerReason: input.reason?.trim() || "Manually raised by staff",
      orderId: input.orderId ?? null,
      createdById: input.actorUserId ?? null,
    },
  });

  await recordAuditEvent(db, {
    action: AuditAction.PROCUREMENT_REQUEST_CREATED,
    module: AuditModule.INVENTORY,
    entityType: "ProcurementRequest",
    entityId: created.id,
    actor: input.actorUserId
      ? { actorType: "HUMAN", actorUserId: input.actorUserId, actorName: null }
      : systemActor(),
    request: input.request ?? null,
    context: { publicId: created.publicId, quantity: String(input.quantity), source: "MANUAL" },
    activityMessage: `Manual procurement request ${created.publicId} (+${input.quantity})`,
  });

  return created;
}

const APPROVABLE: readonly ProcurementRequestStatus[] = [
  ProcurementRequestStatus.OPEN,
  ProcurementRequestStatus.UNDER_REVIEW,
] as const;

export async function approveProcurementRequest(input: {
  id: string;
  actorUserId: string;
  request?: AuditRequestContext | null;
  client?: DbClient;
}) {
  const db = input.client ?? prisma;
  const existing = await db.procurementRequest.findUnique({ where: { id: input.id } });
  if (!existing) throw new Error("Procurement request not found.");
  if (!APPROVABLE.includes(existing.status)) {
    throw new Error(`Cannot approve a request with status ${existing.status}.`);
  }

  const updated = await db.procurementRequest.update({
    where: { id: input.id },
    data: {
      status: ProcurementRequestStatus.APPROVED,
      approvedAt: new Date(),
      approvedById: input.actorUserId,
    },
  });

  await recordAuditEvent(db, {
    action: AuditAction.PROCUREMENT_REQUEST_APPROVED,
    module: AuditModule.INVENTORY,
    entityType: "ProcurementRequest",
    entityId: updated.id,
    actor: { actorType: "HUMAN", actorUserId: input.actorUserId, actorName: null },
    request: input.request ?? null,
    context: { publicId: updated.publicId, quantity: String(updated.requestedQuantity) },
    activityMessage: `Procurement request ${updated.publicId} approved`,
  });

  return updated;
}

const CANCELLABLE: readonly ProcurementRequestStatus[] = [
  ProcurementRequestStatus.OPEN,
  ProcurementRequestStatus.UNDER_REVIEW,
  ProcurementRequestStatus.APPROVED,
] as const;

export async function cancelProcurementRequest(input: {
  id: string;
  reason?: string | null;
  actorUserId: string;
  request?: AuditRequestContext | null;
  client?: DbClient;
}) {
  const db = input.client ?? prisma;
  const existing = await db.procurementRequest.findUnique({ where: { id: input.id } });
  if (!existing) throw new Error("Procurement request not found.");
  if (!CANCELLABLE.includes(existing.status)) {
    throw new Error(`Cannot cancel a request with status ${existing.status}.`);
  }

  const reason = input.reason?.trim() || "Cancelled by admin";
  const updated = await db.procurementRequest.update({
    where: { id: input.id },
    data: {
      status: ProcurementRequestStatus.CANCELLED,
      resolvedAt: new Date(),
      resolutionReason: reason,
    },
  });

  await recordAuditEvent(db, {
    action: AuditAction.PROCUREMENT_REQUEST_CANCELLED,
    module: AuditModule.INVENTORY,
    entityType: "ProcurementRequest",
    entityId: updated.id,
    actor: { actorType: "HUMAN", actorUserId: input.actorUserId, actorName: null },
    request: input.request ?? null,
    reasonText: reason,
    context: { publicId: updated.publicId },
    activityMessage: `Procurement request ${updated.publicId} cancelled — ${reason}`,
  });

  return updated;
}

/**
 * Apply received stock against unresolved requests for a SKU, oldest first.
 * A request is RESOLVED once it has received everything it asked for.
 * Procurement history is never deleted — only status advances.
 */
export async function recordProcurementReceipt(input: {
  lensType: LensType;
  lensId: string;
  quantity: number;
  orderId?: string | null;
  actorUserId?: string | null;
  request?: AuditRequestContext | null;
  client?: DbClient;
}): Promise<Array<{ id: string; publicId: string; receivedQuantity: number; resolved: boolean }>> {
  const db = input.client ?? prisma;
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return [];

  const open = await db.procurementRequest.findMany({
    where: {
      lensType: input.lensType,
      lensId: input.lensId,
      status: { in: [...OPEN_REQUEST_STATUSES] },
      ...(input.orderId ? { orderId: input.orderId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  let remaining = Math.trunc(input.quantity);
  const affected: Array<{
    id: string;
    publicId: string;
    receivedQuantity: number;
    resolved: boolean;
  }> = [];

  for (const req of open) {
    if (remaining <= 0) break;
    const outstanding = Math.max(0, req.requestedQuantity - req.receivedQuantity);
    if (outstanding <= 0) continue;

    const applied = Math.min(outstanding, remaining);
    remaining -= applied;
    const newReceived = req.receivedQuantity + applied;
    const resolved = newReceived >= req.requestedQuantity;

    const updated = await db.procurementRequest.update({
      where: { id: req.id },
      data: {
        receivedQuantity: newReceived,
        ...(resolved
          ? {
              status: ProcurementRequestStatus.RESOLVED,
              resolvedAt: new Date(),
              resolutionReason: "Fully received",
            }
          : {}),
      },
    });

    await recordAuditEvent(db, {
      action: resolved
        ? AuditAction.PROCUREMENT_REQUEST_RESOLVED
        : AuditAction.PROCUREMENT_REQUEST_RECEIVED,
      module: AuditModule.INVENTORY,
      entityType: "ProcurementRequest",
      entityId: updated.id,
      actor: input.actorUserId
        ? { actorType: "HUMAN", actorUserId: input.actorUserId, actorName: null }
        : systemActor(),
      request: input.request ?? null,
      context: {
        publicId: updated.publicId,
        applied: String(applied),
        received: String(newReceived),
        requested: String(updated.requestedQuantity),
      },
      activityMessage: resolved
        ? `Procurement request ${updated.publicId} fully received (${newReceived})`
        : `Procurement request ${updated.publicId} partially received (+${applied} → ${newReceived}/${updated.requestedQuantity})`,
    });

    affected.push({
      id: updated.id,
      publicId: updated.publicId,
      receivedQuantity: newReceived,
      resolved,
    });
  }

  return affected;
}

/** Sequential public reference, e.g. PR-000125. Reuses InvoiceSequence for atomicity. */
export async function nextProcurementRequestPublicId(
  client: DbClient = prisma
): Promise<string> {
  const financialYear = `${new Date().getFullYear()}`;
  const seqId = `PR:${financialYear}`;

  const seq = await client.$transaction(async (tx) => {
    const existing = await tx.invoiceSequence.findUnique({ where: { id: seqId } });
    if (!existing) {
      await tx.invoiceSequence.create({
        data: { id: seqId, financialYear, prefix: "PR", nextValue: 2 },
      });
      return 1;
    }
    const current = existing.nextValue;
    await tx.invoiceSequence.update({
      where: { id: seqId },
      data: { nextValue: current + 1 },
    });
    return current;
  });

  return `PR-${String(seq).padStart(6, "0")}`;
}

export type { LensDescriptor, ProcurementRequestRecord };
