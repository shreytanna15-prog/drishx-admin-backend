/**
 * Return quantity + credit approval eligibility (Phase 2: C2/C3).
 * Pure policy helpers live in return-eligibility-policy.ts (DB-free for unit tests).
 * Loaders below accept Prisma tx for race-safe checks.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  estimateReturnCreditFallback,
  type ReturnCreditInvoiceSnapshot,
  type ReturnCreditOrderSnapshot,
} from "./return-credit";
import { ReturnRequestStatus } from "./return-request-status";
import { roundMoney } from "./finance/tax-calc";
import {
  RETURN_ALWAYS_RESERVE_STATUSES,
  RETURN_CREDIT_MONEY_EPS,
  aggregateQuantitiesByOrderId,
  computeMaxEligibleCredit,
  statusReservesReturnQuantity,
} from "./return-eligibility-policy";

export {
  RETURN_CREDIT_MONEY_EPS,
  RETURN_QTY_EPS,
  RETURN_ALWAYS_RESERVE_STATUSES,
  statusReservesReturnQuantity,
  aggregateQuantitiesByOrderId,
  validateRequestedReturnQuantities,
  computeMaxEligibleCredit,
  resolveApprovedCreditAmount,
  ReturnEligibilityError,
} from "./return-eligibility-policy";

type Db = Prisma.TransactionClient | PrismaClient;

export async function loadReservedReturnQuantitiesByOrderId(
  db: Db,
  orderIds: string[],
  excludeReturnRequestId?: string
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (orderIds.length === 0) return map;

  const rows = await db.returnRequestItem.findMany({
    where: {
      originalOrderId: { in: orderIds },
      ...(excludeReturnRequestId
        ? { returnRequestId: { not: excludeReturnRequestId } }
        : {}),
      returnRequest: {
        OR: [
          { status: { in: RETURN_ALWAYS_RESERVE_STATUSES as never[] } },
          {
            status: ReturnRequestStatus.CLOSED,
            decisionType: { in: ["CREDIT", "REPLACEMENT"] },
          },
        ],
      },
    },
    select: {
      originalOrderId: true,
      quantity: true,
      returnRequest: { select: { status: true, decisionType: true } },
    },
  });

  for (const row of rows) {
    if (
      !statusReservesReturnQuantity(
        row.returnRequest.status,
        row.returnRequest.decisionType
      )
    ) {
      continue;
    }
    const qty = Number(row.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    map.set(
      row.originalOrderId,
      (map.get(row.originalOrderId) ?? 0) + qty
    );
  }
  return map;
}

/**
 * Prior APPROVED_CREDIT (and CLOSED+CREDIT) amounts attributed per original order.
 * Multi-order credit notes are split by item-level estimate share.
 */
export async function loadPriorApprovedCreditsByOrderId(
  db: Db,
  orderIds: string[],
  excludeReturnRequestId?: string,
  pricing?: {
    ordersById: Map<string, ReturnCreditOrderSnapshot>;
    invoicesByOrderId?: Map<string, ReturnCreditInvoiceSnapshot>;
  }
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (orderIds.length === 0) return map;

  const returns = await db.returnRequest.findMany({
    where: {
      ...(excludeReturnRequestId ? { id: { not: excludeReturnRequestId } } : {}),
      decisionType: "CREDIT",
      OR: [
        { status: ReturnRequestStatus.APPROVED_CREDIT },
        { status: ReturnRequestStatus.CLOSED },
      ],
      items: { some: { originalOrderId: { in: orderIds } } },
    },
    select: {
      approvedAmount: true,
      creditNote: { select: { amount: true } },
      items: {
        where: { originalOrderId: { in: orderIds } },
        select: { originalOrderId: true, quantity: true },
      },
    },
  });

  for (const ret of returns) {
    const amount = roundMoney(
      Number(ret.creditNote?.amount ?? ret.approvedAmount ?? 0)
    );
    if (!(amount > RETURN_CREDIT_MONEY_EPS) || ret.items.length === 0) continue;

    const qtyByOrder = aggregateQuantitiesByOrderId(
      ret.items.map((i) => ({
        originalOrderId: i.originalOrderId,
        quantity: Number(i.quantity),
      }))
    );

    if (!pricing) {
      const share = roundMoney(amount / Math.max(1, qtyByOrder.size));
      for (const orderId of qtyByOrder.keys()) {
        map.set(orderId, roundMoney((map.get(orderId) ?? 0) + share));
      }
      continue;
    }

    const weights = [...qtyByOrder.entries()].map(([orderId, quantity]) => ({
      orderId,
      weight: estimateReturnCreditFallback({
        items: [{ originalOrderId: orderId, quantity }],
        ordersById: pricing.ordersById,
        invoicesByOrderId: pricing.invoicesByOrderId,
      }),
    }));
    const weightSum = weights.reduce((s, w) => s + w.weight, 0);
    if (weightSum <= RETURN_CREDIT_MONEY_EPS) {
      const share = roundMoney(amount / Math.max(1, weights.length));
      for (const w of weights) {
        map.set(w.orderId, roundMoney((map.get(w.orderId) ?? 0) + share));
      }
      continue;
    }
    for (const w of weights) {
      const share = roundMoney((amount * w.weight) / weightSum);
      map.set(w.orderId, roundMoney((map.get(w.orderId) ?? 0) + share));
    }
  }

  return map;
}

/** Lock order rows so concurrent return submits/approvals serialize on qty. */
export async function lockOrdersForReturnEligibility(
  tx: Prisma.TransactionClient,
  orderIds: string[]
): Promise<void> {
  const unique = [...new Set(orderIds.filter(Boolean))];
  for (const orderId of unique) {
    await tx.$executeRaw`
      SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
    `;
  }
}

/** Server helper: max eligible credit for a return request id (for UI / GET). */
export async function getEligibleCreditAmountForReturnRequest(
  returnRequestId: string,
  db: Db = prisma
): Promise<number> {
  const request = await db.returnRequest.findUnique({
    where: { id: returnRequestId },
    select: {
      items: {
        select: { originalOrderId: true, quantity: true },
      },
    },
  });
  if (!request || request.items.length === 0) return 0;

  const orderIds = [
    ...new Set(request.items.map((i) => i.originalOrderId)),
  ];
  const orders = await db.order.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      totalAmount: true,
    },
  });
  const invoices = await db.invoice.findMany({
    where: { orderId: { in: orderIds } },
    select: {
      orderId: true,
      amount: true,
      lines: {
        select: { quantity: true, unitPrice: true, lineTotal: true },
        orderBy: { lineNumber: "asc" },
      },
    },
  });
  const ordersById = new Map(
    orders.map((o) => [
      o.id,
      {
        id: o.id,
        quantity: Number(o.quantity),
        unitPrice: Number(o.unitPrice),
        totalAmount: Number(o.totalAmount),
      },
    ])
  );
  const invoicesByOrderId = new Map(
    invoices.map((inv) => [
      inv.orderId,
      {
        orderId: inv.orderId,
        amount: Number(inv.amount),
        lines: inv.lines.map((l) => ({
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          lineTotal: Number(l.lineTotal),
        })),
      },
    ])
  );
  const priorCreditedByOrderId = await loadPriorApprovedCreditsByOrderId(
    db,
    orderIds,
    returnRequestId,
    { ordersById, invoicesByOrderId }
  );
  return computeMaxEligibleCredit({
    items: request.items.map((i) => ({
      originalOrderId: i.originalOrderId,
      quantity: Number(i.quantity),
    })),
    ordersById,
    invoicesByOrderId,
    priorCreditedByOrderId,
  });
}
