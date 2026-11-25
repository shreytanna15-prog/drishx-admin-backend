import {
  InvoiceStatus,
  LedgerEntryType,
  LensType,
  Prisma,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";

import { prisma } from "./prisma";
import { postCustomerLedgerCreditNote } from "./finance/customer-ledger";
import { lockInvoicesForUpdate } from "./finance/invoice-locks";
import { nextCreditNoteNumber } from "./finance/invoice-number";
import { roundMoney } from "./finance/tax-calc";
import { invoiceStatusAfterCreditApplication } from "./return-credit";

export { ReturnRequestStatus } from "./return-request-status";

export const ReturnRequestType = {
  RETURN: "RETURN",
  REPLACEMENT: "REPLACEMENT",
} as const;
export type ReturnRequestType =
  (typeof ReturnRequestType)[keyof typeof ReturnRequestType];

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
  STOCK_CORRECTED: "STOCK_CORRECTED",
} as const;
export type ReturnTimelineEventType =
  (typeof ReturnTimelineEventType)[keyof typeof ReturnTimelineEventType];

/** Order fields staff need on returns list/detail (aligned with Orders table). */
const returnOrderContextSelect = {
  id: true,
  orderNumber: true,
  status: true,
  lineType: true,
  lensType: true,
  quantity: true,
  unitPrice: true,
  totalAmount: true,
  notes: true,
  sph: true,
  cyl: true,
  axis: true,
  add: true,
  eye: true,
  createdAt: true,
  user: {
    select: { id: true, name: true, email: true, businessName: true },
  },
  assignedTo: {
    select: { id: true, name: true, email: true },
  },
  singleVisionLens: {
    select: { brand: true, coating: true, item: true },
  },
  kryptokLens: {
    select: { brand: true, coating: true, item: true },
  },
  progressiveLens: {
    select: { brand: true, coating: true, item: true },
  },
} as const;

const returnRequestDetailInclude = {
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
    select: returnOrderContextSelect,
  },
  primaryInvoice: true,
  items: {
    include: {
      originalOrder: {
        select: returnOrderContextSelect,
      },
    },
  },
  images: {
    include: {
      uploadedBy: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  timelineEvents: {
    include: {
      actorUser: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  creditNote: {
    include: {
      allocations: {
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              orderId: true,
            },
          },
        },
        orderBy: { createdAt: "asc" as const },
      },
    },
  },
  inventoryMovements: {
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export type ReturnRequestWithRelations = Prisma.ReturnRequestGetPayload<{
  include: typeof returnRequestDetailInclude;
}>;

/** Narrow accessor for return models when the editor TS server lags behind prisma generate. */
function asReturnsDb<T>(client: T) {
  return client as T & {
    returnRequest: {
      findUnique: (args: {
        where: { id: string };
        include?: typeof returnRequestDetailInclude;
      }) => Promise<ReturnRequestWithRelations | null>;
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

/** @deprecated Prefer nextCreditNoteNumber inside the creating transaction. */
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
    userId: string;
    amount: number;
    reason?: string | null;
    /**
     * Per-invoice applications. Outstanding is reduced on every listed invoice;
     * CreditNoteAllocation rows are persisted atomically (Phase 4A).
     * CreditNote.invoiceId remains the primary/first allocation for legacy readers.
     * Historical CNs without allocation rows stay valid (no backfill).
     */
    allocations: Array<{
      invoiceId: string;
      amount: number;
      taxableAmount: number;
      cgstAmount: number;
      sgstAmount: number;
      igstAmount: number;
    }>;
    /** Preferred invoice FK on the credit note (e.g. primary invoice). */
    primaryInvoiceId?: string | null;
  }
) {
  const existingCn = await tx.creditNote.findUnique({
    where: { returnRequestId: input.returnRequestId },
    select: { id: true },
  });
  if (existingCn) {
    throw new Error("A credit note already exists for this return request.");
  }

  const amount = roundMoney(Number(input.amount) || 0);
  if (!(amount > 0.009) || input.allocations.length === 0) {
    throw new Error("Credit note requires a positive amount and invoice allocations.");
  }

  const allocTotal = roundMoney(
    input.allocations.reduce((s, a) => s + Number(a.amount), 0)
  );
  if (Math.abs(allocTotal - amount) > 0.009) {
    throw new Error("Credit allocations must sum to the approved credit amount.");
  }

  // Deduplicate invoice ids — unique(creditNoteId, invoiceId) would fail otherwise.
  const seenInvoice = new Set<string>();
  for (const alloc of input.allocations) {
    if (seenInvoice.has(alloc.invoiceId)) {
      throw new Error("Duplicate invoice in credit allocations.");
    }
    seenInvoice.add(alloc.invoiceId);
  }

  // Deterministic invoice row locks before outstanding re-read (payment↔credit races).
  await lockInvoicesForUpdate(
    tx,
    input.allocations.map((a) => a.invoiceId)
  );

  // Re-validate outstanding inside the transaction after FOR UPDATE.
  for (const alloc of input.allocations) {
    const inv = await tx.invoice.findUnique({ where: { id: alloc.invoiceId } });
    if (!inv) {
      throw new Error(`Invoice not found for credit allocation: ${alloc.invoiceId}`);
    }
    const outstanding = roundMoney(Number(inv.amountOutstanding) || 0);
    const apply = roundMoney(Number(alloc.amount) || 0);
    if (apply > outstanding + 0.009) {
      throw new Error(
        `Cannot apply ₹${apply.toFixed(2)} to invoice ${inv.invoiceNumber}: outstanding is ₹${outstanding.toFixed(2)}. Refunds for paid invoices are not supported.`
      );
    }
    const newOutstanding = roundMoney(Math.max(0, outstanding - apply));
    const nextStatus = invoiceStatusAfterCreditApplication({
      invoiceAmount: Number(inv.amount),
      amountOutstandingAfter: newOutstanding,
      previousStatus: inv.status,
    });
    await tx.invoice.update({
      where: { id: inv.id },
      data: {
        amountOutstanding: newOutstanding,
        status: nextStatus as InvoiceStatus,
      },
    });
  }

  const taxableAmount = roundMoney(
    input.allocations.reduce((s, a) => s + Number(a.taxableAmount), 0)
  );
  const cgstAmount = roundMoney(
    input.allocations.reduce((s, a) => s + Number(a.cgstAmount), 0)
  );
  const sgstAmount = roundMoney(
    input.allocations.reduce((s, a) => s + Number(a.sgstAmount), 0)
  );
  const igstAmount = roundMoney(
    input.allocations.reduce((s, a) => s + Number(a.igstAmount), 0)
  );

  const primaryInvoiceId =
    input.primaryInvoiceId &&
    input.allocations.some((a) => a.invoiceId === input.primaryInvoiceId)
      ? input.primaryInvoiceId
      : input.allocations[0]!.invoiceId;

  const transaction = await tx.transaction.create({
    data: {
      reference: `RET-CREDIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      amount,
      type: TransactionType.DEBIT,
      status: TransactionStatus.COMPLETED,
      description: input.reason ?? "Return request credit note",
      userId: input.userId,
      ledgerEntries: {
        create: {
          entryType: LedgerEntryType.DEBIT,
          amount,
          description: input.reason ?? "Return request credit note",
        },
      },
    },
  });

  const { number: creditNoteNumber } = await nextCreditNoteNumber(undefined, tx);

  // Nested allocations require generated client; cast keeps editor usable pre-generate.
  const creditNoteDb = tx as Prisma.TransactionClient & {
    creditNote: {
      create: (args: {
        data: Record<string, unknown>;
        include?: { allocations: boolean };
      }) => Promise<{
        id: string;
        creditNoteNumber: string;
        amount: unknown;
        taxableAmount: unknown;
        allocations: Array<{
          id: string;
          invoiceId: string;
          amount: unknown;
          taxableAmount: unknown;
          cgstAmount: unknown;
          sgstAmount: unknown;
          igstAmount: unknown;
        }>;
      }>;
    };
  };

  const creditNote = await creditNoteDb.creditNote.create({
    data: {
      creditNoteNumber,
      returnRequestId: input.returnRequestId,
      invoiceId: primaryInvoiceId,
      userId: input.userId,
      amount,
      taxableAmount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      reason: input.reason ?? null,
      allocations: {
        create: input.allocations.map((a) => ({
          invoiceId: a.invoiceId,
          amount: roundMoney(Number(a.amount)),
          taxableAmount: roundMoney(Number(a.taxableAmount)),
          cgstAmount: roundMoney(Number(a.cgstAmount)),
          sgstAmount: roundMoney(Number(a.sgstAmount)),
          igstAmount: roundMoney(Number(a.igstAmount)),
        })),
      },
    },
    include: { allocations: true },
  });

  await postCustomerLedgerCreditNote({
    customerId: input.userId,
    creditNoteId: creditNote.id,
    invoiceId: primaryInvoiceId,
    amount,
    description: `Credit note ${creditNote.creditNoteNumber}`,
    tx,
  });

  return { transaction, creditNote };
}

export async function getReturnRequestWithRelations(id: string) {
  return asReturnsDb(prisma).returnRequest.findUnique({
    where: { id },
    include: returnRequestDetailInclude,
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

export function serializeReturnOrderContext(order: {
  id: string;
  orderNumber?: number | null;
  status: string;
  lineType: string;
  lensType: string;
  quantity: unknown;
  unitPrice: unknown;
  totalAmount: unknown;
  notes?: string | null;
  sph?: unknown;
  cyl?: unknown;
  axis?: number | null;
  add?: unknown;
  eye?: string | null;
  createdAt: Date | string;
  user?: {
    id: string;
    name: string | null;
    email: string;
    businessName?: string | null;
  } | null;
  assignedTo?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  singleVisionLens?: {
    brand?: string | null;
    coating?: string | null;
    item?: string | null;
  } | null;
  kryptokLens?: {
    brand?: string | null;
    coating?: string | null;
    item?: string | null;
  } | null;
  progressiveLens?: {
    brand?: string | null;
    coating?: string | null;
    item?: string | null;
  } | null;
} | null) {
  if (!order) return null;
  return {
    id: order.id,
    orderNumber: order.orderNumber ?? null,
    status: order.status,
    lineType: order.lineType,
    lensType: order.lensType,
    quantity: Number(order.quantity),
    unitPrice: Number(order.unitPrice),
    totalAmount: Number(order.totalAmount),
    notes: order.notes ?? null,
    sph: toNullableNumber(order.sph),
    cyl: toNullableNumber(order.cyl),
    axis: order.axis ?? null,
    add: toNullableNumber(order.add),
    eye: order.eye ?? null,
    createdAt:
      typeof order.createdAt === "string"
        ? order.createdAt
        : order.createdAt.toISOString(),
    user: order.user
      ? {
          id: order.user.id,
          name: order.user.name,
          email: order.user.email,
          businessName: order.user.businessName ?? null,
        }
      : null,
    assignedTo: order.assignedTo
      ? {
          id: order.assignedTo.id,
          name: order.assignedTo.name,
          email: order.assignedTo.email,
        }
      : null,
    singleVisionLens: order.singleVisionLens ?? null,
    kryptokLens: order.kryptokLens ?? null,
    progressiveLens: order.progressiveLens ?? null,
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
  originalOrder?: Parameters<typeof serializeReturnOrderContext>[0];
  [key: string]: unknown;
}) {
  const { originalOrder, ...rest } = item;
  return {
    ...rest,
    quantity: Number(item.quantity),
    originalSph: toNullableNumber(item.originalSph),
    originalCyl: toNullableNumber(item.originalCyl),
    originalAxis: item.originalAxis ?? null,
    originalAdd: toNullableNumber(item.originalAdd),
    requestedSph: toNullableNumber(item.requestedSph),
    requestedCyl: toNullableNumber(item.requestedCyl),
    requestedAxis: item.requestedAxis ?? null,
    requestedAdd: toNullableNumber(item.requestedAdd),
    originalOrder: serializeReturnOrderContext(originalOrder ?? null),
  };
}
