import {
  AlternateSuggestionStatus,
  CartLineType,
  LensType,
  NotificationType,
  OrderStatus,
  PowerVersionSource,
  PowerVersionStatus,
  type Order,
  type Prisma,
} from "@prisma/client";
import {
  assertRetailOrder,
  createAlternateSuggestionsForVersion,
  type SupplierProcurableInput,
} from "./alternate-power-suggestions";
import { logOrderActivity } from "./order-activity";
import {
  AuditAction,
  AuditModule,
  diffFields,
  recordAuditEvent,
} from "./audit";
import {
  computeOrderReservedQuantity,
  getOrderLensId,
} from "./order-inventory";
import { prisma } from "./prisma";

type TxClient = Prisma.TransactionClient | typeof prisma;

function formatShortOrderId(orderId: string): string {
  return orderId.slice(-8).toUpperCase();
}

function lensIdFields(
  lensType: LensType,
  lensId: string | null
): {
  singleVisionLensId: string | null;
  kryptokLensId: string | null;
  progressiveLensId: string | null;
} {
  return {
    singleVisionLensId: lensType === LensType.SINGLE_VISION ? lensId : null,
    kryptokLensId: lensType === LensType.KRYPTOK ? lensId : null,
    progressiveLensId: lensType === LensType.PROGRESSIVE ? lensId : null,
  };
}

async function readLensOnHand(lensType: LensType, lensId: string): Promise<number> {
  if (lensType === LensType.SINGLE_VISION) {
    const lens = await prisma.singleVisionLens.findUnique({
      where: { id: lensId },
      select: { quantity: true },
    });
    return lens?.quantity ?? 0;
  }
  if (lensType === LensType.KRYPTOK) {
    const lens = await prisma.kryptokLens.findUnique({
      where: { id: lensId },
      select: { quantity: true },
    });
    return lens?.quantity ?? 0;
  }
  const lens = await prisma.progressiveLens.findUnique({
    where: { id: lensId },
    select: { quantity: true },
  });
  return lens?.quantity ?? 0;
}

export async function createOriginalPowerVersion(
  client: TxClient,
  order: Order,
  createdById?: string | null
) {
  if (order.lineType !== CartLineType.RETAIL) return null;

  const existing = await client.orderPowerVersion.findFirst({
    where: { orderId: order.id },
  });
  if (existing) return existing;

  const lensId = getOrderLensId(order);
  return client.orderPowerVersion.create({
    data: {
      orderId: order.id,
      versionNumber: 1,
      sph: order.sph,
      cyl: order.cyl,
      axis: order.axis,
      add: order.add,
      eye: order.eye,
      lensType: order.lensType,
      lensId,
      lensProductPowerId: order.lensProductPowerId,
      source: PowerVersionSource.ORIGINAL,
      status: PowerVersionStatus.ACTIVE,
      reservedQuantity: order.reservedQuantity,
      pickedQuantity: order.pickedQuantity,
      createdById: createdById ?? null,
    },
  });
}

export async function getActivePowerVersion(orderId: string) {
  return prisma.orderPowerVersion.findFirst({
    where: {
      orderId,
      status: {
        in: [PowerVersionStatus.ACTIVE, PowerVersionStatus.POWER_NOT_AVAILABLE],
      },
    },
    orderBy: { versionNumber: "desc" },
  });
}

export async function listPowerVersions(orderId: string) {
  return prisma.orderPowerVersion.findMany({
    where: { orderId },
    orderBy: { versionNumber: "asc" },
    include: {
      createdBy: { select: { id: true, name: true, email: true, role: true } },
      acceptedBy: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}

export async function listAlternateSuggestions(orderId: string) {
  return prisma.alternatePowerSuggestion.findMany({
    where: { orderId },
    orderBy: [{ createdAt: "desc" }, { distanceScore: "asc" }],
  });
}

async function notifyCustomerAndStaff(input: {
  orderId: string;
  customerId: string;
  assignedToId?: string | null;
  type: NotificationType;
  title: string;
  customerMessage: string;
  staffMessage: string;
}) {
  const recipientIds = new Set<string>([input.customerId]);
  if (input.assignedToId) recipientIds.add(input.assignedToId);

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  for (const admin of admins) recipientIds.add(admin.id);

  await prisma.notification.createMany({
    data: [...recipientIds].map((userId) => ({
      userId,
      orderId: input.orderId,
      type: input.type,
      title: input.title,
      message:
        userId === input.customerId ? input.customerMessage : input.staffMessage,
    })),
  });
}

/**
 * Staff marks the active retail power as not available from supplier.
 * Generates warehouse (+ optional supplier) suggestions and notifies the customer.
 */
export async function markPowerNotAvailable(input: {
  orderId: string;
  actorUserId: string;
  supplierOptions?: SupplierProcurableInput[];
  notes?: string | null;
}) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new Error("Order not found.");
  assertRetailOrder(order);

  if (order.status !== OrderStatus.AWAITING_PROCUREMENT) {
    throw new Error(
      "Power can only be marked not available while the order is Awaiting Procurement."
    );
  }

  let version = await prisma.orderPowerVersion.findFirst({
    where: {
      orderId: order.id,
      status: {
        in: [PowerVersionStatus.ACTIVE, PowerVersionStatus.POWER_NOT_AVAILABLE],
      },
    },
    orderBy: { versionNumber: "desc" },
  });

  if (!version) {
    version = await createOriginalPowerVersion(prisma, order, input.actorUserId);
  }
  if (!version) throw new Error("Could not resolve power version.");

  const lensId = version.lensId ?? getOrderLensId(order);
  if (!lensId) throw new Error("Order has no lens to suggest alternates for.");

  const updatedVersion = await prisma.orderPowerVersion.update({
    where: { id: version.id },
    data: {
      status: PowerVersionStatus.POWER_NOT_AVAILABLE,
      notes: input.notes ?? version.notes,
      reservedQuantity: 0,
    },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { reservedQuantity: 0 },
  });

  const suggestions = await createAlternateSuggestionsForVersion({
    order,
    version: updatedVersion,
    lensId,
    supplierOptions: input.supplierOptions,
  });

  await logOrderActivity(prisma, {
    orderId: order.id,
    actorUserId: input.actorUserId,
    action: "POWER_NOT_AVAILABLE",
    message: `Ordered power marked not available. ${suggestions.length} alternate suggestion(s) generated.`,
    metadata: {
      versionId: updatedVersion.id,
      suggestionCount: suggestions.length,
    },
  });

  await recordAuditEvent(prisma, {
    action: AuditAction.POWER_NOT_AVAILABLE,
    module: AuditModule.ORDER,
    entityType: "Order",
    entityId: order.id,
    actor: {
      actorType: "HUMAN",
      actorUserId: input.actorUserId,
      actorName: null,
    },
    context: {
      versionId: updatedVersion.id,
      suggestionCount: suggestions.length,
      sph: version.sph,
      cyl: version.cyl,
    },
    activityMessage: `Power marked not available — ${suggestions.length} alternate(s) suggested`,
  });

  const shortId = formatShortOrderId(order.id);
  const hasSuggestions = suggestions.length > 0;
  await notifyCustomerAndStaff({
    orderId: order.id,
    customerId: order.userId,
    assignedToId: order.assignedToId,
    type: NotificationType.ALTERNATE_POWER_SUGGESTED,
    title: hasSuggestions
      ? "Alternate powers available"
      : "Ordered power not available",
    customerMessage: hasSuggestions
      ? `Power for order #${shortId} is unavailable. Please choose an alternate power in the app.`
      : `Power for order #${shortId} is unavailable. Our team will follow up with options.`,
    staffMessage: hasSuggestions
      ? `Alternate powers suggested for order #${shortId}. Waiting for customer approval.`
      : `Power marked not available for order #${shortId}. No sibling powers found to suggest.`,
  });

  return { version: updatedVersion, suggestions };
}

export async function rejectAlternateSuggestion(input: {
  orderId: string;
  suggestionId: string;
  actorUserId: string;
}) {
  const suggestion = await prisma.alternatePowerSuggestion.findFirst({
    where: { id: input.suggestionId, orderId: input.orderId },
  });
  if (!suggestion) throw new Error("Suggestion not found.");
  if (suggestion.status !== AlternateSuggestionStatus.PENDING) {
    throw new Error("Suggestion is no longer pending.");
  }

  const updated = await prisma.alternatePowerSuggestion.update({
    where: { id: suggestion.id },
    data: { status: AlternateSuggestionStatus.REJECTED },
  });

  await logOrderActivity(prisma, {
    orderId: input.orderId,
    actorUserId: input.actorUserId,
    action: "ALTERNATE_REJECTED",
    message: `Alternate power suggestion rejected (SPH ${Number(suggestion.sph)} / CYL ${suggestion.cyl ?? "—"}).`,
    metadata: { suggestionId: suggestion.id },
  });

  return updated;
}

export async function rejectAllAlternateSuggestions(input: {
  orderId: string;
  actorUserId: string;
}) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new Error("Order not found.");

  const result = await prisma.alternatePowerSuggestion.updateMany({
    where: {
      orderId: input.orderId,
      status: AlternateSuggestionStatus.PENDING,
    },
    data: { status: AlternateSuggestionStatus.REJECTED },
  });

  await logOrderActivity(prisma, {
    orderId: input.orderId,
    actorUserId: input.actorUserId,
    action: "ALTERNATE_REJECTED_ALL",
    message: `All pending alternate power suggestions rejected (${result.count}).`,
    metadata: { count: result.count },
  });

  const shortId = formatShortOrderId(order.id);
  await notifyCustomerAndStaff({
    orderId: order.id,
    customerId: order.userId,
    assignedToId: order.assignedToId,
    type: NotificationType.ALTERNATE_POWER_REJECTED,
    title: "Alternate powers rejected",
    customerMessage: `You rejected the alternate powers for order #${shortId}. Our team will follow up.`,
    staffMessage: `Customer rejected all alternate powers for order #${shortId}.`,
  });

  return result;
}

/**
 * Accept a suggestion: create a new power version and restart stock check / procurement.
 */
export async function acceptAlternateSuggestion(input: {
  orderId: string;
  suggestionId: string;
  actorUserId: string;
}) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new Error("Order not found.");
  assertRetailOrder(order);

  const suggestion = await prisma.alternatePowerSuggestion.findFirst({
    where: { id: input.suggestionId, orderId: input.orderId },
  });
  if (!suggestion) throw new Error("Suggestion not found.");
  if (suggestion.status !== AlternateSuggestionStatus.PENDING) {
    throw new Error("Suggestion is no longer pending.");
  }

  const latestVersion = await prisma.orderPowerVersion.findFirst({
    where: { orderId: order.id },
    orderBy: { versionNumber: "desc" },
  });
  const nextNumber = (latestVersion?.versionNumber ?? 0) + 1;

  const onHand = await readLensOnHand(suggestion.lensType, suggestion.lensId);
  const reservedQty = await computeOrderReservedQuantity(
    suggestion.lensType,
    suggestion.lensId,
    onHand,
    order.quantity
  );
  const needsProcurement = reservedQty < order.quantity;
  const nextStatus = needsProcurement
    ? OrderStatus.AWAITING_PROCUREMENT
    : OrderStatus.PENDING;

  const lensFields = lensIdFields(suggestion.lensType, suggestion.lensId);

  const result = await prisma.$transaction(async (tx) => {
    await tx.orderPowerVersion.updateMany({
      where: {
        orderId: order.id,
        status: {
          in: [PowerVersionStatus.ACTIVE, PowerVersionStatus.POWER_NOT_AVAILABLE],
        },
      },
      data: {
        status: PowerVersionStatus.SUPERSEDED,
        supersededAt: new Date(),
        reservedQuantity: 0,
      },
    });

    await tx.alternatePowerSuggestion.updateMany({
      where: {
        orderId: order.id,
        status: AlternateSuggestionStatus.PENDING,
        id: { not: suggestion.id },
      },
      data: { status: AlternateSuggestionStatus.EXPIRED },
    });

    await tx.alternatePowerSuggestion.update({
      where: { id: suggestion.id },
      data: { status: AlternateSuggestionStatus.ACCEPTED },
    });

    const newVersion = await tx.orderPowerVersion.create({
      data: {
        orderId: order.id,
        versionNumber: nextNumber,
        sph: suggestion.sph,
        cyl: suggestion.cyl,
        axis: suggestion.axis,
        add: suggestion.add,
        eye: suggestion.eye,
        lensType: suggestion.lensType,
        lensId: suggestion.lensId,
        source: PowerVersionSource.ALTERNATE,
        status: PowerVersionStatus.ACTIVE,
        reservedQuantity: reservedQty,
        pickedQuantity: 0,
        createdById: input.actorUserId,
        acceptedById: input.actorUserId,
        acceptedAt: new Date(),
        notes: `Accepted alternate suggestion ${suggestion.id}`,
      },
    });

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        ...lensFields,
        lensType: suggestion.lensType,
        sph: suggestion.sph,
        cyl: suggestion.cyl,
        axis: suggestion.axis,
        add: suggestion.add,
        eye: suggestion.eye,
        reservedQuantity: reservedQty,
        pickedQuantity: 0,
        status: nextStatus,
      },
    });

    await logOrderActivity(tx, {
      orderId: order.id,
      actorUserId: input.actorUserId,
      action: "ALTERNATE_ACCEPTED",
      message: `Alternate power accepted as Version ${nextNumber}. Fulfilment restarted (${needsProcurement ? "Awaiting Procurement" : "Pending"}).`,
      metadata: {
        suggestionId: suggestion.id,
        versionId: newVersion.id,
        versionNumber: nextNumber,
        status: nextStatus,
      },
    });

    return { order: updatedOrder, version: newVersion };
  });

  await recordAuditEvent(prisma, {
    action: AuditAction.PRESCRIPTION_CHANGED,
    module: AuditModule.ORDER,
    entityType: "Order",
    entityId: order.id,
    actor: {
      actorType: "HUMAN",
      actorUserId: input.actorUserId,
      actorName: null,
    },
    changes: diffFields(
      {
        sph: order.sph,
        cyl: order.cyl,
        axis: order.axis,
        add: order.add,
      },
      {
        sph: suggestion.sph,
        cyl: suggestion.cyl,
        axis: suggestion.axis,
        add: suggestion.add,
      },
      ["sph", "cyl", "axis", "add"]
    ),
    context: {
      suggestionId: suggestion.id,
      versionNumber: result.version.versionNumber,
    },
    relatedRefs: { orderId: order.id },
    activityMessage: `Alternate power accepted as Version ${result.version.versionNumber}`,
  });

  const shortId = formatShortOrderId(order.id);
  await notifyCustomerAndStaff({
    orderId: order.id,
    customerId: order.userId,
    assignedToId: order.assignedToId,
    type: NotificationType.ALTERNATE_POWER_ACCEPTED,
    title: "Alternate power accepted",
    customerMessage: `Your alternate power for order #${shortId} was accepted. Fulfilment will continue.`,
    staffMessage: `Alternate power accepted for order #${shortId}. Order is now ${nextStatus}.`,
  });

  return result;
}

/** Mark the active power version as the final fulfilled one when order ships/completes. */
export async function markActiveVersionFinalFulfilled(orderId: string) {
  const active = await prisma.orderPowerVersion.findFirst({
    where: { orderId, status: PowerVersionStatus.ACTIVE },
    orderBy: { versionNumber: "desc" },
  });
  if (!active) return null;

  await prisma.orderPowerVersion.updateMany({
    where: { orderId, isFinalFulfilled: true },
    data: { isFinalFulfilled: false },
  });

  return prisma.orderPowerVersion.update({
    where: { id: active.id },
    data: {
      status: PowerVersionStatus.FINAL_FULFILLED,
      isFinalFulfilled: true,
    },
  });
}

export function serializePowerVersion(version: {
  id: string;
  orderId: string;
  versionNumber: number;
  sph: unknown;
  cyl: unknown;
  axis: number | null;
  add: unknown;
  eye: string | null;
  lensType: string;
  lensId: string | null;
  source: string;
  status: string;
  reservedQuantity: number;
  pickedQuantity: number;
  isFinalFulfilled: boolean;
  createdById: string | null;
  acceptedById: string | null;
  acceptedAt: Date | null;
  supersededAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: unknown;
  acceptedBy?: unknown;
}) {
  return {
    id: version.id,
    orderId: version.orderId,
    versionNumber: version.versionNumber,
    sph: version.sph !== null && version.sph !== undefined ? Number(version.sph) : null,
    cyl: version.cyl !== null && version.cyl !== undefined ? Number(version.cyl) : null,
    axis: version.axis,
    add: version.add !== null && version.add !== undefined ? Number(version.add) : null,
    eye: version.eye,
    lensType: version.lensType,
    lensId: version.lensId,
    source: version.source,
    status: version.status,
    reservedQuantity: version.reservedQuantity,
    pickedQuantity: version.pickedQuantity,
    isFinalFulfilled: version.isFinalFulfilled,
    createdById: version.createdById,
    acceptedById: version.acceptedById,
    acceptedAt: version.acceptedAt?.toISOString() ?? null,
    supersededAt: version.supersededAt?.toISOString() ?? null,
    notes: version.notes,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
    createdBy: version.createdBy ?? null,
    acceptedBy: version.acceptedBy ?? null,
  };
}

export function serializeAlternateSuggestion(
  suggestion: Awaited<ReturnType<typeof listAlternateSuggestions>>[number]
) {
  return {
    ...suggestion,
    sph: Number(suggestion.sph),
    cyl: suggestion.cyl !== null ? Number(suggestion.cyl) : null,
    add: suggestion.add !== null ? Number(suggestion.add) : null,
    createdAt: suggestion.createdAt.toISOString(),
    updatedAt: suggestion.updatedAt.toISOString(),
  };
}
