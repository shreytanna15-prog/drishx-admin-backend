import {
  GoodsReceiptLineStatus,
  GoodsReceiptStatus,
  LensType,
  Prisma,
  PurchaseBillStatus,
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
import { readLensRow, type DbClient } from "./procurement-lens";
import { receiveStockLine } from "./stock-intake";
import { getFinancialYear } from "./finance/financial-year";
import { isReceivablePoStatus, openPoLineOutstanding } from "./purchase-order-math";
import {
  isCloseOutstandingReason,
  isRangeResolution,
  nextPoStatusAfterReceipt,
  reconcileBillRanges,
  reconcilePowerReceipt,
  receiptConfirmBlockers,
  unresolvedRangeMismatches,
  type BillRangeInput,
  type CloseOutstandingReason,
} from "./purchase-order-receive-math";
import { parseReceiveExcelBuffer, type ParsedExcelDelivery } from "./purchase-order-excel";
import {
  displayDocumentName,
  persistDocumentsThenRecord,
  validateProcurementDocument,
  type DocumentStorage,
  type ProcurementDocKind,
} from "./procurement-documents";
import { buildProcurementObjectPath } from "./procurement-storage";
import { lockPurchaseOrder } from "./purchase-orders";
import {
  receiveLineAllocations,
  reverseLineAllocations,
} from "./purchase-order-allocations";

export class GoodsReceiptError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "GRN_ERROR") {
    super(message);
    this.name = "GoodsReceiptError";
    this.status = status;
    this.code = code;
  }
}

function resolveActor(actor?: AuditActor): AuditActor {
  return actor ?? systemActor();
}

async function nextGrnPublicId(): Promise<string> {
  const year = new Date().getFullYear();
  const seqId = `GRN:${year}`;
  const seq = await prisma.$transaction(async (tx) => {
    const existing = await tx.invoiceSequence.findUnique({ where: { id: seqId } });
    if (!existing) {
      await tx.invoiceSequence.create({
        data: { id: seqId, financialYear: String(year), prefix: "GRN", nextValue: 2 },
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
  return `GRN-${year}-${String(seq).padStart(6, "0")}`;
}

/**
 * Purchase bill number allocated inside the confirm transaction, so a failed
 * confirm never burns a bill number (same series as finance purchase bills).
 */
async function nextPurchaseBillNumberTx(tx: DbClient): Promise<{
  number: string;
  financialYear: string;
}> {
  const settings = await tx.companyFinanceSettings.findUnique({
    where: { id: "default" },
    select: { purchaseBillPrefix: true },
  });
  const prefix = settings?.purchaseBillPrefix || "PB";
  const financialYear = getFinancialYear(new Date());
  const row = await tx.invoiceSequence.upsert({
    where: { id: `${prefix}:${financialYear}` },
    create: { id: `${prefix}:${financialYear}`, financialYear, prefix, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  const seq = row.nextValue - 1;
  return {
    number: `${prefix}/${financialYear}/${String(seq).padStart(6, "0")}`,
    financialYear,
  };
}

const receiptInclude = {
  lines: { orderBy: { createdAt: "asc" as const } },
  billSummaries: { orderBy: { createdAt: "asc" as const } },
  purchaseOrder: {
    select: {
      id: true,
      publicId: true,
      status: true,
      supplierId: true,
      warehouseCode: true,
      supplier: { select: { id: true, name: true } },
    },
  },
  purchaseBill: {
    select: { id: true, billNumber: true, status: true, totalAmount: true },
  },
} satisfies Prisma.GoodsReceiptInclude;

export type GoodsReceiptDetail = Prisma.GoodsReceiptGetPayload<{
  include: typeof receiptInclude;
}>;

export async function getGoodsReceipt(id: string, client: DbClient = prisma) {
  return client.goodsReceipt.findUnique({
    where: { id },
    include: receiptInclude,
  });
}

export async function listGoodsReceiptsForPo(purchaseOrderId: string) {
  return prisma.goodsReceipt.findMany({
    where: { purchaseOrderId },
    orderBy: { createdAt: "desc" },
    include: {
      lines: { select: { acceptedQuantity: true, lineStatus: true } },
      purchaseBill: { select: { id: true, billNumber: true, status: true } },
    },
  });
}

function aggregateExcelByRange(rows: ParsedExcelDelivery[]) {
  return rows.map((r) => ({
    productLabel: r.productLabel || r.lensType,
    rangeLabel: r.rangeLabel,
    quantity: r.deliveredQuantity,
  }));
}

export type ReceiptUploadFile = {
  buffer: Uint8Array;
  fileName: string | null;
};

export type ReceiptShipmentInput = {
  courier?: string | null;
  awb?: string | null;
  dispatchDate?: Date | null;
  packageCount?: number | null;
  notes?: string | null;
};

/** Validate human-entered bill range totals. */
export function parseBillSummaries(raw: unknown): BillRangeInput[] {
  if (raw == null || raw === "") return [];
  if (!Array.isArray(raw)) {
    throw new GoodsReceiptError("billSummaries must be an array.", 400, "BILL_SUMMARY_INVALID");
  }
  if (raw.length > 500) {
    throw new GoodsReceiptError("Too many bill summary rows (max 500).", 400, "BILL_SUMMARY_INVALID");
  }
  return raw.map((row, i) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const productLabel = typeof r.productLabel === "string" ? r.productLabel.trim() : "";
    const billQuantity = Number(r.billQuantity);
    if (!productLabel || productLabel.length > 200) {
      throw new GoodsReceiptError(`Bill row ${i + 1}: product is required.`, 400, "BILL_SUMMARY_INVALID");
    }
    if (!Number.isInteger(billQuantity) || billQuantity < 0 || billQuantity > 1_000_000) {
      throw new GoodsReceiptError(
        `Bill row ${i + 1}: quantity must be a whole number ≥ 0.`,
        400,
        "BILL_SUMMARY_INVALID"
      );
    }
    const rangeLabel =
      typeof r.rangeLabel === "string" && r.rangeLabel.trim() ? r.rangeLabel.trim() : null;
    return { productLabel, rangeLabel, billQuantity };
  });
}

function normalizeShipment(input: ReceiptShipmentInput | undefined): ReceiptShipmentInput {
  const text = (value: string | null | undefined, max: number, label: string) => {
    const trimmed = value?.trim() || null;
    if (trimmed && trimmed.length > max) {
      throw new GoodsReceiptError(`${label} is too long (max ${max}).`, 400, "SHIPMENT_INVALID");
    }
    return trimmed;
  };
  const packageCount = input?.packageCount ?? null;
  if (packageCount != null && (!Number.isInteger(packageCount) || packageCount < 0 || packageCount > 100_000)) {
    throw new GoodsReceiptError("Package count must be a whole number ≥ 0.", 400, "SHIPMENT_INVALID");
  }
  const dispatchDate = input?.dispatchDate ?? null;
  if (dispatchDate && Number.isNaN(dispatchDate.getTime())) {
    throw new GoodsReceiptError("Dispatch date is invalid.", 400, "SHIPMENT_INVALID");
  }
  return {
    courier: text(input?.courier, 120, "Courier"),
    awb: text(input?.awb, 120, "AWB / tracking"),
    notes: text(input?.notes, 1000, "Notes"),
    packageCount,
    dispatchDate,
  };
}

/**
 * Create a draft GRN from the supplier bill + power-wise Excel.
 *
 * Both documents are REQUIRED and are persisted to private storage before the
 * receipt row is written; a storage failure returns a clear error and nothing
 * is created (uploaded objects are removed). Never mutates stock.
 */
export async function createGoodsReceiptWithDocuments(input: {
  purchaseOrderId: string;
  excel: ReceiptUploadFile;
  bill: ReceiptUploadFile;
  billSummaries?: BillRangeInput[];
  shipment?: ReceiptShipmentInput;
  lineActions?: Record<string, string | undefined>;
  storage: DocumentStorage;
  actor?: AuditActor;
  request?: AuditRequestContext | null;
}): Promise<GoodsReceiptDetail> {
  const excelType = validateProcurementDocument({ kind: "excel", ...input.excel });
  const billType = validateProcurementDocument({ kind: "bill", ...input.bill });
  const shipment = normalizeShipment(input.shipment);

  // Fail fast before uploading anything.
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: input.purchaseOrderId },
    select: { id: true, publicId: true, status: true },
  });
  if (!po) throw new GoodsReceiptError("Purchase order not found.", 404, "PO_NOT_FOUND");
  if (!isReceivablePoStatus(po.status)) {
    throw new GoodsReceiptError(
      "Only approved, open purchase orders can receive goods.",
      409,
      "PO_NOT_RECEIVABLE"
    );
  }

  const parsed = await parseReceiveExcelBuffer(Buffer.from(input.excel.buffer));
  if (parsed.errors.length) {
    const shown = parsed.errors.slice(0, 8).join(" ");
    const more = parsed.errors.length > 8 ? ` (+${parsed.errors.length - 8} more)` : "";
    throw new GoodsReceiptError(`${shown}${more}`, 400, "EXCEL_INVALID");
  }

  const publicId = await nextGrnPublicId();
  const createdById = input.actor?.actorUserId ?? null;
  const documents = (
    [
      ["excel", input.excel, excelType],
      ["bill", input.bill, billType],
    ] as const
  ).map(([kind, file, type]) => ({
    kind: kind as ProcurementDocKind,
    buffer: file.buffer,
    mimeType: type.mimeType,
    fileName: displayDocumentName(file.fileName, type.extension),
    objectPath: buildProcurementObjectPath({
      scope: "purchase-orders",
      ownerId: po.id,
      kind,
      fileName: file.fileName,
      extension: type.extension,
    }),
  }));

  const created = await persistDocumentsThenRecord({
    storage: input.storage,
    documents,
    onCleanupError: (error, paths) =>
      console.error("Orphaned procurement documents could not be removed:", paths, error),
    writeRecord: async (persisted) => {
      const excelDoc = persisted.find((d) => d.kind === "excel")!;
      const billDoc = persisted.find((d) => d.kind === "bill")!;
      return prisma.$transaction(async (tx) => {
        await lockPurchaseOrder(tx, po.id);
        const fresh = await tx.purchaseOrder.findUnique({
          where: { id: po.id },
          include: { lines: { orderBy: { lineNumber: "asc" } } },
        });
        if (!fresh || !isReceivablePoStatus(fresh.status)) {
          throw new GoodsReceiptError(
            "The purchase order is no longer open for receiving.",
            409,
            "PO_NOT_RECEIVABLE"
          );
        }
        const { lines, totals } = reconcilePowerReceipt({
          poLines: fresh.lines.map((l) => ({
            id: l.id,
            lensType: l.lensType,
            lensId: l.lensId,
            poQuantity: l.poQuantity,
            receivedQuantity: l.receivedQuantity,
            cancelledQuantity: l.cancelledQuantity,
            productLabel: l.productLabel,
            rangeLabel: l.rangeLabel,
            powerLabel: l.powerLabel,
          })),
          deliveries: parsed.rows,
          actions: input.lineActions,
        });
        const rangeRows = reconcileBillRanges({
          billRows: input.billSummaries ?? [],
          excelByRange: aggregateExcelByRange(parsed.rows),
        });

        return tx.goodsReceipt.create({
          data: {
            publicId,
            purchaseOrderId: fresh.id,
            status: totals.errorCount > 0 ? GoodsReceiptStatus.DRAFT : GoodsReceiptStatus.VALIDATED,
            warehouseCode: fresh.warehouseCode,
            supplierId: fresh.supplierId,
            courier: shipment.courier,
            awb: shipment.awb,
            dispatchDate: shipment.dispatchDate,
            packageCount: shipment.packageCount,
            notes: shipment.notes,
            billStoragePath: billDoc.objectPath,
            billFileName: billDoc.fileName,
            billMimeType: billDoc.mimeType,
            excelStoragePath: excelDoc.objectPath,
            excelFileName: excelDoc.fileName,
            excelMimeType: excelDoc.mimeType,
            createdById,
            lines: {
              create: lines.map((line) => ({
                purchaseOrderLineId: line.purchaseOrderLineId,
                lensType: (line.lensType as LensType | null) ?? null,
                lensId: line.lensId,
                productLabel: line.productLabel,
                rangeLabel: line.rangeLabel,
                powerLabel: line.powerLabel,
                orderedQuantity: line.orderedQuantity,
                previouslyReceived: line.previouslyReceived,
                outstandingBefore: line.outstandingBefore,
                deliveredQuantity: line.deliveredQuantity,
                acceptedQuantity: line.acceptedQuantity,
                damagedQuantity: line.damagedQuantity,
                shortQuantity: line.shortQuantity,
                excessQuantity: line.excessQuantity,
                lineStatus: line.lineStatus as GoodsReceiptLineStatus,
                actionCode: line.actionCode,
              })),
            },
            billSummaries: {
              create: rangeRows.map((row) => ({
                productLabel: row.productLabel,
                rangeLabel: row.rangeLabel,
                billQuantity: row.billQuantity,
                excelQuantity: row.excelQuantity,
                difference: row.difference,
                resolution: row.resolution,
              })),
            },
          },
          include: receiptInclude,
        });
      });
    },
  });

  await recordAuditEvent(prisma, {
    action: AuditAction.GOODS_RECEIPT_DRAFTED,
    module: AuditModule.INVENTORY,
    entityType: "GoodsReceipt",
    entityId: created.id,
    actor: resolveActor(input.actor),
    request: input.request ?? null,
    context: {
      publicId: created.publicId,
      poPublicId: po.publicId,
      billFile: created.billFileName ?? "",
      excelFile: created.excelFileName ?? "",
      warnings: String(parsed.warnings.length),
    },
    activityMessage: `Goods receipt ${created.publicId} drafted for ${po.publicId} (documents stored, no stock posted)`,
  });

  return created;
}

const LINE_ACTIONS = new Set(["KEEP_PENDING", "MARK_DAMAGED", "ACCEPT_SHORT", "REJECT_EXTRA"]);

export async function updateDraftReceiptLines(input: {
  goodsReceiptId: string;
  lineUpdates: Array<{
    id: string;
    acceptedQuantity?: number;
    damagedQuantity?: number;
    actionCode?: string | null;
  }>;
  billResolutions?: Array<{ id: string; resolution: string | null }>;
  actor?: AuditActor;
  request?: AuditRequestContext | null;
}): Promise<GoodsReceiptDetail> {
  const head = await prisma.goodsReceipt.findUnique({
    where: { id: input.goodsReceiptId },
    select: { purchaseOrderId: true },
  });
  if (!head) throw new GoodsReceiptError("Goods receipt not found.", 404, "GRN_NOT_FOUND");

  const updated = await prisma.$transaction(async (tx) => {
    await lockPurchaseOrder(tx, head.purchaseOrderId);
    const receipt = await tx.goodsReceipt.findUnique({
      where: { id: input.goodsReceiptId },
      include: { lines: true, billSummaries: true, purchaseOrder: { include: { lines: true } } },
    });
    if (!receipt) throw new GoodsReceiptError("Goods receipt not found.", 404, "GRN_NOT_FOUND");
    if (
      receipt.status !== GoodsReceiptStatus.DRAFT &&
      receipt.status !== GoodsReceiptStatus.VALIDATED
    ) {
      throw new GoodsReceiptError("Only draft receipts can be edited.", 409, "GRN_NOT_EDITABLE");
    }
    const poLineById = new Map(receipt.purchaseOrder.lines.map((l) => [l.id, l]));

    for (const upd of input.lineUpdates) {
      const line = receipt.lines.find((l) => l.id === upd.id);
      if (!line) {
        throw new GoodsReceiptError("Receipt line does not belong to this receipt.", 400, "GRN_LINE_INVALID");
      }
      if (upd.actionCode != null && !LINE_ACTIONS.has(upd.actionCode)) {
        throw new GoodsReceiptError("Unknown line action.", 400, "GRN_LINE_INVALID");
      }
      const damaged = upd.damagedQuantity != null ? Number(upd.damagedQuantity) : line.damagedQuantity;
      const accepted = upd.acceptedQuantity != null ? Number(upd.acceptedQuantity) : line.acceptedQuantity;
      if (!Number.isInteger(damaged) || damaged < 0 || !Number.isInteger(accepted) || accepted < 0) {
        throw new GoodsReceiptError("Quantities must be whole numbers ≥ 0.", 400, "GRN_LINE_INVALID");
      }
      if (damaged > line.deliveredQuantity) {
        throw new GoodsReceiptError(
          `Damaged quantity for ${line.powerLabel ?? line.lensId} exceeds delivered ${line.deliveredQuantity}.`,
          400,
          "GRN_LINE_INVALID"
        );
      }
      const poLine = line.purchaseOrderLineId ? poLineById.get(line.purchaseOrderLineId) : null;
      if (!poLine && accepted > 0) {
        throw new GoodsReceiptError(
          `${line.powerLabel ?? line.lensId ?? "This power"} is not on the purchase order and cannot be accepted.`,
          400,
          "GRN_LINE_INVALID"
        );
      }
      // Validate against live outstanding, not the snapshot taken at upload.
      const outstanding = poLine ? openPoLineOutstanding(poLine) : 0;
      if (accepted > outstanding) {
        throw new GoodsReceiptError(
          `Accepted quantity for ${line.powerLabel ?? line.lensId} exceeds outstanding ${outstanding}.`,
          400,
          "ACCEPT_EXCEEDS_OUTSTANDING"
        );
      }
      const netGood = line.deliveredQuantity - damaged;
      if (accepted > netGood) {
        throw new GoodsReceiptError(
          "Accepted quantity cannot exceed delivered minus damaged.",
          400,
          "GRN_LINE_INVALID"
        );
      }
      const short = Math.max(0, outstanding - accepted);
      const excess = Math.max(0, netGood - accepted);
      let lineStatus: GoodsReceiptLineStatus = GoodsReceiptLineStatus.MATCHED;
      if (!poLine) lineStatus = GoodsReceiptLineStatus.INVALID;
      else if (excess > 0) lineStatus = GoodsReceiptLineStatus.EXTRA;
      else if (short > 0) lineStatus = GoodsReceiptLineStatus.SHORT;
      else if (damaged > 0) lineStatus = GoodsReceiptLineStatus.DAMAGED;

      await tx.goodsReceiptLine.update({
        where: { id: line.id },
        data: {
          damagedQuantity: damaged,
          acceptedQuantity: accepted,
          outstandingBefore: outstanding,
          shortQuantity: short,
          excessQuantity: excess,
          lineStatus,
          actionCode: upd.actionCode === undefined ? line.actionCode : upd.actionCode,
        },
      });
    }

    for (const res of input.billResolutions ?? []) {
      if (!receipt.billSummaries.some((b) => b.id === res.id)) {
        throw new GoodsReceiptError("Bill summary row does not belong to this receipt.", 400, "BILL_SUMMARY_INVALID");
      }
      if (res.resolution !== null && !isRangeResolution(res.resolution)) {
        throw new GoodsReceiptError("Unknown range resolution.", 400, "BILL_SUMMARY_INVALID");
      }
      await tx.goodsReceiptBillSummary.update({
        where: { id: res.id },
        data: { resolution: res.resolution },
      });
    }

    await tx.goodsReceipt.update({
      where: { id: receipt.id },
      data: { status: GoodsReceiptStatus.VALIDATED },
    });
    return tx.goodsReceipt.findUniqueOrThrow({ where: { id: receipt.id }, include: receiptInclude });
  });

  await recordAuditEvent(prisma, {
    action: AuditAction.GOODS_RECEIPT_UPDATED,
    module: AuditModule.INVENTORY,
    entityType: "GoodsReceipt",
    entityId: updated.id,
    actor: resolveActor(input.actor),
    request: input.request ?? null,
    context: {
      publicId: updated.publicId,
      lineUpdates: String(input.lineUpdates.length),
      resolutions: String(input.billResolutions?.length ?? 0),
    },
    activityMessage: `Goods receipt ${updated.publicId} reconciliation saved (no stock posted)`,
  });

  return updated;
}

/** Discard a draft receipt. Documents stay in storage for the audit trail. */
export async function cancelDraftGoodsReceipt(input: {
  goodsReceiptId: string;
  actor?: AuditActor;
  request?: AuditRequestContext | null;
}): Promise<GoodsReceiptDetail> {
  const head = await prisma.goodsReceipt.findUnique({
    where: { id: input.goodsReceiptId },
    select: { purchaseOrderId: true },
  });
  if (!head) throw new GoodsReceiptError("Goods receipt not found.", 404, "GRN_NOT_FOUND");
  let changed = false;
  const result = await prisma.$transaction(async (tx) => {
    await lockPurchaseOrder(tx, head.purchaseOrderId);
    const receipt = await tx.goodsReceipt.findUniqueOrThrow({
      where: { id: input.goodsReceiptId },
      include: receiptInclude,
    });
    if (receipt.status === GoodsReceiptStatus.CANCELLED) return receipt;
    if (receipt.status === GoodsReceiptStatus.CONFIRMED) {
      throw new GoodsReceiptError("A confirmed receipt cannot be discarded.", 409, "GRN_CONFIRMED");
    }
    changed = true;
    return tx.goodsReceipt.update({
      where: { id: receipt.id },
      data: { status: GoodsReceiptStatus.CANCELLED },
      include: receiptInclude,
    });
  });
  if (changed) {
    await recordAuditEvent(prisma, {
      action: AuditAction.GOODS_RECEIPT_UPDATED,
      module: AuditModule.INVENTORY,
      entityType: "GoodsReceipt",
      entityId: result.id,
      actor: resolveActor(input.actor),
      request: input.request ?? null,
      context: { publicId: result.publicId, status: result.status },
      activityMessage: `Goods receipt ${result.publicId} discarded (no stock posted)`,
    });
  }
  return result;
}

/**
 * Confirm receipt — the ONLY place PO goods post to stock.
 *
 * Exactly-once: serialised on the PO row lock; the receipt status is re-read
 * after the lock, so a second confirm (same or different key) cannot post
 * again. The confirmation key is unique across receipts.
 */
export async function confirmGoodsReceipt(input: {
  goodsReceiptId: string;
  confirmationKey: string;
  actor?: AuditActor;
  request?: AuditRequestContext | null;
}): Promise<GoodsReceiptDetail> {
  const key = input.confirmationKey.trim();
  if (!key || key.length > 100) {
    throw new GoodsReceiptError("A valid confirmationKey is required.", 400, "CONFIRMATION_KEY_INVALID");
  }
  const actorUserId = input.actor?.actorUserId ?? null;
  if (!actorUserId) {
    throw new GoodsReceiptError("Authenticated actor required to confirm.", 401, "UNAUTHENTICATED");
  }

  const head = await prisma.goodsReceipt.findUnique({
    where: { id: input.goodsReceiptId },
    select: { id: true, purchaseOrderId: true },
  });
  if (!head) throw new GoodsReceiptError("Goods receipt not found.", 404, "GRN_NOT_FOUND");

  const keyOwner = await prisma.goodsReceipt.findUnique({
    where: { confirmationKey: key },
    select: { id: true },
  });
  if (keyOwner && keyOwner.id !== head.id) {
    throw new GoodsReceiptError(
      "confirmationKey already used by another receipt.",
      409,
      "CONFIRMATION_KEY_CONFLICT"
    );
  }

  let posted = false;
  let postedUnits = 0;
  let poPublicId = "";
  let nextStatus = "";
  let confirmed: GoodsReceiptDetail;
  try {
    confirmed = await prisma.$transaction(
      async (tx) => {
        await lockPurchaseOrder(tx, head.purchaseOrderId);
        const receipt = await tx.goodsReceipt.findUnique({
          where: { id: head.id },
          include: {
            lines: true,
            billSummaries: true,
            purchaseOrder: { include: { lines: true } },
          },
        });
        if (!receipt) throw new GoodsReceiptError("Goods receipt not found.", 404, "GRN_NOT_FOUND");

        if (receipt.status === GoodsReceiptStatus.CONFIRMED) {
          if (receipt.confirmationKey === key) {
            return tx.goodsReceipt.findUniqueOrThrow({ where: { id: receipt.id }, include: receiptInclude });
          }
          throw new GoodsReceiptError(
            "This receipt was already confirmed. Stock was posted once.",
            409,
            "ALREADY_CONFIRMED"
          );
        }
        const po = receipt.purchaseOrder;
        poPublicId = po.publicId;
        if (!isReceivablePoStatus(po.status)) {
          throw new GoodsReceiptError("Purchase order is not open for receiving.", 409, "PO_NOT_RECEIVABLE");
        }
        const blockers = receiptConfirmBlockers(receipt);
        if (blockers.length) {
          throw new GoodsReceiptError(blockers.join(" "), 409, "RECEIPT_NOT_READY");
        }

        const poLineById = new Map(po.lines.map((l) => [l.id, { ...l }]));
        const acceptedLines = receipt.lines.filter((l) => l.acceptedQuantity > 0);

        for (const line of acceptedLines) {
          const poLine = poLineById.get(line.purchaseOrderLineId!);
          if (!poLine || !line.lensType || !line.lensId) {
            throw new GoodsReceiptError("PO line missing for receipt line.", 409, "INVALID_LINE");
          }
          const outstanding = openPoLineOutstanding(poLine);
          if (line.acceptedQuantity > outstanding) {
            throw new GoodsReceiptError(
              `Accepted ${line.acceptedQuantity} exceeds outstanding ${outstanding} for ${line.powerLabel ?? line.lensId}.`,
              409,
              "ACCEPT_EXCEEDS_OUTSTANDING"
            );
          }

          const lensRow = await readLensRow(tx, line.lensType, line.lensId);
          if (!lensRow) {
            throw new GoodsReceiptError(`Lens ${line.lensType}/${line.lensId} not found.`, 400, "LENS_NOT_FOUND");
          }
          const sellingPrice = Number(lensRow.price);
          if (!(sellingPrice > 0)) {
            throw new GoodsReceiptError(
              `${line.productLabel ?? "Lens"} ${line.powerLabel ?? ""} has no selling price; set it before receiving.`,
              400,
              "LENS_PRICE_MISSING"
            );
          }

          await receiveStockLine({
            lensType: line.lensType,
            lensId: line.lensId,
            quantityAdded: line.acceptedQuantity,
            // Update cost only when the PO carries a rate; otherwise keep it.
            costPrice: poLine.rate != null ? Math.max(0, Number(poLine.rate)) : null,
            sellingPrice,
            actorUserId,
            referenceId: receipt.publicId,
            settleProcurementRequests: false,
            client: tx,
          });

          await tx.purchaseOrderLine.update({
            where: { id: poLine.id },
            data: { receivedQuantity: { increment: line.acceptedQuantity } },
          });
          poLine.receivedQuantity += line.acceptedQuantity;

          await receiveLineAllocations(tx, {
            purchaseOrderLineId: poLine.id,
            quantity: line.acceptedQuantity,
            poPublicId: po.publicId,
            receiptPublicId: receipt.publicId,
            actor: input.actor,
            request: input.request,
          });
          postedUnits += line.acceptedQuantity;
        }

        const status = nextPoStatusAfterReceipt([...poLineById.values()], {
          wasSent: Boolean(po.sentAt),
        });
        nextStatus = status;
        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { status: status as PurchaseOrderStatus },
        });
        if (status === "CLOSED") {
          // Fully received: release power locks so reorder may raise it again.
          await tx.openPurchaseOrderPower.deleteMany({ where: { purchaseOrderId: po.id } });
          await tx.goodsReceipt.updateMany({
            where: {
              purchaseOrderId: po.id,
              id: { not: receipt.id },
              status: { in: [GoodsReceiptStatus.DRAFT, GoodsReceiptStatus.VALIDATED] },
            },
            data: { status: GoodsReceiptStatus.CANCELLED },
          });
        }

        // Attach the supplier bill to purchase management as a DRAFT bill.
        // Finance completes GST/amounts and posts it (posting writes the
        // supplier ledger + journal; we never post a bill without those).
        let purchaseBillId = receipt.purchaseBillId;
        if (!purchaseBillId) {
          const existing = await tx.purchaseBill.findFirst({
            where: { grnReference: receipt.publicId },
            select: { id: true },
          });
          if (existing) {
            purchaseBillId = existing.id;
          } else {
            const { number, financialYear } = await nextPurchaseBillNumberTx(tx);
            const billLines = acceptedLines.map((l, index) => {
              const poLine = poLineById.get(l.purchaseOrderLineId!)!;
              const unit = poLine.rate != null ? Number(poLine.rate) : 0;
              const lineTotal = Math.round(unit * l.acceptedQuantity * 100) / 100;
              return {
                lineNumber: index + 1,
                description:
                  [l.productLabel, l.rangeLabel, l.powerLabel].filter(Boolean).join(" · ") ||
                  `${l.lensType} ${l.lensId}`,
                sku: l.lensId,
                quantity: l.acceptedQuantity,
                unitPrice: unit,
                taxableAmount: lineTotal,
                gstRatePercent: 0,
                lineTotal,
              };
            });
            const gross = Math.round(billLines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
            const bill = await tx.purchaseBill.create({
              data: {
                billNumber: number,
                financialYear,
                supplierId: po.supplierId,
                status: PurchaseBillStatus.DRAFT,
                poReference: po.publicId,
                grnReference: receipt.publicId,
                billDate: new Date(),
                grossAmount: gross,
                taxableAmount: gross,
                totalAmount: gross,
                amountOutstanding: 0,
                notes: `Draft from goods receipt ${receipt.publicId} (${po.publicId}). Verify GST and amounts against the supplier bill before posting.`,
                documentStoragePath: receipt.billStoragePath,
                documentFileName: receipt.billFileName,
                documentMimeType: receipt.billMimeType,
                lines: { create: billLines },
              },
            });
            purchaseBillId = bill.id;
          }
        }

        posted = true;
        return tx.goodsReceipt.update({
          where: { id: receipt.id },
          data: {
            status: GoodsReceiptStatus.CONFIRMED,
            confirmationKey: key,
            confirmedAt: new Date(),
            confirmedById: actorUserId,
            purchaseBillId,
          },
          include: receiptInclude,
        });
      },
      { timeout: 60_000, maxWait: 10_000 }
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new GoodsReceiptError(
        "This confirmation was already processed.",
        409,
        "ALREADY_CONFIRMED"
      );
    }
    throw err;
  }

  if (posted) {
    await recordAuditEvent(prisma, {
      action: AuditAction.GOODS_RECEIPT_CONFIRMED,
      module: AuditModule.INVENTORY,
      entityType: "GoodsReceipt",
      entityId: confirmed.id,
      actor: resolveActor(input.actor),
      request: input.request ?? null,
      context: {
        publicId: confirmed.publicId,
        purchaseOrder: poPublicId,
        acceptedUnits: String(postedUnits),
        poStatus: nextStatus,
        purchaseBill: confirmed.purchaseBill?.billNumber ?? "",
      },
      activityMessage: `Goods receipt ${confirmed.publicId} confirmed — ${postedUnits} unit(s) added to stock`,
    });
  }

  return confirmed;
}

/**
 * Close remaining outstanding on an open/sent/partial PO with a documented
 * reason. Cancels outstanding qty, reverses only unreceived allocations,
 * releases power locks and closes the PO.
 */
export async function closePurchaseOrderOutstanding(input: {
  purchaseOrderId: string;
  reason: string;
  reasonDetail?: string;
  actor?: AuditActor;
  request?: AuditRequestContext | null;
}) {
  if (!isCloseOutstandingReason(input.reason)) {
    throw new GoodsReceiptError("Invalid close reason.", 400, "INVALID_REASON");
  }
  const reason: CloseOutstandingReason = input.reason;
  const detail = input.reasonDetail?.trim() || null;
  if (reason === "OTHER" && !detail) {
    throw new GoodsReceiptError("Describe the reason when choosing Other.", 400, "REASON_DETAIL_REQUIRED");
  }
  if (detail && detail.length > 500) {
    throw new GoodsReceiptError("Reason detail is too long (max 500).", 400, "INVALID_REASON");
  }
  const actorUserId = input.actor?.actorUserId ?? null;
  const totals = { ordered: 0, received: 0, cancelled: 0 };
  let changed = false;

  const closed = await prisma.$transaction(async (tx) => {
    await lockPurchaseOrder(tx, input.purchaseOrderId);
    const po = await tx.purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
      include: { lines: true },
    });
    if (!po) throw new GoodsReceiptError("Purchase order not found.", 404, "PO_NOT_FOUND");
    if (po.status === PurchaseOrderStatus.CLOSED) return po;
    if (!isReceivablePoStatus(po.status)) {
      throw new GoodsReceiptError(
        po.status === PurchaseOrderStatus.CANCELLED
          ? "Purchase order is cancelled."
          : "Only approved, open purchase orders can be closed.",
        409,
        "PO_NOT_CLOSABLE"
      );
    }

    for (const line of po.lines) {
      const outstanding = openPoLineOutstanding(line);
      totals.ordered += line.poQuantity;
      totals.received += line.receivedQuantity;
      totals.cancelled += line.cancelledQuantity + outstanding;
      if (outstanding <= 0) continue;
      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: { cancelledQuantity: { increment: outstanding } },
      });
      await reverseLineAllocations(tx, line.id, outstanding);
    }

    await tx.openPurchaseOrderPower.deleteMany({ where: { purchaseOrderId: po.id } });
    await tx.goodsReceipt.updateMany({
      where: {
        purchaseOrderId: po.id,
        status: { in: [GoodsReceiptStatus.DRAFT, GoodsReceiptStatus.VALIDATED] },
      },
      data: { status: GoodsReceiptStatus.CANCELLED },
    });

    changed = true;
    return tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: PurchaseOrderStatus.CLOSED,
        cancelReason: [reason, detail].filter(Boolean).join(": "),
        cancelledAt: new Date(),
        cancelledById: actorUserId,
      },
    });
  });

  if (changed) {
    await recordAuditEvent(prisma, {
      action: AuditAction.PURCHASE_ORDER_OUTSTANDING_CLOSED,
      module: AuditModule.INVENTORY,
      entityType: "PurchaseOrder",
      entityId: closed.id,
      actor: resolveActor(input.actor),
      request: input.request ?? null,
      context: {
        reason,
        detail: detail ?? "",
        publicId: closed.publicId,
        ordered: String(totals.ordered),
        received: String(totals.received),
        cancelled: String(totals.cancelled),
      },
      activityMessage: `Purchase order ${closed.publicId} closed — ordered ${totals.ordered}, received ${totals.received}, cancelled ${totals.cancelled} (${reason})`,
    });
  }

  return closed;
}

/** Storage reference for one of a receipt's documents. */
export async function getReceiptDocumentRef(goodsReceiptId: string, kind: ProcurementDocKind) {
  const receipt = await prisma.goodsReceipt.findUnique({
    where: { id: goodsReceiptId },
    select: {
      billStoragePath: true,
      billFileName: true,
      excelStoragePath: true,
      excelFileName: true,
    },
  });
  if (!receipt) throw new GoodsReceiptError("Goods receipt not found.", 404, "GRN_NOT_FOUND");
  const objectPath = kind === "bill" ? receipt.billStoragePath : receipt.excelStoragePath;
  const fileName =
    (kind === "bill" ? receipt.billFileName : receipt.excelFileName) ??
    (kind === "bill" ? "supplier-bill" : "power-wise.xlsx");
  if (!objectPath) {
    throw new GoodsReceiptError("This document was not stored.", 404, "DOCUMENT_NOT_STORED");
  }
  return { objectPath, fileName };
}

export function serializeGoodsReceipt(receipt: GoodsReceiptDetail) {
  const blockers = receiptConfirmBlockers(receipt);
  return {
    id: receipt.id,
    publicId: receipt.publicId,
    status: receipt.status,
    purchaseOrderId: receipt.purchaseOrderId,
    purchaseOrder: receipt.purchaseOrder,
    warehouseCode: receipt.warehouseCode,
    supplierId: receipt.supplierId,
    courier: receipt.courier,
    awb: receipt.awb,
    dispatchDate: receipt.dispatchDate?.toISOString() ?? null,
    packageCount: receipt.packageCount,
    notes: receipt.notes,
    billFileName: receipt.billFileName,
    billStored: Boolean(receipt.billStoragePath),
    excelFileName: receipt.excelFileName,
    excelStored: Boolean(receipt.excelStoragePath),
    purchaseBill: receipt.purchaseBill
      ? {
          id: receipt.purchaseBill.id,
          billNumber: receipt.purchaseBill.billNumber,
          status: receipt.purchaseBill.status,
          totalAmount: Number(receipt.purchaseBill.totalAmount),
        }
      : null,
    confirmedAt: receipt.confirmedAt?.toISOString() ?? null,
    createdAt: receipt.createdAt.toISOString(),
    lines: receipt.lines.map((l) => ({
      id: l.id,
      purchaseOrderLineId: l.purchaseOrderLineId,
      lensType: l.lensType,
      lensId: l.lensId,
      productLabel: l.productLabel,
      rangeLabel: l.rangeLabel,
      powerLabel: l.powerLabel,
      orderedQuantity: l.orderedQuantity,
      previouslyReceived: l.previouslyReceived,
      outstandingBefore: l.outstandingBefore,
      deliveredQuantity: l.deliveredQuantity,
      acceptedQuantity: l.acceptedQuantity,
      damagedQuantity: l.damagedQuantity,
      shortQuantity: l.shortQuantity,
      excessQuantity: l.excessQuantity,
      lineStatus: l.lineStatus,
      actionCode: l.actionCode,
    })),
    billSummaries: receipt.billSummaries.map((b) => ({
      id: b.id,
      productLabel: b.productLabel,
      rangeLabel: b.rangeLabel,
      billQuantity: b.billQuantity,
      excelQuantity: b.excelQuantity,
      difference: b.difference,
      resolution: b.resolution,
    })),
    confirmSummary: {
      acceptedUnits: receipt.lines.reduce((s, l) => s + l.acceptedQuantity, 0),
      remainingOutstanding: receipt.lines.reduce(
        (s, l) => s + Math.max(0, l.outstandingBefore - l.acceptedQuantity),
        0
      ),
      unresolvedMismatches: unresolvedRangeMismatches(receipt.billSummaries).length,
    },
    confirmBlockers: blockers,
    canConfirm: blockers.length === 0,
  };
}
