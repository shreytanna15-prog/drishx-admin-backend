/**
 * One-time backfill: assign open unassigned orders to active employees
 * using least-load by checkout batch.
 *
 * Usage:
 *   npx tsx prisma/backfill-order-assignments.ts
 */
import "dotenv/config";
import { OrderStatus, UserRole } from "@prisma/client";

import { prisma } from "../app/lib/prisma";
import { resolveOrderAssigneeId } from "../app/lib/assign-order-to-employee";

const OPEN_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PICKING,
  OrderStatus.PACKED,
  OrderStatus.DISPATCHED,
  OrderStatus.PARTIALLY_FULFILLED,
  OrderStatus.AWAITING_PROCUREMENT,
];

async function main() {
  const employees = await prisma.user.findMany({
    where: { role: UserRole.EMPLOYEE, isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (employees.length === 0) {
    console.log("No active employees found. Nothing to assign.");
    return;
  }

  console.log(`Active employees: ${employees.length}`);

  const unassigned = await prisma.order.findMany({
    where: {
      assignedToId: null,
      status: { in: OPEN_STATUSES },
    },
    select: {
      id: true,
      checkoutBatchId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Unassigned open orders: ${unassigned.length}`);

  const batches = new Map<string, { checkoutBatchId: string | null; orderIds: string[] }>();
  for (const order of unassigned) {
    const key = order.checkoutBatchId?.trim() || order.id;
    const existing = batches.get(key);
    if (existing) {
      existing.orderIds.push(order.id);
    } else {
      batches.set(key, {
        checkoutBatchId: order.checkoutBatchId?.trim() || null,
        orderIds: [order.id],
      });
    }
  }

  let assignedBatches = 0;
  for (const [batchKey, batch] of batches) {
    const assignedToId = await resolveOrderAssigneeId({
      checkoutBatchId: batch.checkoutBatchId,
    });

    if (!assignedToId) {
      console.warn(`Skipping batch ${batchKey}: no assignee available`);
      continue;
    }

    await prisma.order.updateMany({
      where: { id: { in: batch.orderIds } },
      data: {
        assignedToId,
        assignedAt: new Date(),
      },
    });
    assignedBatches += 1;
    console.log(
      `Assigned batch ${batchKey} (${batch.orderIds.length} lines) → ${assignedToId}`
    );
  }

  console.log(`Done. Assigned ${assignedBatches} batch(es).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
