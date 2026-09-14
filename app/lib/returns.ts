import {
  LedgerEntryType,
  LensType,
  Prisma,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";

import { prisma } from "./prisma";

export const ReturnRequestType = {
  RETURN: "RETURN",
  REPLACEMENT: "REPLACEMENT",
} as const;
export type ReturnRequestType =
  (typeof ReturnRequestType)[keyof typeof ReturnRequestType];

export const ReturnRequestStatus = {
  SUBMITTED: "SUBMITTED",
  MORE_INFO_REQUIRED: "MORE_INFO_REQUIRED",
  ESCALATED_TO_ADMIN: "ESCALATED_TO_ADMIN",
  AWAITING_MATERIAL: "AWAITING_MATERIAL",
  APPROVED_CREDIT: "APPROVED_CREDIT",
  APPROVED_REPLACEMENT: "APPROVED_REPLACEMENT",
  REJECTED: "REJECTED",
  CLOSED: "CLOSED",
} as const;
export type ReturnRequestStatus =
  (typeof ReturnRequestStatus)[keyof typeof ReturnRequestStatus];

export const ReturnReason = {
  WRONG_POWER: "WRONG_POWER",
  MANUFACTURING_DEFECT: "MANUFACTURING_DEFECT",
  COATING_ISSUE: "COATING_ISSUE",
  BROKEN_IN_TRANSPORT: "BROKEN_IN_TRANSPORT",
  WRONG_PRODUCT: "WRONG_PRODUCT",
  EXCESS_STOCK_RETURN: "EXCESS_STOCK_RETURN",
  OTHER: "OTHER",
} as const;
export type ReturnReason = (typeof ReturnReason)[keyof typeof ReturnReason];

export const StockDisposition = {
  RETURN_TO_SALEABLE: "RETURN_TO_SALEABLE",
  DAMAGED_STOCK: "DAMAGED_STOCK",
  SEND_TO_IMPORTER: "SEND_TO_IMPORTER",
  SCRAP: "SCRAP",
} as const;
export type StockDisposition =
  (typeof StockDisposition)[keyof typeof StockDisposition];

export const ReturnDecisionType = {
  CREDIT: "CREDIT",
  REPLACEMENT: "REPLACEMENT",
  REJECT: "REJECT",
} as const;
export type ReturnDecisionType =
  (typeof ReturnDecisionType)[keyof typeof ReturnDecisionType];

export const ReturnTimelineEventType = {
  SUBMITTED: "SUBMITTED",
  PHOTO_ADDED: "PHOTO_ADDED",
  MORE_INFO_REQUIRED: "MORE_INFO_REQUIRED",
  ESCALATED: "ESCALATED",
  APPROVED_CREDIT: "APPROVED_CREDIT",
  APPROVED_REPLACEMENT: "APPROVED_REPLACEMENT",
  REJECTED: "REJECTED",
  CLOSED: "CLOSED",
} as const;
export type ReturnTimelineEventType =
  (typeof ReturnTimelineEventType)[keyof typeof ReturnTimelineEventType];

/** Narrow accessor for return models when the editor TS server lags behind prisma generate. */
function asReturnsDb<T>(client: T) {
  return client as T & {
    returnRequest: {
      findUnique: (args: {
        where: { id: string };
        include?: Record<string, unknown>;
      }) => Promise<any>;
    };
    returnTimelineEvent: {
      create: (args: {
        data: {
          returnRequestId: string;
          actorUserId?: string | null;
          eventType: ReturnTimelineEventType;
          message: string;
        };
      }) => Promise<unknown>;
    };
    creditNote: {
      create: (args: {
        data: {
          creditNoteNumber: string;
          returnRequestId: string;
          invoiceId?: string | null;
          userId: string;
          amount: number;
          reason?: string | null;
        };
      }) => Promise<{ id: string; creditNoteNumber: string; amount: unknown }>;
    };
  };
}

export const RETURN_ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
]);

export const RETURN_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function buildReturnRequestNumber() {
  const stamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 900 + 100);
  return `RET-${stamp}${random}`;
}

export function buildCreditNoteNumber() {
  const stamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 900 + 100);
  return `CN-${stamp}${random}`;
}

export function parseReturnRequestType(value: unknown): ReturnRequestType | null {
  if (value === "RETURN" || value === "REPLACEMENT") return value;
  return null;
}

export function parseReturnReason(value: unknown): ReturnReason | null {
  if (typeof value !== "string") return null;
  return (Object.values(ReturnReason) as string[]).includes(value)
    ? (value as ReturnReason)
    : null;
}

export function parseStockDisposition(value: unknown): StockDisposition | null {
  if (typeof value !== "string") return null;
  return (Object.values(StockDisposition) as string[]).includes(value)
    ? (value as StockDisposition)
    : null;
}

export function parseReturnDecision(value: unknown): ReturnDecisionType | null {
  if (typeof value !== "string") return null;
  return (Object.values(ReturnDecisionType) as string[]).includes(value)
    ? (value as ReturnDecisionType)
    : null;
}

export async function appendReturnTimelineEvent(
  tx: Prisma.TransactionClient,
  input: {
    returnRequestId: string;
    actorUserId?: string | null;
    eventType: ReturnTimelineEventType;
    message: string;
  }
) {
  await asReturnsDb(tx).returnTimelineEvent.create({
    data: {
      returnRequestId: input.returnRequestId,
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      message: input.message,
    },
  });
}

export async function incrementLensStock(
  tx: Prisma.TransactionClient,
  lensType: LensType,
  lensId: string,
  quantity: number
) {
  if (!lensId || !Number.isFinite(quantity) || quantity <= 0) return;

  switch (lensType) {
    case "SINGLE_VISION":
      await tx.singleVisionLens.update({
        where: { id: lensId },
        data: { quantity: { increment: Math.round(quantity) } },
      });
      return;
    case "KRYPTOK":
      await tx.kryptokLens.update({
        where: { id: lensId },
        data: { quantity: { increment: Math.round(quantity) } },
      });
      return;
    case "PROGRESSIVE":
      await tx.progressiveLens.update({
        where: { id: lensId },
        data: { quantity: { increment: Math.round(quantity) } },
      });
      return;
    case "ORI_VISION":
      await tx.oriVisionLens.update({
        where: { id: lensId },
        data: { quantity: { increment: Math.round(quantity) } },
      });
      return;
    case "MAGNUS":
      await tx.magnusLens.update({
        where: { id: lensId },
        data: { quantity: { increment: Math.round(quantity) } },
      });
      return;
    case "BIFOCAL":
      await tx.bifocalLens.update({
        where: { id: lensId },
        data: { quantity: { increment: Math.round(quantity) } },
      });
      return;
  }
}

export async function createCreditNoteForReturn(
  tx: Prisma.TransactionClient,
  input: {
    returnRequestId: string;
    invoiceId?: string | null;
    userId: string;
    amount: number;
    reason?: string | null;
  }
) {
  const transaction = await tx.transaction.create({
    data: {
      reference: `RET-CREDIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      amount: input.amount,
      type: TransactionType.DEBIT,
      status: TransactionStatus.COMPLETED,
      description: input.reason ?? "Return request credit note",
      userId: input.userId,
      ledgerEntries: {
        create: {
          entryType: LedgerEntryType.DEBIT,
          amount: input.amount,
          description: input.reason ?? "Return request credit note",
        },
      },
    },
  });

  let taxableAmount = input.amount;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (input.invoiceId) {
    const inv = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
    if (inv && Number(inv.amount) > 0) {
      const ratio = input.amount / Number(inv.amount);
      taxableAmount = Math.round(Number(inv.taxableAmount) * ratio * 100) / 100;
      cgstAmount = Math.round(Number(inv.cgstAmount) * ratio * 100) / 100;
      sgstAmount = Math.round(Number(inv.sgstAmount) * ratio * 100) / 100;
      igstAmount = Math.round(Number(inv.igstAmount) * ratio * 100) / 100;

      const amountPaid = Number(inv.amountPaid);
      const newOutstanding = Math.max(
        0,
        Math.round((Number(inv.amountOutstanding) - input.amount) * 100) / 100
      );
      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          amountOutstanding: newOutstanding,
          status:
            newOutstanding <= 0.009 && amountPaid + input.amount >= Number(inv.amount)
              ? "PAID"
              : newOutstanding < Number(inv.amount)
                ? "PARTIALLY_PAID"
                : inv.status,
        },
      });
    }
  }

  const creditNote = await asReturnsDb(tx).creditNote.create({
    data: {
      creditNoteNumber: buildCreditNoteNumber(),
      returnRequestId: input.returnRequestId,
      invoiceId: input.invoiceId ?? null,
      userId: input.userId,
      amount: input.amount,
      taxableAmount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      reason: input.reason ?? null,
    },
  });

  const last = await tx.customerLedgerEntry.findFirst({
    where: { customerId: input.userId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
  });
  const balanceAfter =
    Math.round((Number(last?.balanceAfter ?? 0) - input.amount) * 100) / 100;
  await tx.customerLedgerEntry.create({
    data: {
      customerId: input.userId,
      entryType: "CREDIT_NOTE",
      debitAmount: 0,
      creditAmount: input.amount,
      balanceAfter,
      description: `Credit note ${creditNote.creditNoteNumber}`,
      creditNoteId: creditNote.id,
      invoiceId: input.invoiceId ?? undefined,
    },
  });

  return { transaction, creditNote };
}

export async function getReturnRequestWithRelations(id: string) {
  return asReturnsDb(prisma).returnRequest.findUnique({
    where: { id },
    include: {
      customer: {
        select: { id: true, name: true, email: true, businessName: true, role: true },
      },
      assignedEmployee: {
        select: { id: true, name: true, email: true, role: true },
      },
      reviewedByAdmin: {
        select: { id: true, name: true, email: true, role: true },
      },
      primaryOrder: {
        include: {
          singleVisionLens: true,
          kryptokLens: true,
          progressiveLens: true,
        },
      },
      primaryInvoice: true,
      items: true,
      images: {
        include: {
          uploadedBy: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      timelineEvents: {
        include: {
          actorUser: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      creditNote: true,
      inventoryMovements: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundQuarter(value: number): number {
  return Math.round(value / 0.25) * 0.25;
}

function optionsInclude(options: number[], value: number): boolean {
  const rounded = roundQuarter(value);
  return options.some((option) => Math.abs(option - rounded) < 0.001);
}

function generateAddOptions(): number[] {
  const options: number[] = [];
  for (let current = 1; current <= 3 + 0.001; current = roundQuarter(current + 0.25)) {
    options.push(roundQuarter(current));
  }
  return options;
}

export type OrderPowerSnapshot = {
  sph: number | null;
  cyl: number | null;
  axis: number | null;
  add: number | null;
};

export function getOrderPowerSnapshot(order: {
  sph?: unknown;
  cyl?: unknown;
  axis?: number | null;
  add?: unknown;
  singleVisionLens?: { sph?: unknown; cyl?: unknown } | null;
  kryptokLens?: {
    sph?: unknown;
    cyl?: unknown;
    axis?: number | null;
    add?: unknown;
  } | null;
  progressiveLens?: {
    sph?: unknown;
    cyl?: unknown;
    axis?: number | null;
    add?: unknown;
  } | null;
}): OrderPowerSnapshot {
  const catalog =
    order.progressiveLens ?? order.kryptokLens ?? order.singleVisionLens ?? null;
  return {
    sph: toNullableNumber(order.sph ?? catalog?.sph),
    cyl: toNullableNumber(order.cyl ?? catalog?.cyl),
    axis:
      order.axis ??
      order.progressiveLens?.axis ??
      order.kryptokLens?.axis ??
      null,
    add: toNullableNumber(
      order.add ?? order.progressiveLens?.add ?? order.kryptokLens?.add
    ),
  };
}

export function parseRequestedPowerInput(item: {
  requestedSph?: unknown;
  requestedCyl?: unknown;
  requestedAxis?: unknown;
  requestedAdd?: unknown;
}): OrderPowerSnapshot {
  const axisRaw = item.requestedAxis;
  const axis =
    axisRaw === null || axisRaw === undefined || axisRaw === ""
      ? null
      : Number(axisRaw);
  return {
    sph: toNullableNumber(item.requestedSph),
    cyl: toNullableNumber(item.requestedCyl),
    axis: Number.isFinite(axis) ? Math.trunc(axis as number) : null,
    add: toNullableNumber(item.requestedAdd),
  };
}

/** Load catalog selectable power range for an order's product, if any. */
export async function getSelectableRangeForOrder(order: {
  lensType: LensType;
  singleVisionLensId?: string | null;
  kryptokLensId?: string | null;
  progressiveLensId?: string | null;
}): Promise<{ sph: number[]; cyl: number[] | null; supportsAdd: boolean } | null> {
  const {
    applyCompoundNoPlano,
    computeSelectableRange,
    computeSelectableRangesForLenses,
    computeSelectableRangesForLensGroups,
    kryptokProductKey,
    progressiveProductKey,
  } = await import("./lens-power-range");
  const {
    findKryptokSiblings,
    findProgressiveSiblings,
    findSingleVisionSiblings,
  } = await import("./related-lenses");

  if (order.lensType === "SINGLE_VISION" && order.singleVisionLensId) {
    const { lens, siblings } = await findSingleVisionSiblings(order.singleVisionLensId);
    if (!lens) return null;
    const rangeById = computeSelectableRangesForLenses(siblings);
    const range = rangeById.get(lens.id) ?? computeSelectableRange(lens, siblings);
    return {
      sph: range.sph.options,
      cyl: range.cyl?.options ?? null,
      supportsAdd: false,
    };
  }

  if (order.lensType === "KRYPTOK" && order.kryptokLensId) {
    const { lens, siblings } = await findKryptokSiblings(order.kryptokLensId);
    if (!lens) return null;
    const rangeById = computeSelectableRangesForLensGroups(siblings, kryptokProductKey);
    const range = applyCompoundNoPlano(
      lens,
      rangeById.get(lens.id) ?? computeSelectableRange(lens, siblings)
    );
    return {
      sph: range.sph.options,
      cyl: range.cyl?.options ?? null,
      supportsAdd: true,
    };
  }

  if (order.lensType === "PROGRESSIVE" && order.progressiveLensId) {
    const { lens, siblings } = await findProgressiveSiblings(order.progressiveLensId);
    if (!lens) return null;
    const rangeById = computeSelectableRangesForLensGroups(
      siblings,
      progressiveProductKey
    );
    const range = applyCompoundNoPlano(
      lens,
      rangeById.get(lens.id) ?? computeSelectableRange(lens, siblings)
    );
    return {
      sph: range.sph.options,
      cyl: range.cyl?.options ?? null,
      supportsAdd: true,
    };
  }

  return null;
}

/**
 * Validate / normalize replacement power against the product catalog range.
 * Returns null when the product has no catalog range (Rx / color / custom).
 */
export async function resolveReplacementPowerForOrder(
  order: {
    lensType: LensType;
    singleVisionLensId?: string | null;
    kryptokLensId?: string | null;
    progressiveLensId?: string | null;
    sph?: unknown;
    cyl?: unknown;
    axis?: number | null;
    add?: unknown;
    singleVisionLens?: { sph?: unknown; cyl?: unknown } | null;
    kryptokLens?: {
      sph?: unknown;
      cyl?: unknown;
      axis?: number | null;
      add?: unknown;
    } | null;
    progressiveLens?: {
      sph?: unknown;
      cyl?: unknown;
      axis?: number | null;
      add?: unknown;
    } | null;
  },
  requested: OrderPowerSnapshot,
  options?: { required?: boolean }
): Promise<OrderPowerSnapshot | null> {
  const original = getOrderPowerSnapshot(order);
  const range = await getSelectableRangeForOrder(order);
  if (!range) {
    if (options?.required) {
      throw new Error(
        "Replacement power selection is only available for catalog products."
      );
    }
    return null;
  }

  const sph = requested.sph ?? original.sph;
  if (sph === null || !optionsInclude(range.sph, sph)) {
    throw new Error("Selected SPH is outside this product's available power range.");
  }

  let cyl: number | null = requested.cyl ?? original.cyl;
  if (range.cyl && range.cyl.length > 0) {
    if (cyl === null || !optionsInclude(range.cyl, cyl)) {
      throw new Error("Selected CYL is outside this product's available power range.");
    }
  } else {
    cyl = null;
  }

  let add: number | null = requested.add ?? original.add;
  if (range.supportsAdd) {
    const addOptions = generateAddOptions();
    if (add === null || !optionsInclude(addOptions, add)) {
      throw new Error("Selected ADD is outside the allowed +1.00 to +3.00 range.");
    }
  } else {
    add = null;
  }

  return {
    sph: roundQuarter(sph),
    cyl: cyl === null ? null : roundQuarter(cyl),
    axis: requested.axis ?? original.axis,
    add: add === null ? null : roundQuarter(add),
  };
}

export function serializeReturnItemPowers(item: {
  originalSph?: unknown;
  originalCyl?: unknown;
  originalAxis?: number | null;
  originalAdd?: unknown;
  requestedSph?: unknown;
  requestedCyl?: unknown;
  requestedAxis?: number | null;
  requestedAdd?: unknown;
  [key: string]: unknown;
}) {
  return {
    ...item,
    quantity: Number(item.quantity),
    originalSph: toNullableNumber(item.originalSph),
    originalCyl: toNullableNumber(item.originalCyl),
    originalAxis: item.originalAxis ?? null,
    originalAdd: toNullableNumber(item.originalAdd),
    requestedSph: toNullableNumber(item.requestedSph),
    requestedCyl: toNullableNumber(item.requestedCyl),
    requestedAxis: item.requestedAxis ?? null,
    requestedAdd: toNullableNumber(item.requestedAdd),
  };
}
