import { prisma } from "@/app/lib/prisma";
import type { ParsedDateRange } from "./date-range";
import { REPORT_EXPORT_ROW_LIMIT } from "./export-format";
import {
  READY_STOCK_COLUMNS,
  READY_STOCK_STATUSES,
  formatDispatchStateLabel,
  selectReadyStockOrders,
  type ReadyStockOrderInput,
} from "./ready-stock-format";
import type { ReportTablePayload } from "./types";

/**
 * Ready Stock Orders for the selected placement-date window.
 * Filters candidates in SQL, then applies per-order reservation rules in memory.
 */
export async function computeReadyStockOrdersReport(
  range: ParsedDateRange,
  options?: { rowLimit?: number }
): Promise<ReportTablePayload> {
  const candidates = await prisma.order.findMany({
    where: {
      createdAt: { gte: range.from, lte: range.to },
      status: { in: [...READY_STOCK_STATUSES] },
      warehouseHold: false,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      lineType: true,
      quantity: true,
      reservedQuantity: true,
      notes: true,
      orderImageUrl: true,
      warehouseHold: true,
      warehouseReleasedAt: true,
      totalAmount: true,
      createdAt: true,
      user: {
        select: {
          name: true,
          email: true,
          businessName: true,
        },
      },
      wholesaleLineItems: {
        select: {
          quantity: true,
          reservedQuantity: true,
          needsProcurement: true,
        },
      },
    },
  });

  const inputs: ReadyStockOrderInput[] = candidates.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    lineType: o.lineType,
    quantity: Number(o.quantity) || 0,
    reservedQuantity: Number(o.reservedQuantity) || 0,
    notes: o.notes,
    orderImageUrl: o.orderImageUrl,
    warehouseHold: o.warehouseHold,
    warehouseReleasedAt: o.warehouseReleasedAt,
    totalAmount: Number(o.totalAmount) || 0,
    createdAt: o.createdAt,
    customer:
      o.user.businessName?.trim() ||
      o.user.name?.trim() ||
      o.user.email,
    wholesaleLines:
      o.lineType === "WHOLESALE"
        ? o.wholesaleLineItems.map((l) => ({
            quantity: Number(l.quantity) || 0,
            reservedQuantity: Number(l.reservedQuantity) || 0,
            needsProcurement: Boolean(l.needsProcurement),
          }))
        : null,
  }));

  const ready = selectReadyStockOrders(inputs);
  const limit = options?.rowLimit ?? REPORT_EXPORT_ROW_LIMIT;
  const truncated = ready.length > limit;
  const slice = truncated ? ready.slice(0, limit) : ready;

  const money = (n: number) => Math.round(n * 100) / 100;
  let amountSum = 0;
  let dispatchEligible = 0;
  let allocatedNotPacked = 0;

  const rows = slice.map((o) => {
    amountSum += o.totalAmount;
    if (o.assessment.dispatchState === "DISPATCH_ELIGIBLE") {
      dispatchEligible += 1;
    } else if (o.assessment.dispatchState === "ALLOCATED_NOT_PACKED") {
      allocatedNotPacked += 1;
    }
    return {
      orderNumber:
        o.orderNumber != null ? `#${o.orderNumber}` : o.id.slice(0, 8),
      customer: o.customer,
      status: o.status,
      lineType: o.lineType,
      quantity: o.quantity,
      reservedQuantity: o.reservedQuantity,
      allocationStatus: o.assessment.allocationStatus,
      dispatchState: formatDispatchStateLabel(o.assessment.dispatchState),
      totalAmount: money(o.totalAmount),
      createdAt: o.createdAt.toISOString(),
    };
  });

  return {
    kind: "table",
    columns: READY_STOCK_COLUMNS,
    rows,
    summary: {
      matchingCount: ready.length,
      returnedCount: rows.length,
      amountInReturnedRows: money(amountSum),
      dispatchEligibleCount: dispatchEligible,
      allocatedNotPackedCount: allocatedNotPacked,
      from: range.fromKey,
      to: range.toKey,
      dateBasis: "order.createdAt",
    },
    meta: {
      truncated,
      rowLimit: limit,
      definition:
        "Non-RX/photo catalog orders in PENDING/PICKING/PACKED with full per-order reservation (wholesale lines all reserved and not needsProcurement). Aggregate warehouse stock alone never qualifies.",
      dispatchNote:
        "Only PACKED rows are dispatch-eligible in ops; PENDING/PICKING are fully allocated but not yet packed.",
    },
  };
}
