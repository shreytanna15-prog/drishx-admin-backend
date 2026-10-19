import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { employeeOrdersWhere } from "./prescription-order-hold";
import {
  ordersListKryptokLensSelect,
  ordersListProgressiveLensSelect,
  ordersListSvLensSelect,
} from "./orders-list";

const IN_PROGRESS: OrderStatus[] = [
  "PENDING",
  "PICKING",
  "PACKED",
  "PARTIALLY_FULFILLED",
  "AWAITING_PROCUREMENT",
];

/** Matches website/mobile `isStaffPendingOrder` (excludes AWAITING_PROCUREMENT). */
const STAFF_PENDING: OrderStatus[] = [
  "PENDING",
  "PICKING",
  "PACKED",
  "DISPATCHED",
  "PARTIALLY_FULFILLED",
];

export type OverviewTrend = {
  percent: number;
  direction: "up" | "down" | "flat";
};

export type CustomerOrdersOverview = {
  role: "CUSTOMER";
  overview: {
    total: number;
    inProgress: number;
    readyToShip: number;
    completed: number;
  };
  trends: {
    total: OverviewTrend;
    inProgress: OverviewTrend;
    readyToShip: OverviewTrend;
    completed: OverviewTrend;
  };
  lastOrder: { id: string; label: string } | null;
  topProducts: Array<{
    lensId: string;
    title: string;
    subtitle: string;
    shopFilter: "Single Vision" | "Kryptok" | "Progressive";
    orderCount: number;
    totalQuantity: number;
  }>;
};

export type StaffOrdersOverview = {
  role: "EMPLOYEE" | "ADMIN";
  tasksAssigned: number;
  tasksCompleted: number;
  ordersReceived: number;
  ordersPending: number;
  pendingOrders: Array<{
    id: string;
    status: OrderStatus;
    createdAt: string;
    orderNumber: number | null;
    lensType: string;
    checkoutBatchId: string | null;
    user: {
      id: string;
      name: string | null;
      email: string;
      businessName: string | null;
    } | null;
  }>;
  pendingTasks: Array<{
    id: string;
    title: string;
    dueDate: string;
    status: string;
  }>;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function trendFor(todayCount: number, yesterdayCount: number): OverviewTrend {
  if (yesterdayCount === 0) {
    return todayCount > 0
      ? { percent: 100, direction: "up" }
      : { percent: 0, direction: "flat" };
  }
  const diff = todayCount - yesterdayCount;
  const percent = Math.round((Math.abs(diff) / yesterdayCount) * 100);
  if (percent === 0) return { percent: 0, direction: "flat" };
  return { percent, direction: diff >= 0 ? "up" : "down" };
}

function dayBucketCounts(
  rows: Array<{ status: OrderStatus }>
): {
  total: number;
  inProgress: number;
  readyToShip: number;
  completed: number;
} {
  const out = { total: 0, inProgress: 0, readyToShip: 0, completed: 0 };
  for (const row of rows) {
    if (row.status === "CANCELLED") continue;
    out.total += 1;
    if (row.status === "COMPLETED") out.completed += 1;
    else if (row.status === "DISPATCHED") out.readyToShip += 1;
    else if (IN_PROGRESS.includes(row.status)) out.inProgress += 1;
  }
  return out;
}

function formatLensLabel(lensType: string): string {
  switch (lensType) {
    case "KRYPTOK":
      return "Kryptok";
    case "PROGRESSIVE":
      return "Progressive";
    case "SINGLE_VISION":
      return "Single Vision";
    default:
      return lensType.replace(/_/g, " ");
  }
}

function joinParts(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" · ");
}

async function buildTopProducts(
  userId: string
): Promise<CustomerOrdersOverview["topProducts"]> {
  const baseWhere: Prisma.OrderWhereInput = {
    userId,
    status: { not: "CANCELLED" },
  };

  const [svGroups, ktGroups, progGroups] = await Promise.all([
    prisma.order.groupBy({
      by: ["singleVisionLensId"],
      where: { ...baseWhere, singleVisionLensId: { not: null } },
      _count: { _all: true },
      _sum: { quantity: true },
      orderBy: { _count: { singleVisionLensId: "desc" } },
      take: 5,
    }),
    prisma.order.groupBy({
      by: ["kryptokLensId"],
      where: { ...baseWhere, kryptokLensId: { not: null } },
      _count: { _all: true },
      _sum: { quantity: true },
      orderBy: { _count: { kryptokLensId: "desc" } },
      take: 5,
    }),
    prisma.order.groupBy({
      by: ["progressiveLensId"],
      where: { ...baseWhere, progressiveLensId: { not: null } },
      _count: { _all: true },
      _sum: { quantity: true },
      orderBy: { _count: { progressiveLensId: "desc" } },
      take: 5,
    }),
  ]);

  type Candidate = {
    lensId: string;
    lensType: "SINGLE_VISION" | "KRYPTOK" | "PROGRESSIVE";
    orderCount: number;
    totalQuantity: number;
  };

  const candidates: Candidate[] = [
    ...svGroups
      .filter((g) => g.singleVisionLensId)
      .map((g) => ({
        lensId: g.singleVisionLensId!,
        lensType: "SINGLE_VISION" as const,
        orderCount: g._count._all,
        totalQuantity: Number(g._sum.quantity ?? 0),
      })),
    ...ktGroups
      .filter((g) => g.kryptokLensId)
      .map((g) => ({
        lensId: g.kryptokLensId!,
        lensType: "KRYPTOK" as const,
        orderCount: g._count._all,
        totalQuantity: Number(g._sum.quantity ?? 0),
      })),
    ...progGroups
      .filter((g) => g.progressiveLensId)
      .map((g) => ({
        lensId: g.progressiveLensId!,
        lensType: "PROGRESSIVE" as const,
        orderCount: g._count._all,
        totalQuantity: Number(g._sum.quantity ?? 0),
      })),
  ]
    .sort((a, b) => b.orderCount - a.orderCount || b.totalQuantity - a.totalQuantity)
    .slice(0, 5);

  if (candidates.length === 0) return [];

  const svIds = candidates
    .filter((c) => c.lensType === "SINGLE_VISION")
    .map((c) => c.lensId);
  const ktIds = candidates
    .filter((c) => c.lensType === "KRYPTOK")
    .map((c) => c.lensId);
  const progIds = candidates
    .filter((c) => c.lensType === "PROGRESSIVE")
    .map((c) => c.lensId);

  const [svLenses, ktLenses, progLenses] = await Promise.all([
    svIds.length
      ? prisma.singleVisionLens.findMany({
          where: { id: { in: svIds } },
          select: ordersListSvLensSelect,
        })
      : Promise.resolve([]),
    ktIds.length
      ? prisma.kryptokLens.findMany({
          where: { id: { in: ktIds } },
          select: ordersListKryptokLensSelect,
        })
      : Promise.resolve([]),
    progIds.length
      ? prisma.progressiveLens.findMany({
          where: { id: { in: progIds } },
          select: ordersListProgressiveLensSelect,
        })
      : Promise.resolve([]),
  ]);

  const byId = new Map<
    string,
    {
      brand?: string | null;
      item?: string | null;
      coating?: string | null;
      category?: string | null;
    }
  >();
  for (const l of svLenses) byId.set(l.id, l);
  for (const l of ktLenses) byId.set(l.id, l);
  for (const l of progLenses) byId.set(l.id, l);

  return candidates.map((c) => {
    const lens = byId.get(c.lensId);
    const lensLabel = formatLensLabel(c.lensType);
    const title = lens?.brand?.trim() || lens?.item?.trim() || lensLabel;
    const subtitle =
      joinParts([lensLabel, lens?.item, lens?.coating, lens?.category]) ||
      lensLabel;
    const shopFilter =
      c.lensType === "KRYPTOK"
        ? ("Kryptok" as const)
        : c.lensType === "PROGRESSIVE"
          ? ("Progressive" as const)
          : ("Single Vision" as const);
    return {
      lensId: c.lensId,
      title,
      subtitle,
      shopFilter,
      orderCount: c.orderCount,
      totalQuantity: c.totalQuantity,
    };
  });
}

export async function buildCustomerOrdersOverview(
  userId: string
): Promise<CustomerOrdersOverview> {
  const scope: Prisma.OrderWhereInput = { userId };
  const active: Prisma.OrderWhereInput = {
    ...scope,
    status: { not: "CANCELLED" },
  };

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yStart = startOfDay(yesterday);
  const yEnd = endOfDay(yesterday);

  const [
    total,
    inProgress,
    readyToShip,
    completed,
    todayRows,
    yesterdayRows,
    lastOrder,
    topProducts,
  ] = await Promise.all([
    prisma.order.count({ where: active }),
    prisma.order.count({
      where: { ...scope, status: { in: IN_PROGRESS } },
    }),
    prisma.order.count({
      where: { ...scope, status: "DISPATCHED" },
    }),
    prisma.order.count({
      where: { ...scope, status: "COMPLETED" },
    }),
    prisma.order.findMany({
      where: {
        ...scope,
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      select: { status: true },
    }),
    prisma.order.findMany({
      where: {
        ...scope,
        createdAt: { gte: yStart, lte: yEnd },
      },
      select: { status: true },
    }),
    prisma.order.findFirst({
      where: active,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        lensType: true,
        singleVisionLens: { select: ordersListSvLensSelect },
        kryptokLens: { select: ordersListKryptokLensSelect },
        progressiveLens: { select: ordersListProgressiveLensSelect },
      },
    }),
    buildTopProducts(userId),
  ]);

  const today = dayBucketCounts(todayRows);
  const prior = dayBucketCounts(yesterdayRows);

  let lastOrderSummary: CustomerOrdersOverview["lastOrder"] = null;
  if (lastOrder) {
    const catalog =
      lastOrder.progressiveLens ??
      lastOrder.kryptokLens ??
      lastOrder.singleVisionLens ??
      null;
    const lensType = formatLensLabel(lastOrder.lensType);
    const detail =
      (catalog && "item" in catalog ? catalog.item?.trim() : null) ||
      catalog?.brand?.trim() ||
      (catalog && "coating" in catalog ? catalog.coating?.trim() : null);
    lastOrderSummary = {
      id: lastOrder.id,
      label: detail ? `${lensType} - ${detail}` : lensType,
    };
  }

  return {
    role: "CUSTOMER",
    overview: { total, inProgress, readyToShip, completed },
    trends: {
      total: trendFor(today.total, prior.total),
      inProgress: trendFor(today.inProgress, prior.inProgress),
      readyToShip: trendFor(today.readyToShip, prior.readyToShip),
      completed: trendFor(today.completed, prior.completed),
    },
    lastOrder: lastOrderSummary,
    topProducts,
  };
}

export async function buildStaffOrdersOverview(
  employeeUserId: string
): Promise<StaffOrdersOverview> {
  const orderScope = employeeOrdersWhere(employeeUserId);
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [
    ordersReceived,
    ordersPending,
    tasksDueToday,
    tasksCompletedDueToday,
    pendingOrders,
    pendingTasks,
  ] = await Promise.all([
    prisma.order.count({
      where: {
        AND: [orderScope, { createdAt: { gte: todayStart, lte: todayEnd } }],
      },
    }),
    prisma.order.count({
      where: {
        AND: [
          orderScope,
          {
            createdAt: { gte: todayStart, lte: todayEnd },
            status: { in: STAFF_PENDING },
          },
        ],
      },
    }),
    prisma.task.count({
      where: {
        assignedToId: employeeUserId,
        dueDate: { gte: todayStart, lte: todayEnd },
      },
    }),
    prisma.task.count({
      where: {
        assignedToId: employeeUserId,
        dueDate: { gte: todayStart, lte: todayEnd },
        status: "COMPLETED",
      },
    }),
    prisma.order.findMany({
      where: {
        AND: [orderScope, { status: { in: STAFF_PENDING } }],
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        createdAt: true,
        orderNumber: true,
        lensType: true,
        checkoutBatchId: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            businessName: true,
          },
        },
      },
    }),
    prisma.task.findMany({
      where: {
        assignedToId: employeeUserId,
        status: "PENDING",
      },
      orderBy: { dueDate: "asc" },
      take: 10,
      select: {
        id: true,
        title: true,
        dueDate: true,
        status: true,
      },
    }),
  ]);

  return {
    role: "EMPLOYEE",
    tasksAssigned: tasksDueToday,
    tasksCompleted: tasksCompletedDueToday,
    ordersReceived,
    ordersPending,
    pendingOrders: pendingOrders.map((o) => ({
      ...o,
      createdAt: o.createdAt.toISOString(),
    })),
    pendingTasks: pendingTasks.map((t) => ({
      ...t,
      dueDate: t.dueDate.toISOString(),
    })),
  };
}
