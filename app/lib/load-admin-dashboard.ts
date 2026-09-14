import {
  AlternateSuggestionStatus,
  ExpenseCategory,
  InvoiceStatus,
  OrderStatus,
  Prisma,
  ReturnRequestStatus,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";
import {
  buildSeriesDays,
  customerLabel,
  getDashboardWindow,
  LOW_STOCK_MAX,
  OPEN_PIPELINE_STATUSES,
  PIPELINE_STATUS_ORDER,
  toCount,
  toMoney,
  type AdminDashboardPayload,
  type DashboardRange,
} from "./admin-dashboard";
import { prisma, withDbRetry } from "./prisma";

const OPEN_RETURN_STATUSES: ReturnRequestStatus[] = [
  ReturnRequestStatus.SUBMITTED,
  ReturnRequestStatus.MORE_INFO_REQUIRED,
  ReturnRequestStatus.ESCALATED_TO_ADMIN,
  ReturnRequestStatus.AWAITING_MATERIAL,
  ReturnRequestStatus.APPROVED_CREDIT,
  ReturnRequestStatus.APPROVED_REPLACEMENT,
];

type SeriesRow = {
  day: Date | string;
  orders: unknown;
  gmv: unknown;
};

type StockRow = {
  units_on_hand: unknown;
  sku_count: unknown;
  out_of_stock: unknown;
  low_stock: unknown;
};

function ymdFromSqlDate(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

async function lensStockSnapshot() {
  const rows = await prisma.$queryRaw<StockRow[]>(Prisma.sql`
    SELECT
      COALESCE((SELECT SUM(quantity) FROM "SingleVisionLens"), 0)
        + COALESCE((SELECT SUM(quantity) FROM "KryptokLens"), 0)
        + COALESCE((SELECT SUM(quantity) FROM "ProgressiveLens"), 0) AS units_on_hand,
      (SELECT COUNT(*) FROM "SingleVisionLens")
        + (SELECT COUNT(*) FROM "KryptokLens")
        + (SELECT COUNT(*) FROM "ProgressiveLens") AS sku_count,
      (SELECT COUNT(*) FROM "SingleVisionLens" WHERE quantity <= 0)
        + (SELECT COUNT(*) FROM "KryptokLens" WHERE quantity <= 0)
        + (SELECT COUNT(*) FROM "ProgressiveLens" WHERE quantity <= 0) AS out_of_stock,
      (SELECT COUNT(*) FROM "SingleVisionLens" WHERE quantity > 0 AND quantity <= ${LOW_STOCK_MAX})
        + (SELECT COUNT(*) FROM "KryptokLens" WHERE quantity > 0 AND quantity <= ${LOW_STOCK_MAX})
        + (SELECT COUNT(*) FROM "ProgressiveLens" WHERE quantity > 0 AND quantity <= ${LOW_STOCK_MAX}) AS low_stock
  `);
  const row = rows[0];
  return {
    unitsOnHand: toCount(row?.units_on_hand),
    skuCount: toCount(row?.sku_count),
    outOfStock: toCount(row?.out_of_stock),
    lowStock: toCount(row?.low_stock),
  };
}

export async function loadAdminDashboard(
  range: DashboardRange,
  now = new Date()
): Promise<AdminDashboardPayload> {
  const window = getDashboardWindow(range, now);
  const { rangeStart, rangeEnd, seriesStart, today } = window;
  const inRange = { gte: rangeStart, lt: rangeEnd };

  return withDbRetry(async () => {
    const [
      ordersInRange,
      gmvAgg,
      pipelineGroups,
      awaitingProcurement,
      unpaidAgg,
      openReturns,
      seriesRows,
      inventory,
    ] = await Promise.all([
      prisma.order.count({
        where: { createdAt: inRange },
      }),
      prisma.order.aggregate({
        where: {
          createdAt: inRange,
          status: { not: OrderStatus.CANCELLED },
        },
        _sum: { totalAmount: true },
      }),
      prisma.order.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.order.count({
        where: { status: OrderStatus.AWAITING_PROCUREMENT },
      }),
      prisma.invoice.aggregate({
        where: { status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.returnRequest.count({
        where: { status: { in: OPEN_RETURN_STATUSES } },
      }),
      prisma.$queryRaw<SeriesRow[]>(Prisma.sql`
        SELECT
          (timezone('Asia/Kolkata', "createdAt"))::date AS day,
          COUNT(*)::int AS orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE status <> 'CANCELLED'), 0) AS gmv
        FROM "Order"
        WHERE "createdAt" >= ${seriesStart}
          AND "createdAt" < ${rangeEnd}
        GROUP BY 1
        ORDER BY 1
      `),
      lensStockSnapshot(),
    ]);

    const [
      invoicedAgg,
      incomeAgg,
      procurementAgg,
      creditNoteAgg,
      pendingGst,
      pendingAlternatePower,
      dispatched,
      recentOrders,
      clients,
      employees,
    ] = await Promise.all([
      prisma.invoice.aggregate({
        where: { issuedAt: inRange },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          createdAt: inRange,
          type: TransactionType.CREDIT,
          status: TransactionStatus.COMPLETED,
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          createdAt: inRange,
          type: TransactionType.DEBIT,
          status: TransactionStatus.COMPLETED,
          category: ExpenseCategory.PROCUREMENT,
        },
        _sum: { amount: true },
      }),
      prisma.creditNote.aggregate({
        where: { createdAt: inRange },
        _sum: { amount: true },
      }),
      prisma.user.count({
        where: {
          role: "CUSTOMER",
          approvalStatus: "PENDING_REVIEW",
          gstNumber: { not: null },
        },
      }),
      prisma.alternatePowerSuggestion.count({
        where: { status: AlternateSuggestionStatus.PENDING },
      }),
      prisma.order.count({
        where: { status: OrderStatus.DISPATCHED },
      }),
      prisma.order.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          user: {
            select: {
              name: true,
              businessName: true,
              email: true,
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          role: "CUSTOMER",
          isApproved: true,
          approvalStatus: "APPROVED",
        },
      }),
      prisma.user.count({
        where: { role: "EMPLOYEE", isActive: true },
      }),
    ]);

    const countByStatus = new Map<OrderStatus, number>();
    for (const row of pipelineGroups) {
      countByStatus.set(row.status, row._count._all);
    }
    const pipeline = PIPELINE_STATUS_ORDER.map((status) => ({
      status,
      count: countByStatus.get(status) ?? 0,
    }));

    const openPipeline = OPEN_PIPELINE_STATUSES.reduce(
      (sum, status) => sum + (countByStatus.get(status) ?? 0),
      0
    );

    const seriesMap = new Map<string, { orders: number; gmv: number }>();
    for (const row of seriesRows) {
      seriesMap.set(ymdFromSqlDate(row.day), {
        orders: toCount(row.orders),
        gmv: toMoney(row.gmv),
      });
    }
    const series = buildSeriesDays(today).map((date) => ({
      date,
      orders: seriesMap.get(date)?.orders ?? 0,
      gmv: seriesMap.get(date)?.gmv ?? 0,
    }));

    const unpaidAmount = toMoney(unpaidAgg._sum.amount);
    const unpaidCount = unpaidAgg._count._all;

    return {
      generatedAt: now.toISOString(),
      range,
      timezone: window.timezone,
      kpis: {
        ordersInRange,
        gmvInRange: toMoney(gmvAgg._sum.totalAmount),
        openPipeline,
        awaitingProcurement,
        unpaidInvoiceAmount: unpaidAmount,
        openReturns,
      },
      pipeline,
      series,
      inventory,
      finance: {
        invoicedInRange: toMoney(invoicedAgg._sum.amount),
        unpaidCount,
        unpaidAmount,
        incomeInRange: toMoney(incomeAgg._sum.amount),
        procurementSpendInRange: toMoney(procurementAgg._sum.amount),
        creditNotesInRange: toMoney(creditNoteAgg._sum.amount),
      },
      attention: {
        pendingGst,
        pendingAlternatePower,
        openReturns,
        awaitingProcurement,
        unpaidInvoices: unpaidCount,
        dispatched,
        outOfStock: inventory.outOfStock,
        lowStock: inventory.lowStock,
      },
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: customerLabel(order.user),
        status: order.status,
        totalAmount: toMoney(order.totalAmount),
        createdAt: order.createdAt.toISOString(),
      })),
      clients,
      employees,
    };
  });
}
