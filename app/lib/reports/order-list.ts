import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import type { ParsedDateRange } from "./date-range";
import { RX_ORDER_NOTES_MARKER } from "./rx-marker";
import type { ReportTablePayload } from "./types";

export { notesIsRxOrder, RX_ORDER_NOTES_MARKER } from "./rx-marker";

/** Soft cap so a single report response stays manageable. */
export const ORDER_REPORT_ROW_LIMIT = 500;

export type OrderListReportOptions = {
  /** Exact status filter; omit when using notesContains only. */
  status?: OrderStatus;
  /** Substring match on Order.notes (e.g. RX marker). */
  notesContains?: string;
  /** Value stored in summary.statusFilter for UI. */
  statusFilterLabel: string;
  /** Override UI row cap (e.g. elevated limit for export). */
  rowLimit?: number;
};

/**
 * Order list reports filtered by createdAt (same date basis as Pending Orders).
 * There is no completedAt/cancelledAt on Order — period = order placement window.
 */
export async function computeOrderListReport(
  range: ParsedDateRange,
  options: OrderListReportOptions
): Promise<ReportTablePayload> {
  const rowLimit = options.rowLimit ?? ORDER_REPORT_ROW_LIMIT;
  const where = {
    ...(options.status ? { status: options.status } : {}),
    ...(options.notesContains
      ? { notes: { contains: options.notesContains } }
      : {}),
    createdAt: { gte: range.from, lte: range.to },
  };

  const [totalMatching, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: rowLimit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        lineType: true,
        quantity: true,
        totalAmount: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            email: true,
            businessName: true,
          },
        },
      },
    }),
  ]);

  const money = (n: number) => Math.round(n * 100) / 100;
  let amountSum = 0;
  const rows = orders.map((o) => {
    const amount = Number(o.totalAmount);
    amountSum += amount;
    const customer =
      o.user.businessName?.trim() ||
      o.user.name?.trim() ||
      o.user.email;
    return {
      orderNumber:
        o.orderNumber != null ? `#${o.orderNumber}` : o.id.slice(0, 8),
      customer,
      status: o.status,
      lineType: o.lineType,
      quantity: o.quantity,
      totalAmount: money(amount),
      createdAt: o.createdAt.toISOString(),
    };
  });

  return {
    kind: "table",
    columns: [
      { key: "orderNumber", label: "Order" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Status" },
      { key: "lineType", label: "Line" },
      { key: "quantity", label: "Qty", align: "right" },
      { key: "totalAmount", label: "Amount", align: "right" },
      { key: "createdAt", label: "Placed" },
    ],
    rows,
    summary: {
      matchingCount: totalMatching,
      returnedCount: rows.length,
      amountInReturnedRows: money(amountSum),
      statusFilter: options.statusFilterLabel,
      from: range.fromKey,
      to: range.toKey,
      dateBasis: "order.createdAt",
    },
    meta: {
      truncated: totalMatching > rows.length,
      rowLimit,
    },
  };
}

export type OrderListRunOptions = {
  rowLimit?: number;
};

export async function computePendingOrdersReport(
  range: ParsedDateRange,
  runOptions?: OrderListRunOptions
) {
  return computeOrderListReport(range, {
    status: "PENDING",
    statusFilterLabel: "PENDING",
    rowLimit: runOptions?.rowLimit,
  });
}

export async function computeCompletedOrdersReport(
  range: ParsedDateRange,
  runOptions?: OrderListRunOptions
) {
  return computeOrderListReport(range, {
    status: "COMPLETED",
    statusFilterLabel: "COMPLETED",
    rowLimit: runOptions?.rowLimit,
  });
}

export async function computeCancelledOrdersReport(
  range: ParsedDateRange,
  runOptions?: OrderListRunOptions
) {
  return computeOrderListReport(range, {
    status: "CANCELLED",
    statusFilterLabel: "CANCELLED",
    rowLimit: runOptions?.rowLimit,
  });
}

export async function computeRxOrdersReport(
  range: ParsedDateRange,
  runOptions?: OrderListRunOptions
) {
  return computeOrderListReport(range, {
    notesContains: RX_ORDER_NOTES_MARKER,
    statusFilterLabel: "RX (notes marker)",
    rowLimit: runOptions?.rowLimit,
  });
}
