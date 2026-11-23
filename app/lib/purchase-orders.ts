import {
  GoodsReceiptStatus,
  LensType,
  Prisma,
  ProcurementRequestStatus,
  PurchaseOrderStatus,
} from "@prisma/client";
import { prisma } from "./prisma";
import {
  AuditAction,
  AuditModule,
  systemActor,
  type AuditActor,
  type AuditRequestContext,
  recordAuditEvent,
} from "./audit";
import {
  formatLensPower,
  readLensDescriptor,
  type DbClient,
} from "./procurement-lens";
import { OPEN_REQUEST_STATUSES } from "./procurement-requests";
import {
  MAIN_WAREHOUSE_CODE,
  findDuplicatePowersInDraft,
  findDuplicateProcurementRequestIdsInDraft,
  isReceivablePoStatus,
  lineAmount,
  openPoLineOutstanding,
  planLineAllocations,
  powerKey,
} from "./purchase-order-math";
import { reverseLineAllocations } from "./purchase-order-allocations";
import {
  PO_DOCUMENT_STATUS_LABELS,
  type PurchaseOrderDocument,
  type PurchaseOrderDocumentParty,
} from "./purchase-order-document";
import { formatSupplierAddressLines } from "./purchase-order-supplier";
import {
  isPoSentChannel,
  PO_SENT_CHANNELS,
  type PoSentChannel,
} from "./purchase-order-sent";
import {
  assertDraftLineHasIdentity,
  CatalogPoResolveError,
  resolveDraftLineCatalogIdentity,
} from "./catalog/catalog-po-resolve";
import { formatCatalogPowerLabel, hasLegacyIdentity } from "./catalog/catalog-po-identity-core";

export {
  MAIN_WAREHOUSE_CODE,
  OPEN_PO_STATUSES_FOR_INCOMING,
  RECEIVABLE_PO_STATUSES,
} from "./purchase-order-math";

export class PurchaseOrderError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "PO_ERROR") {
    super(message);
    this.name = "PurchaseOrderError";
    this.status = status;
    this.code = code;
  }
}

export type DraftLineInput = {
  /** Legacy leaf — optional when catalog identity is provided. */
  lensType?: LensType | null;
  lensId?: string | null;
  /** Catalog leaf — preferred for new lines (S3). */
  lensProductPowerId?: string | null;
  lensProductVariantId?: string | null;
  sph?: number | null;
  cyl?: number | null;
  requiredQuantity: number;
  poQuantity: number;
  rate?: number | null;
  procurementRequestId?: string | null;
  productLabel?: string | null;
  rangeLabel?: string | null;
  powerLabel?: string | null;
};

/** Supplier fields shown on PO detail / documents. */
export const PO_SUPPLIER_SELECT = {
  id: true,
  name: true,
  tradeName: true,
  contactPerson: true,
  email: true,
  phone: true,
  alternatePhone: true,
  gstin: true,
  pan: true,
  address: true,
  city: true,
  state: true,
  stateCode: true,
  pincode: true,
  dispatchAddress: true,
  isActive: true,
} satisfies Prisma.SupplierSelect;

const poInclude = {
  supplier: { select: PO_SUPPLIER_SELECT },
  lines: {
    orderBy: { lineNumber: "asc" as const },
    include: {
      procurementRequest: {
        select: {
          id: true,
          publicId: true,
          requestedQuantity: true,
          orderedQuantity: true,
          status: true,
        },
      },
    },
  },
} satisfies Prisma.PurchaseOrderInclude;

export type PurchaseOrderDetail = Prisma.PurchaseOrderGetPayload<{
  include: typeof poInclude;
}>;

async function nextPurchaseOrderPublicId(): Promise<string> {
  const year = new Date().getFullYear();
  const seqId = `PO:${year}`;

  const seq = await prisma.$transaction(async (tx) => {
    const existing = await tx.invoiceSequence.findUnique({ where: { id: seqId } });
    if (!existing) {
      await tx.invoiceSequence.create({
        data: { id: seqId, financialYear: String(year), prefix: "PO", nextValue: 2 },
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

  return `PO-${year}-${String(seq).padStart(6, "0")}`;
}

/**
 * Take a row lock on the PO for the rest of the transaction. Every state
 * transition (approve, send, receive, cancel, close) serialises on this lock so
 * concurrent requests re-read committed state instead of racing.
 */
export async function lockPurchaseOrder(tx: DbClient, purchaseOrderId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${purchaseOrderId} FOR UPDATE`;
  if (!rows.length) {
    throw new PurchaseOrderError("Purchase order not found.", 404, "PO_NOT_FOUND");
  }
}

/** Run `fn` in the caller's transaction, or open one. */
async function inTransaction<T>(
  client: DbClient | undefined,
  fn: (tx: DbClient) => Promise<T>
): Promise<T> {
  if (client) return fn(client);
  return prisma.$transaction(async (tx) => fn(tx));
}

async function enrichLineLabels(
  client: DbClient,
  line: DraftLineInput
): Promise<DraftLineInput> {
  try {
    assertDraftLineHasIdentity(line, 0);
  } catch (err) {
    if (err instanceof CatalogPoResolveError) {
      throw new PurchaseOrderError(err.message, err.status, err.code);
    }
    throw err;
  }

  let catalog: Awaited<ReturnType<typeof resolveDraftLineCatalogIdentity>> = null;
  try {
    catalog = await resolveDraftLineCatalogIdentity(client, line);
  } catch (err) {
    if (err instanceof CatalogPoResolveError) {
      throw new PurchaseOrderError(err.message, err.status, err.code);
    }
    throw err;
  }

  if (catalog) {
    const legacyType = line.lensType ?? catalog.legacyLensType;
    const legacyId = line.lensId ?? catalog.legacyLensId;
    return {
      ...line,
      lensType: legacyType,
      lensId: legacyId,
      lensProductPowerId: catalog.lensProductPowerId,
      lensProductVariantId: catalog.lensProductVariantId,
      sph: catalog.sph,
      cyl: catalog.cyl,
      productLabel: line.productLabel ?? catalog.productLabel,
      rangeLabel: line.rangeLabel ?? catalog.rangeLabel,
      powerLabel: line.powerLabel ?? catalog.powerLabel,
    };
  }

  if (!hasLegacyIdentity(line) || !line.lensType || !line.lensId) {
    throw new PurchaseOrderError(
      "Provide lensProductPowerId, or variantId+sph+cyl, or legacy lensType+lensId.",
      400,
      "IDENTITY_REQUIRED"
    );
  }

  const lens = await readLensDescriptor(client, line.lensType, line.lensId);
  if (!lens) {
    throw new PurchaseOrderError(
      `Lens ${line.lensType}/${line.lensId} was not found.`,
      400,
      "LENS_NOT_FOUND"
    );
  }
  if (line.productLabel && line.powerLabel) return line;
  const composed = [lens.brand, lens.item, lens.coating].filter(Boolean).join(" · ");
  return {
    ...line,
    productLabel: line.productLabel ?? (composed || "Lens"),
    rangeLabel: line.rangeLabel ?? null,
    powerLabel: line.powerLabel ?? formatLensPower(lens),
  };
}

function resolveActor(actor?: AuditActor): AuditActor {
  return actor ?? systemActor();
}

function actorUserId(actor?: AuditActor): string | null {
  return actor?.actorUserId ?? null;
}

function totalsForLines(lines: DraftLineInput[]) {
  let subtotal = 0;
  for (const line of lines) {
    subtotal += lineAmount(line.poQuantity, line.rate ?? null);
  }
  subtotal = Math.round(subtotal * 100) / 100;
  return { subtotal, totalAmount: subtotal };
}

function isEditableStatus(status: PurchaseOrderStatus) {
  return status === PurchaseOrderStatus.DRAFT || status === PurchaseOrderStatus.PENDING_APPROVAL;
}

function validateDraftLines(lines: DraftLineInput[]) {
  if (!lines.length) {
    throw new PurchaseOrderError("Add at least one line.", 400, "PO_EMPTY");
  }
  if (lines.length > 500) {
    throw new PurchaseOrderError("A purchase order can hold at most 500 lines.", 400, "PO_TOO_MANY_LINES");
  }
  if (findDuplicatePowersInDraft(lines).length) {
    throw new PurchaseOrderError(
      "A draft cannot contain the same power twice. Merge quantities into one line.",
      400,
      "PO_DUPLICATE_POWER_IN_DRAFT"
    );
  }
  if (findDuplicateProcurementRequestIdsInDraft(lines).length) {
    throw new PurchaseOrderError(
      "A draft cannot link the same procurement request on more than one line.",
      400,
      "PO_DUPLICATE_PR_IN_DRAFT"
    );
  }
  for (const line of lines) {
    if (!Number.isInteger(line.poQuantity) || line.poQuantity <= 0) {
      throw new PurchaseOrderError("PO quantity must be a positive whole number.", 400, "PO_LINE_INVALID");
    }
    if (!Number.isInteger(line.requiredQuantity) || line.requiredQuantity < 0) {
      throw new PurchaseOrderError("Required quantity must be a whole number ≥ 0.", 400, "PO_LINE_INVALID");
    }
    if (line.rate != null && (!Number.isFinite(line.rate) || line.rate < 0)) {
      throw new PurchaseOrderError("Rate must be a number ≥ 0.", 400, "PO_LINE_INVALID");
    }
  }
}

async function assertActiveSupplier(db: DbClient, supplierId: string) {
  const supplier = await db.supplier.findFirst({
    where: { id: supplierId, isActive: true },
    select: { id: true },
  });
  if (!supplier) {
    throw new PurchaseOrderError("Supplier not found or inactive.", 400, "SUPPLIER_INVALID");
  }
}

function lineCreateData(lines: DraftLineInput[]) {
  return lines.map((line, index) => ({
    lineNumber: index + 1,
    lensType: line.lensType ?? null,
    lensId: line.lensId ?? null,
    lensProductVariantId: line.lensProductVariantId ?? null,
    lensProductPowerId: line.lensProductPowerId ?? null,
    sph: line.sph != null ? new Prisma.Decimal(line.sph.toFixed(2)) : null,
    cyl: line.cyl != null ? new Prisma.Decimal(line.cyl.toFixed(2)) : null,
    productLabel: line.productLabel,
    rangeLabel: line.rangeLabel,
    powerLabel: line.powerLabel,
    requiredQuantity: line.requiredQuantity,
    poQuantity: line.poQuantity,
    rate: line.rate ?? null,
    amount: lineAmount(line.poQuantity, line.rate ?? null),
    procurementRequestId: line.procurementRequestId ?? null,
  }));
}

export async function listPurchaseOrders(input?: {
  status?: PurchaseOrderStatus;
  supplierId?: string;
  search?: string;
  limit?: number;
  client?: DbClient;
}) {
  const db = input?.client ?? prisma;
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 300);
  const search = input?.search?.trim();
  return db.purchaseOrder.findMany({
    where: {
      ...(input?.status ? { status: input.status } : {}),
      ...(input?.supplierId ? { supplierId: input.supplierId } : {}),
      ...(search
        ? {
            OR: [
              { publicId: { contains: search, mode: "insensitive" as const } },
              { supplier: { name: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      supplier: { select: { id: true, name: true } },
      lines: {
        select: {
          id: true,
          poQuantity: true,
          receivedQuantity: true,
          cancelledQuantity: true,
          lensType: true,
        },
      },
    },
  });
}

export async function getPurchaseOrder(
  id: string,
  client: DbClient = prisma
): Promise<PurchaseOrderDetail | null> {
  return client.purchaseOrder.findUnique({
    where: { id },
    include: poInclude,
  });
}

async function getPurchaseOrderOrThrow(db: DbClient, id: string) {
  const po = await getPurchaseOrder(id, db);
  if (!po) throw new PurchaseOrderError("Purchase order not found.", 404, "PO_NOT_FOUND");
  return po;
}

export async function createDraftPurchaseOrder(input: {
  supplierId: string;
  warehouseCode?: string;
  expectedDelivery?: Date | null;
  notes?: string | null;
  lines: DraftLineInput[];
  actor?: AuditActor;
  request?: AuditRequestContext | null;
  client?: DbClient;
}): Promise<PurchaseOrderDetail> {
  const db = input.client ?? prisma;
  validateDraftLines(input.lines);
  await assertActiveSupplier(db, input.supplierId);

  const enriched: DraftLineInput[] = [];
  for (const line of input.lines) {
    enriched.push(await enrichLineLabels(db, line));
  }

  const { subtotal, totalAmount } = totalsForLines(enriched);
  const publicId = await nextPurchaseOrderPublicId();

  const created = await db.purchaseOrder.create({
    data: {
      publicId,
      status: PurchaseOrderStatus.DRAFT,
      supplierId: input.supplierId,
      warehouseCode: input.warehouseCode?.trim() || MAIN_WAREHOUSE_CODE,
      expectedDelivery: input.expectedDelivery ?? null,
      notes: input.notes?.trim() || null,
      subtotal,
      totalAmount,
      createdById: actorUserId(input.actor),
      lines: { create: lineCreateData(enriched) },
    },
    include: poInclude,
  });

  await recordAuditEvent(db, {
    action: AuditAction.PURCHASE_ORDER_CREATED,
    module: AuditModule.INVENTORY,
    entityType: "PurchaseOrder",
    entityId: created.id,
    actor: resolveActor(input.actor),
    request: input.request ?? null,
    context: {
      publicId: created.publicId,
      supplierId: created.supplierId,
      lines: String(created.lines.length),
    },
    activityMessage: `Purchase order ${created.publicId} drafted`,
  });

  return created;
}

export async function replaceDraftLines(input: {
  purchaseOrderId: string;
  supplierId?: string;
  warehouseCode?: string;
  expectedDelivery?: Date | null;
  notes?: string | null;
  lines: DraftLineInput[];
  actor?: AuditActor;
  request?: AuditRequestContext | null;
  client?: DbClient;
}): Promise<PurchaseOrderDetail> {
  const db = input.client ?? prisma;
  validateDraftLines(input.lines);
  if (input.supplierId) await assertActiveSupplier(db, input.supplierId);

  const enriched: DraftLineInput[] = [];
  for (const line of input.lines) {
    enriched.push(await enrichLineLabels(db, line));
  }
  const { subtotal, totalAmount } = totalsForLines(enriched);

  const updated = await inTransaction(input.client, async (tx) => {
    await lockPurchaseOrder(tx, input.purchaseOrderId);
    const existing = await tx.purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
    });
    if (!existing) {
      throw new PurchaseOrderError("Purchase order not found.", 404, "PO_NOT_FOUND");
    }
    if (!isEditableStatus(existing.status)) {
      throw new PurchaseOrderError(
        "Only draft purchase orders can be edited.",
        409,
        "PO_NOT_EDITABLE"
      );
    }
    await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: existing.id } });
    return tx.purchaseOrder.update({
      where: { id: existing.id },
      data: {
        supplierId: input.supplierId ?? existing.supplierId,
        warehouseCode:
          input.warehouseCode?.trim() || existing.warehouseCode || MAIN_WAREHOUSE_CODE,
        expectedDelivery:
          input.expectedDelivery === undefined
            ? existing.expectedDelivery
            : input.expectedDelivery,
        notes: input.notes === undefined ? existing.notes : input.notes?.trim() || null,
        subtotal,
        totalAmount,
        lines: { create: lineCreateData(enriched) },
      },
      include: poInclude,
    });
  });

  await recordAuditEvent(db, {
    action: AuditAction.PURCHASE_ORDER_UPDATED,
    module: AuditModule.INVENTORY,
    entityType: "PurchaseOrder",
    entityId: updated.id,
    actor: resolveActor(input.actor),
    request: input.request ?? null,
    context: { publicId: updated.publicId, lines: String(updated.lines.length) },
    activityMessage: `Purchase order ${updated.publicId} draft updated`,
  });

  return updated;
}

/** Draft → PENDING_APPROVAL for review workflow (still no reservation). */
export async function submitPurchaseOrderForReview(input: {
  purchaseOrderId: string;
  actor?: AuditActor;
  request?: AuditRequestContext | null;
  client?: DbClient;
}): Promise<PurchaseOrderDetail> {
  const db = input.client ?? prisma;
  let changed = false;
  const po = await inTransaction(input.client, async (tx) => {
    await lockPurchaseOrder(tx, input.purchaseOrderId);
    const current = await getPurchaseOrderOrThrow(tx, input.purchaseOrderId);
    if (current.status === PurchaseOrderStatus.PENDING_APPROVAL) return current;
    if (current.status !== PurchaseOrderStatus.DRAFT) {
      throw new PurchaseOrderError(
        "Only draft purchase orders can be submitted for review.",
        409,
        "PO_NOT_EDITABLE"
      );
    }
    if (!current.lines.length) {
      throw new PurchaseOrderError("Cannot submit an empty purchase order.", 400, "PO_EMPTY");
    }
    changed = true;
    return tx.purchaseOrder.update({
      where: { id: current.id },
      data: { status: PurchaseOrderStatus.PENDING_APPROVAL },
      include: poInclude,
    });
  });

  if (changed) {
    await recordAuditEvent(db, {
      action: AuditAction.PURCHASE_ORDER_SUBMITTED,
      module: AuditModule.INVENTORY,
      entityType: "PurchaseOrder",
      entityId: po.id,
      actor: resolveActor(input.actor),
      request: input.request ?? null,
      context: { publicId: po.publicId, status: po.status },
      activityMessage: `Purchase order ${po.publicId} submitted for review`,
    });
  }
  return po;
}

/**
 * Approve draft → OPEN.
 * Inserts OpenPurchaseOrderPower locks (unique per power) and allocates PR
 * orderedQuantity exactly. Never touches stock.
 */
export async function approvePurchaseOrder(input: {
  purchaseOrderId: string;
  actor?: AuditActor;
  request?: AuditRequestContext | null;
  client?: DbClient;
}): Promise<PurchaseOrderDetail> {
  const db = input.client ?? prisma;
  const approvedById = actorUserId(input.actor);

  const approved = await inTransaction(input.client, async (tx) => {
    await lockPurchaseOrder(tx, input.purchaseOrderId);
    const po = await tx.purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    });
    if (!po) {
      throw new PurchaseOrderError("Purchase order not found.", 404, "PO_NOT_FOUND");
    }
    if (!isEditableStatus(po.status)) {
      throw new PurchaseOrderError(
        po.status === PurchaseOrderStatus.OPEN
          ? "Purchase order is already approved."
          : "Only draft purchase orders can be approved.",
        409,
        po.status === PurchaseOrderStatus.OPEN ? "PO_ALREADY_OPEN" : "PO_NOT_APPROVABLE"
      );
    }
    if (!po.lines.length) {
      throw new PurchaseOrderError("Cannot approve an empty purchase order.", 400, "PO_EMPTY");
    }
    await assertActiveSupplier(tx, po.supplierId);

    // Atomic power locks — unique on catalog leaf and/or legacy identity.
    for (const line of po.lines) {
      if (line.lensProductPowerId) {
        const catalogLock = await tx.openPurchaseOrderPower.findUnique({
          where: { lensProductPowerId: line.lensProductPowerId },
          include: { purchaseOrder: { select: { publicId: true } } },
        });
        if (catalogLock) {
          throw new PurchaseOrderError(
            `${catalogLock.purchaseOrder.publicId} is still open for ${line.productLabel ?? "catalog"} ${line.powerLabel ?? ""}. Close or cancel it before approving another PO for this power.`.replace(/\s+\./, "."),
            409,
            "PO_POWER_ALREADY_OPEN"
          );
        }
      }
      if (line.lensType && line.lensId) {
        const existingLock = await tx.openPurchaseOrderPower.findUnique({
          where: {
            lensType_lensId: { lensType: line.lensType, lensId: line.lensId },
          },
          include: { purchaseOrder: { select: { publicId: true } } },
        });
        if (existingLock) {
          throw new PurchaseOrderError(
            `${existingLock.purchaseOrder.publicId} is still open for ${line.productLabel ?? line.lensType} ${line.powerLabel ?? ""}. Close or cancel it before approving another PO for this power.`.replace(/\s+\./, "."),
            409,
            "PO_POWER_ALREADY_OPEN"
          );
        }
      }
      try {
        await tx.openPurchaseOrderPower.create({
          data: {
            lensType: line.lensType ?? null,
            lensId: line.lensId ?? null,
            lensProductPowerId: line.lensProductPowerId ?? null,
            purchaseOrderId: po.id,
            purchaseOrderLineId: line.id,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new PurchaseOrderError(
            `Another purchase order was just approved for ${line.productLabel ?? line.lensType ?? "catalog"} ${line.powerLabel ?? ""}. Reload and review.`,
            409,
            "PO_POWER_ALREADY_OPEN"
          );
        }
        throw err;
      }
    }

    // Exact PR allocations (approve only) — one row per PR contribution per line.
    for (const line of po.lines) {
      if (!line.lensProductPowerId && (!line.lensType || !line.lensId)) continue;
      const candidates = await tx.procurementRequest.findMany({
        where: {
          ...(line.lensProductPowerId
            ? { lensProductPowerId: line.lensProductPowerId }
            : { lensType: line.lensType!, lensId: line.lensId! }),
          status: { in: [...OPEN_REQUEST_STATUSES] },
        },
        orderBy: { createdAt: "asc" },
      });

      const plan = planLineAllocations({
        want: line.poQuantity,
        preferredRequestId: line.procurementRequestId,
        candidates: candidates.map((pr) => ({
          id: pr.id,
          requestedQuantity: pr.requestedQuantity,
          orderedQuantity: pr.orderedQuantity,
        })),
      });

      const prById = new Map(candidates.map((pr) => [pr.id, pr]));
      let primaryPrId = line.procurementRequestId;

      for (const step of plan) {
        const pr = prById.get(step.procurementRequestId);
        if (!pr) continue;
        const updated = await tx.procurementRequest.update({
          where: { id: pr.id },
          data: {
            orderedQuantity: { increment: step.quantity },
            approvedAt: pr.approvedAt ?? new Date(),
            approvedById: pr.approvedById ?? approvedById,
          },
        });
        if (updated.orderedQuantity > updated.requestedQuantity) {
          throw new PurchaseOrderError(
            `Procurement request ${updated.publicId} changed while approving. Reload and try again.`,
            409,
            "PR_CONCURRENT_CHANGE"
          );
        }
        if (
          updated.orderedQuantity >= updated.requestedQuantity &&
          updated.status !== ProcurementRequestStatus.APPROVED
        ) {
          await tx.procurementRequest.update({
            where: { id: pr.id },
            data: { status: ProcurementRequestStatus.APPROVED },
          });
        }

        await tx.purchaseOrderAllocation.create({
          data: {
            purchaseOrderId: po.id,
            purchaseOrderLineId: line.id,
            procurementRequestId: pr.id,
            quantity: step.quantity,
          },
        });

        if (!primaryPrId) primaryPrId = pr.id;
      }

      if (primaryPrId && primaryPrId !== line.procurementRequestId) {
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { procurementRequestId: primaryPrId },
        });
      }
    }

    return tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: PurchaseOrderStatus.OPEN,
        approvedAt: new Date(),
        approvedById,
      },
      include: poInclude,
    });
  });

  await recordAuditEvent(db, {
    action: AuditAction.PURCHASE_ORDER_APPROVED,
    module: AuditModule.INVENTORY,
    entityType: "PurchaseOrder",
    entityId: approved.id,
    actor: resolveActor(input.actor),
    request: input.request ?? null,
    context: { publicId: approved.publicId, status: approved.status },
    activityMessage: `Purchase order ${approved.publicId} approved (OPEN, not yet sent)`,
  });

  return approved;
}

/**
 * Record that an approved PO was actually dispatched to the supplier.
 * Only an explicit, authorized confirmation marks SENT — approval alone never
 * does. There is no server-side email integration; email is sent from the
 * admin's own mail client and then confirmed here.
 */
export async function markPurchaseOrderSent(input: {
  purchaseOrderId: string;
  channel: PoSentChannel;
  sentTo?: string | null;
  note?: string | null;
  actor?: AuditActor;
  request?: AuditRequestContext | null;
  client?: DbClient;
}): Promise<PurchaseOrderDetail> {
  const db = input.client ?? prisma;
  if (!isPoSentChannel(input.channel)) {
    throw new PurchaseOrderError(
      `channel must be one of ${PO_SENT_CHANNELS.join(", ")}.`,
      400,
      "PO_SENT_CHANNEL_INVALID"
    );
  }
  const sentTo = input.sentTo?.trim() || null;
  const note = input.note?.trim() || null;
  if (sentTo && sentTo.length > 200) {
    throw new PurchaseOrderError("Recipient is too long.", 400, "PO_SENT_INVALID");
  }
  if (note && note.length > 500) {
    throw new PurchaseOrderError("Note is too long (max 500).", 400, "PO_SENT_INVALID");
  }
  if (input.channel === "EMAIL" && (!sentTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sentTo))) {
    throw new PurchaseOrderError(
      "Enter the email address the PO was sent to.",
      400,
      "PO_SENT_INVALID"
    );
  }
  if (input.channel === "OTHER" && !note) {
    throw new PurchaseOrderError(
      "Describe how the PO was sent when choosing Other.",
      400,
      "PO_SENT_INVALID"
    );
  }

  const sent = await inTransaction(input.client, async (tx) => {
    await lockPurchaseOrder(tx, input.purchaseOrderId);
    const po = await getPurchaseOrderOrThrow(tx, input.purchaseOrderId);
    if (po.sentAt) {
      throw new PurchaseOrderError(
        `${po.publicId} was already marked as sent.`,
        409,
        "PO_ALREADY_SENT"
      );
    }
    if (
      po.status !== PurchaseOrderStatus.OPEN &&
      po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
    ) {
      throw new PurchaseOrderError(
        "Only approved, open purchase orders can be marked as sent.",
        409,
        "PO_NOT_SENDABLE"
      );
    }
    return tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        // Receiving progress outranks SENT; keep PARTIALLY_RECEIVED if goods
        // arrived before the dispatch was recorded.
        status:
          po.status === PurchaseOrderStatus.OPEN ? PurchaseOrderStatus.SENT : po.status,
        sentAt: new Date(),
        sentById: actorUserId(input.actor),
        sentVia: input.channel,
        sentTo,
        sentNote: note,
      },
      include: poInclude,
    });
  });

  await recordAuditEvent(db, {
    action: AuditAction.PURCHASE_ORDER_SENT,
    module: AuditModule.INVENTORY,
    entityType: "PurchaseOrder",
    entityId: sent.id,
    actor: resolveActor(input.actor),
    request: input.request ?? null,
    context: {
      publicId: sent.publicId,
      channel: input.channel,
      sentTo: sentTo ?? "",
    },
    activityMessage: `Purchase order ${sent.publicId} marked sent to supplier (${input.channel})`,
  });

  return sent;
}

export async function cancelPurchaseOrder(input: {
  purchaseOrderId: string;
  reason?: string;
  actor?: AuditActor;
  request?: AuditRequestContext | null;
  client?: DbClient;
}): Promise<PurchaseOrderDetail> {
  const db = input.client ?? prisma;
  const reason = input.reason?.trim() || null;
  if (reason && reason.length > 500) {
    throw new PurchaseOrderError("Reason is too long (max 500).", 400, "PO_CANCEL_INVALID");
  }
  let changed = false;

  const cancelled = await inTransaction(input.client, async (tx) => {
    await lockPurchaseOrder(tx, input.purchaseOrderId);
    const po = await tx.purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
      include: { lines: true },
    });
    if (!po) {
      throw new PurchaseOrderError("Purchase order not found.", 404, "PO_NOT_FOUND");
    }

    // Idempotent: already cancelled → return without reversing again.
    if (po.status === PurchaseOrderStatus.CANCELLED) {
      return getPurchaseOrderOrThrow(tx, po.id);
    }
    if (po.status === PurchaseOrderStatus.CLOSED) {
      throw new PurchaseOrderError("Purchase order is already closed.", 409, "PO_CLOSED");
    }
    // Received stock cannot be "un-ordered": use Close Outstanding instead.
    if (po.lines.some((line) => line.receivedQuantity > 0)) {
      throw new PurchaseOrderError(
        "Goods were already received on this purchase order. Use Close outstanding with a reason instead of cancelling.",
        409,
        "PO_HAS_RECEIPTS"
      );
    }
    const approved = isReceivablePoStatus(po.status);
    if (approved && !reason) {
      throw new PurchaseOrderError(
        "A reason is required to cancel an approved purchase order.",
        400,
        "PO_CANCEL_REASON_REQUIRED"
      );
    }

    if (approved) {
      // Reverse only this PO's reversible allocation rows (never other POs).
      for (const line of po.lines) {
        await reverseLineAllocations(tx, line.id, openPoLineOutstanding(line));
      }
      await tx.openPurchaseOrderPower.deleteMany({ where: { purchaseOrderId: po.id } });
      await tx.goodsReceipt.updateMany({
        where: {
          purchaseOrderId: po.id,
          status: { in: [GoodsReceiptStatus.DRAFT, GoodsReceiptStatus.VALIDATED] },
        },
        data: { status: GoodsReceiptStatus.CANCELLED },
      });
    }

    changed = true;
    return tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: PurchaseOrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: actorUserId(input.actor),
        cancelReason: reason,
      },
      include: poInclude,
    });
  });

  if (changed) {
    await recordAuditEvent(db, {
      action: AuditAction.PURCHASE_ORDER_CANCELLED,
      module: AuditModule.INVENTORY,
      entityType: "PurchaseOrder",
      entityId: cancelled.id,
      actor: resolveActor(input.actor),
      request: input.request ?? null,
      context: { publicId: cancelled.publicId, reason: reason ?? "" },
      activityMessage: `Purchase order ${cancelled.publicId} cancelled`,
    });
  }

  return cancelled;
}

export type ProcurementQueueItem = {
  id: string;
  publicId: string;
  lensType: LensType | null;
  lensId: string | null;
  lensProductPowerId: string | null;
  lensProductVariantId: string | null;
  sph: number | null;
  cyl: number | null;
  requiredQuantity: number;
  requestedQuantity: number;
  orderedQuantity: number;
  unallocatedQuantity: number;
  priority: string;
  source: string;
  productLabel: string | null;
  rangeLabel: string | null;
  powerLabel: string | null;
  brand: string | null;
  item: string | null;
  coating: string | null;
  /** Open PO already covering this power — such items cannot be added. */
  openPurchaseOrder: { id: string; publicId: string; status: string } | null;
};

export async function listOpenProcurementQueue(
  client: DbClient = prisma
): Promise<ProcurementQueueItem[]> {
  const rows = await client.procurementRequest.findMany({
    where: {
      status: { in: [...OPEN_REQUEST_STATUSES] },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 300,
    include: {
      lensProductPower: {
        include: {
          lensProductVariant: {
            select: {
              id: true,
              name: true,
              skuCode: true,
              product: {
                select: {
                  family: { select: { name: true } },
                  base: { select: { name: true } },
                  color: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  const pending = rows.filter(
    (row) =>
      row.requestedQuantity - row.orderedQuantity > 0 &&
      (row.lensProductPower || (row.lensType && row.lensId))
  );

  const locks = pending.length
    ? await client.openPurchaseOrderPower.findMany({
        where: {
          OR: pending.flatMap((row) => [
            ...(row.lensProductPowerId
              ? [{ lensProductPowerId: row.lensProductPowerId }]
              : []),
            ...(row.lensType && row.lensId
              ? [{ lensType: row.lensType, lensId: row.lensId }]
              : []),
          ]),
        },
        include: { purchaseOrder: { select: { id: true, publicId: true, status: true } } },
      })
    : [];
  const lockByPower = new Map<string, (typeof locks)[number]["purchaseOrder"]>();
  for (const lock of locks) {
    if (lock.lensProductPowerId) lockByPower.set(`power:${lock.lensProductPowerId}`, lock.purchaseOrder);
    if (lock.lensType && lock.lensId) lockByPower.set(powerKey(lock.lensType, lock.lensId), lock.purchaseOrder);
  }

  const result: ProcurementQueueItem[] = [];
  for (const row of pending) {
    const leaf = row.lensProductPower;
    const variant = leaf?.lensProductVariant;
    const lens = !leaf && row.lensType && row.lensId
      ? await readLensDescriptor(client, row.lensType, row.lensId)
      : null;
    const catalogLabel = variant
      ? [variant.skuCode, variant.product.family.name, variant.product.base.name, variant.product.color?.name]
          .filter(Boolean).join(" · ")
      : null;
    result.push({
      id: row.id,
      publicId: row.publicId,
      lensType: row.lensType,
      lensId: row.lensId,
      lensProductPowerId: leaf?.id ?? null,
      lensProductVariantId: variant?.id ?? null,
      sph: leaf ? Number(leaf.sph) : null,
      cyl: leaf ? Number(leaf.cyl) : null,
      requiredQuantity: row.requiredQuantity,
      requestedQuantity: row.requestedQuantity,
      orderedQuantity: row.orderedQuantity,
      unallocatedQuantity: row.requestedQuantity - row.orderedQuantity,
      priority: row.priority,
      source: row.source,
      productLabel: catalogLabel ?? (lens
        ? [lens.brand, lens.item, lens.coating].filter(Boolean).join(" · ") || null
        : null),
      rangeLabel: variant?.name ?? null,
      powerLabel: leaf
        ? formatCatalogPowerLabel(Number(leaf.sph), Number(leaf.cyl))
        : lens
          ? formatLensPower(lens)
          : null,
      brand: lens?.brand ?? null,
      item: lens?.item ?? null,
      coating: lens?.coating ?? null,
      openPurchaseOrder: (leaf ? lockByPower.get(`power:${leaf.id}`) : null) ??
        (row.lensType && row.lensId ? lockByPower.get(powerKey(row.lensType, row.lensId)) : null) ?? null,
    });
  }
  return result;
}

export type PurchaseOrderHistoryEntry = {
  id: string;
  occurredAt: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string | null;
  actorUserId: string | null;
  message: string | null;
  context: Record<string, unknown> | null;
};

/** Audit trail for a PO and its goods receipts, newest first. */
export async function listPurchaseOrderHistory(
  purchaseOrderId: string,
  client: DbClient = prisma
): Promise<PurchaseOrderHistoryEntry[]> {
  const receipts = await client.goodsReceipt.findMany({
    where: { purchaseOrderId },
    select: { id: true },
  });
  const events = await client.auditEvent.findMany({
    where: {
      OR: [
        { entityType: "PurchaseOrder", entityId: purchaseOrderId },
        ...(receipts.length
          ? [{ entityType: "GoodsReceipt", entityId: { in: receipts.map((r) => r.id) } }]
          : []),
      ],
    },
    orderBy: { occurredAt: "desc" },
    take: 200,
    select: {
      id: true,
      occurredAt: true,
      action: true,
      entityType: true,
      entityId: true,
      actorName: true,
      actorUserId: true,
      message: true,
      context: true,
    },
  });

  const userIds = Array.from(
    new Set(events.map((e) => e.actorUserId).filter((id): id is string => Boolean(id)))
  );
  const users = userIds.length
    ? await client.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return events.map((event) => ({
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    actorName:
      event.actorName ?? (event.actorUserId ? nameById.get(event.actorUserId) ?? null : null),
    actorUserId: event.actorUserId,
    message: event.message,
    context:
      event.context && typeof event.context === "object" && !Array.isArray(event.context)
        ? (event.context as Record<string, unknown>)
        : null,
  }));
}

type BuyerSettings = {
  legalName: string;
  tradeName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string;
  stateCode: string;
  pincode: string | null;
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  email: string | null;
} | null;

/** Read-only company settings for PO documents (never creates the row). */
export async function readBuyerSettings(client: DbClient = prisma): Promise<BuyerSettings> {
  return client.companyFinanceSettings.findUnique({ where: { id: "default" } });
}

export function buildPurchaseOrderDocument(
  po: PurchaseOrderDetail,
  buyer: BuyerSettings
): PurchaseOrderDocument {
  const lines = po.lines.map((line) => ({
    lineNumber: line.lineNumber,
    lensType: line.lensType,
    productLabel: line.productLabel,
    rangeLabel: line.rangeLabel,
    powerLabel: line.powerLabel,
    requiredQuantity: line.requiredQuantity,
    poQuantity: line.poQuantity,
    receivedQuantity: line.receivedQuantity,
    cancelledQuantity: line.cancelledQuantity,
    outstandingQuantity: openPoLineOutstanding(line),
    rate: line.rate == null ? null : Number(line.rate),
    amount: Number(line.amount),
  }));

  const buyerParty: PurchaseOrderDocumentParty = buyer
    ? {
        name: buyer.legalName,
        tradeName: buyer.tradeName,
        gstin: buyer.gstin,
        pan: buyer.pan,
        phone: buyer.phone,
        email: buyer.email,
        addressLines: [
          buyer.addressLine1,
          buyer.addressLine2,
          [buyer.city, buyer.pincode].filter(Boolean).join(" - ") || null,
          buyer.state ? `${buyer.state} (${buyer.stateCode})` : null,
        ].filter((v): v is string => Boolean(v && v.trim())),
      }
    : { name: "DrishX", addressLines: [] };

  const supplier = po.supplier;
  return {
    publicId: po.publicId,
    status: po.status,
    statusLabel: PO_DOCUMENT_STATUS_LABELS[po.status] ?? po.status,
    createdAt: po.createdAt.toISOString(),
    approvedAt: po.approvedAt?.toISOString() ?? null,
    sentAt: po.sentAt?.toISOString() ?? null,
    expectedDelivery: po.expectedDelivery?.toISOString() ?? null,
    warehouseCode: po.warehouseCode,
    notes: po.notes,
    buyer: buyerParty,
    supplier: {
      name: supplier.name,
      tradeName: supplier.tradeName,
      contactPerson: supplier.contactPerson,
      gstin: supplier.gstin,
      pan: supplier.pan,
      phone: supplier.phone,
      email: supplier.email,
      addressLines: formatSupplierAddressLines(supplier),
    },
    lines,
    totals: {
      lineCount: lines.length,
      totalQuantity: lines.reduce((sum, line) => sum + line.poQuantity, 0),
      subtotal: Number(po.subtotal),
      totalAmount: Number(po.totalAmount),
      hasUnpricedLines: lines.some((line) => line.rate == null),
    },
  };
}

export function serializePurchaseOrder(po: PurchaseOrderDetail) {
  return {
    id: po.id,
    publicId: po.publicId,
    status: po.status,
    supplierId: po.supplierId,
    supplier: po.supplier,
    warehouseCode: po.warehouseCode,
    expectedDelivery: po.expectedDelivery?.toISOString() ?? null,
    notes: po.notes,
    subtotal: Number(po.subtotal),
    totalAmount: Number(po.totalAmount),
    createdById: po.createdById,
    approvedAt: po.approvedAt?.toISOString() ?? null,
    approvedById: po.approvedById,
    cancelledAt: po.cancelledAt?.toISOString() ?? null,
    cancelReason: po.cancelReason,
    sentAt: po.sentAt?.toISOString() ?? null,
    sentById: po.sentById,
    sentVia: po.sentVia,
    sentTo: po.sentTo,
    sentNote: po.sentNote,
    createdAt: po.createdAt.toISOString(),
    updatedAt: po.updatedAt.toISOString(),
    lines: po.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      lensType: line.lensType,
      lensId: line.lensId,
      lensProductVariantId: line.lensProductVariantId,
      lensProductPowerId: line.lensProductPowerId,
      sph: line.sph == null ? null : Number(line.sph),
      cyl: line.cyl == null ? null : Number(line.cyl),
      productLabel: line.productLabel,
      rangeLabel: line.rangeLabel,
      powerLabel: line.powerLabel,
      requiredQuantity: line.requiredQuantity,
      poQuantity: line.poQuantity,
      rate: line.rate == null ? null : Number(line.rate),
      amount: Number(line.amount),
      receivedQuantity: line.receivedQuantity,
      cancelledQuantity: line.cancelledQuantity,
      outstandingQuantity: openPoLineOutstanding(line),
      procurementRequestId: line.procurementRequestId,
      procurementRequest: line.procurementRequest
        ? {
            id: line.procurementRequest.id,
            publicId: line.procurementRequest.publicId,
            requestedQuantity: line.procurementRequest.requestedQuantity,
            orderedQuantity: line.procurementRequest.orderedQuantity,
            status: line.procurementRequest.status,
          }
        : null,
    })),
  };
}

export { powerKey };
