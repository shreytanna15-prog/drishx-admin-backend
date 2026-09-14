import { OrderStatus, Prisma, UserRole } from "@prisma/client";

import { prisma } from "./prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

/** Statuses that still count toward an employee's open workload. */
const OPEN_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PICKING,
  OrderStatus.PACKED,
  OrderStatus.DISPATCHED,
  OrderStatus.PARTIALLY_FULFILLED,
  OrderStatus.AWAITING_PROCUREMENT,
];

/**
 * Pick the active employee with the fewest open checkout batches
 * (least-load). Reuses an existing assignee when the checkout batch
 * already has one so all lines in a batch stay with the same employee.
 */
export async function resolveOrderAssigneeId(
  options: { checkoutBatchId?: string | null } = {},
  db: DbClient = prisma
): Promise<string | null> {
  const batchId =
    typeof options.checkoutBatchId === "string" && options.checkoutBatchId.trim()
      ? options.checkoutBatchId.trim().slice(0, 64)
      : null;

  if (batchId) {
    const existing = await db.order.findFirst({
      where: {
        checkoutBatchId: batchId,
        assignedToId: { not: null },
      },
      select: { assignedToId: true },
      orderBy: { createdAt: "asc" },
    });
    if (existing?.assignedToId) {
      return existing.assignedToId;
    }
  }

  const employees = await db.user.findMany({
    where: {
      role: UserRole.EMPLOYEE,
      isActive: true,
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (employees.length === 0) {
    return null;
  }

  const openOrders = await db.order.findMany({
    where: {
      assignedToId: { in: employees.map((employee) => employee.id) },
      status: { in: OPEN_ORDER_STATUSES },
    },
    select: {
      id: true,
      assignedToId: true,
      checkoutBatchId: true,
    },
  });

  const loadByEmployee = new Map<string, Set<string>>();
  for (const employee of employees) {
    loadByEmployee.set(employee.id, new Set());
  }

  for (const order of openOrders) {
    if (!order.assignedToId) continue;
    const buckets = loadByEmployee.get(order.assignedToId);
    if (!buckets) continue;
    const key = order.checkoutBatchId?.trim() || order.id;
    buckets.add(key);
  }

  let bestEmployeeId = employees[0]!.id;
  let bestCount = loadByEmployee.get(bestEmployeeId)?.size ?? 0;

  for (const employee of employees) {
    const count = loadByEmployee.get(employee.id)?.size ?? 0;
    if (count < bestCount) {
      bestEmployeeId = employee.id;
      bestCount = count;
    }
  }

  return bestEmployeeId;
}

export function assignmentCreateFields(assignedToId: string | null | undefined): {
  assignedToId?: string;
  assignedAt?: Date;
} {
  if (!assignedToId) {
    return {};
  }
  return {
    assignedToId,
    assignedAt: new Date(),
  };
}
