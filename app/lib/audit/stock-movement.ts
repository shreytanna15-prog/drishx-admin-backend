import type { LensType, Prisma, StockMovementType } from "@prisma/client";
import { prisma } from "../prisma";

type TxClient = Prisma.TransactionClient | typeof prisma;

export async function recordStockMovement(
  client: TxClient,
  input: {
    lensType: LensType;
    lensId: string;
    movementType: StockMovementType;
    quantityDelta: number;
    quantityBefore: number;
    quantityAfter: number;
    sourceType?: string | null;
    referenceId?: string | null;
    orderId?: string | null;
    actorUserId?: string | null;
    reasonCode?: string | null;
    reasonText?: string | null;
    notes?: string | null;
  }
) {
  return client.stockMovement.create({ data: input });
}

export async function getLensQuantity(
  client: TxClient,
  lensType: LensType,
  lensId: string
): Promise<number | null> {
  if (lensType === "SINGLE_VISION") {
    const row = await client.singleVisionLens.findUnique({
      where: { id: lensId },
      select: { quantity: true },
    });
    return row?.quantity ?? null;
  }
  if (lensType === "KRYPTOK") {
    const row = await client.kryptokLens.findUnique({
      where: { id: lensId },
      select: { quantity: true },
    });
    return row?.quantity ?? null;
  }
  if (lensType === "PROGRESSIVE") {
    const row = await client.progressiveLens.findUnique({
      where: { id: lensId },
      select: { quantity: true },
    });
    return row?.quantity ?? null;
  }
  return null;
}

export type AuditUserScope = {
  role: string;
  userId: string;
};

/** Prisma where clause for employee-scoped audit reads */
export async function buildEmployeeAuditScope(
  scope: AuditUserScope
): Promise<Prisma.AuditEventWhereInput> {
  if (scope.role === "ADMIN") return {};

  const assignedOrderIds = await prisma.order.findMany({
    where: { assignedToId: scope.userId },
    select: { id: true },
  });
  const orderIds = assignedOrderIds.map((o) => o.id);

  return {
    OR: [
      { actorUserId: scope.userId },
      {
        entityType: "Order",
        entityId: { in: orderIds.length ? orderIds : ["__none__"] },
      },
    ],
  };
}
