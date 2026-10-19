import {
  LoyaltyTransactionStatus,
  LoyaltyTransactionType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { roundMoney } from "@/app/lib/finance/tax-calc";
import {
  computeLoyaltyReversePoints,
  LOYALTY_REVERSE_EPS,
} from "./reverse-policy";
import { recomputeWallet } from "./wallet";

type TxClient = Prisma.TransactionClient | typeof prisma;

/**
 * Reverse loyalty points proportionally when an order's goods are returned or a
 * credit note reduces the invoice.
 *
 * Uses remaining taxable / remaining points so successive returns do not
 * under-reverse (prior credits reduce the taxable base).
 */
export async function reverseOrderLoyalty(input: {
  customerId: string;
  orderId: string;
  invoiceId?: string | null;
  creditNoteId?: string | null;
  returnRequestId?: string | null;
  originalTaxable: number;
  returnedTaxable: number;
  /** Points currently remaining on earn/bonus rows (not original earn total). */
  remainingPoints: number;
  /** Taxable already credited on this invoice via prior credit notes. */
  priorReturnedTaxable?: number;
  reason: string;
  db?: TxClient;
}): Promise<number> {
  const db = input.db ?? prisma;
  const reversePoints = computeLoyaltyReversePoints({
    originalTaxable: input.originalTaxable,
    priorReturnedTaxable: input.priorReturnedTaxable ?? 0,
    returnedTaxable: input.returnedTaxable,
    remainingPoints: input.remainingPoints,
  });

  // Always write a return-scoped marker when returnRequestId is set so retries
  // are idempotent even when reversePoints is 0 (earn already depleted).
  const writeReturnMarker = Boolean(input.returnRequestId);

  if (reversePoints <= LOYALTY_REVERSE_EPS && !writeReturnMarker) {
    return 0;
  }

  const wallet = await db.loyaltyWallet.findUnique({
    where: { customerId: input.customerId },
  });
  if (!wallet) {
    if (writeReturnMarker) {
      await db.loyaltyTransaction.create({
        data: {
          customerId: input.customerId,
          orderId: input.orderId,
          invoiceId: input.invoiceId ?? null,
          creditNoteId: input.creditNoteId ?? null,
          returnRequestId: input.returnRequestId ?? null,
          type: LoyaltyTransactionType.POINTS_REVERSED,
          points: 0,
          balanceAfter: 0,
          status: LoyaltyTransactionStatus.AVAILABLE,
          reason: `${input.reason} (no wallet; marker)`,
          createdAt: new Date(),
        },
      });
    }
    return 0;
  }

  let remaining = reversePoints;

  if (remaining > LOYALTY_REVERSE_EPS) {
    const availableEarn = await db.loyaltyTransaction.findMany({
      where: {
        customerId: input.customerId,
        orderId: input.orderId,
        status: LoyaltyTransactionStatus.AVAILABLE,
        type: {
          in: [
            LoyaltyTransactionType.POINTS_EARNED,
            LoyaltyTransactionType.ADVANCE_BONUS,
          ],
        },
        points: { gt: 0 },
      },
      orderBy: { createdAt: "asc" },
    });

    for (const t of availableEarn) {
      if (remaining <= 0) break;
      const take = Math.min(Number(t.points) || 0, remaining);
      if (take <= 0) continue;
      remaining = roundMoney(remaining - take);
      await db.loyaltyTransaction.update({
        where: { id: t.id },
        data: {
          points: (Number(t.points) || 0) - take,
          status:
            (Number(t.points) || 0) - take <= 0
              ? LoyaltyTransactionStatus.REVERSED
              : t.status,
        },
      });
    }

    const pendingEarn = await db.loyaltyTransaction.findMany({
      where: {
        customerId: input.customerId,
        orderId: input.orderId,
        status: LoyaltyTransactionStatus.PENDING,
        type: {
          in: [
            LoyaltyTransactionType.POINTS_EARNED,
            LoyaltyTransactionType.ADVANCE_BONUS,
          ],
        },
        points: { gt: 0 },
      },
      orderBy: { createdAt: "asc" },
    });

    for (const t of pendingEarn) {
      if (remaining <= 0) break;
      const take = Math.min(Number(t.points) || 0, remaining);
      if (take <= 0) continue;
      remaining = roundMoney(remaining - take);
      await db.loyaltyTransaction.update({
        where: { id: t.id },
        data: {
          points: (Number(t.points) || 0) - take,
          status:
            (Number(t.points) || 0) - take <= 0
              ? LoyaltyTransactionStatus.CANCELLED
              : t.status,
        },
      });
    }

    // Remainder not covered by live earnings → negative adjustment (already spent).
    if (remaining > LOYALTY_REVERSE_EPS) {
      await db.loyaltyTransaction.create({
        data: {
          customerId: input.customerId,
          orderId: input.orderId,
          invoiceId: input.invoiceId ?? null,
          creditNoteId: input.creditNoteId ?? null,
          returnRequestId: input.returnRequestId ?? null,
          type: LoyaltyTransactionType.POINTS_REVERSED,
          points: -Math.round(remaining * 100) / 100,
          balanceAfter: 0,
          status: LoyaltyTransactionStatus.AVAILABLE,
          reason: input.reason,
          createdAt: new Date(),
        },
      });
      remaining = 0;
    }
  }

  // Return-scoped idempotency marker (0 pts when earn reduction alone covered it,
  // or when reversePoints was already 0). Skip if we already wrote a non-zero
  // POINTS_REVERSED row with this returnRequestId above.
  if (writeReturnMarker) {
    const markerExists = await db.loyaltyTransaction.findFirst({
      where: {
        customerId: input.customerId,
        orderId: input.orderId,
        returnRequestId: input.returnRequestId!,
        type: LoyaltyTransactionType.POINTS_REVERSED,
      },
      select: { id: true },
    });
    if (!markerExists) {
      await db.loyaltyTransaction.create({
        data: {
          customerId: input.customerId,
          orderId: input.orderId,
          invoiceId: input.invoiceId ?? null,
          creditNoteId: input.creditNoteId ?? null,
          returnRequestId: input.returnRequestId ?? null,
          type: LoyaltyTransactionType.POINTS_REVERSED,
          points: 0,
          balanceAfter: 0,
          status: LoyaltyTransactionStatus.AVAILABLE,
          reason: `${input.reason} (return marker)`,
          createdAt: new Date(),
        },
      });
    }
  }

  await recomputeWallet(input.customerId, db);
  return reversePoints;
}

/**
 * Convenience hook for return flows: reverses points using remaining taxable
 * and remaining earn points (cumulative-safe across successive returns).
 */
export async function reverseForReturn(input: {
  customerId: string;
  orderId: string;
  invoiceId?: string | null;
  creditNoteId?: string | null;
  returnRequestId?: string | null;
  /** Tax-exclusive credit share (never tax-inclusive grand). */
  returnedTaxable: number;
  reason: string;
  db?: TxClient;
}): Promise<number> {
  const db = input.db ?? prisma;

  // Idempotent: any loyalty row for this return+order blocks a second reverse.
  if (input.returnRequestId) {
    const prior = await db.loyaltyTransaction.findFirst({
      where: {
        customerId: input.customerId,
        orderId: input.orderId,
        returnRequestId: input.returnRequestId,
      },
      select: { id: true },
    });
    if (prior) return 0;
  }

  const earnings = await db.loyaltyTransaction.findMany({
    where: {
      customerId: input.customerId,
      orderId: input.orderId,
      type: {
        in: [
          LoyaltyTransactionType.POINTS_EARNED,
          LoyaltyTransactionType.ADVANCE_BONUS,
        ],
      },
      points: { gt: 0 },
    },
  });
  const remainingPoints = earnings.reduce(
    (sum, t) => sum + (Number(t.points) || 0),
    0
  );

  let originalTaxable = 0;
  if (input.invoiceId) {
    const invoice = await db.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { taxableAmount: true },
    });
    originalTaxable = Number(invoice?.taxableAmount) || 0;
  }
  if (originalTaxable <= LOYALTY_REVERSE_EPS) {
    // Still plant return marker when earn/tax base is gone so retries stay no-ops.
    if (input.returnRequestId) {
      return reverseOrderLoyalty({
        customerId: input.customerId,
        orderId: input.orderId,
        invoiceId: input.invoiceId ?? null,
        creditNoteId: input.creditNoteId ?? null,
        returnRequestId: input.returnRequestId,
        originalTaxable: 0,
        returnedTaxable: 0,
        remainingPoints: 0,
        priorReturnedTaxable: 0,
        reason: input.reason,
        db,
      });
    }
    return 0;
  }

  // Prior credited taxable on this invoice (exclude this return's CN if present).
  let priorReturnedTaxable = 0;
  if (input.invoiceId) {
    const allocDb = db as TxClient & {
      creditNoteAllocation?: {
        findMany: (args: {
          where: Record<string, unknown>;
          select: { taxableAmount: true };
        }) => Promise<Array<{ taxableAmount: unknown }>>;
      };
    };
    if (typeof allocDb.creditNoteAllocation?.findMany === "function") {
      const priorAllocs = await allocDb.creditNoteAllocation.findMany({
        where: {
          invoiceId: input.invoiceId,
          ...(input.creditNoteId
            ? { creditNoteId: { not: input.creditNoteId } }
            : {}),
          ...(input.returnRequestId
            ? {
                creditNote: {
                  returnRequestId: { not: input.returnRequestId },
                },
              }
            : {}),
        },
        select: { taxableAmount: true },
      });
      priorReturnedTaxable = roundMoney(
        priorAllocs.reduce((s, a) => s + (Number(a.taxableAmount) || 0), 0)
      );
    }
  }

  const returnedTaxable = roundMoney(
    Math.min(
      Number(input.returnedTaxable) || 0,
      Math.max(0, originalTaxable - priorReturnedTaxable)
    )
  );

  return reverseOrderLoyalty({
    customerId: input.customerId,
    orderId: input.orderId,
    invoiceId: input.invoiceId ?? null,
    creditNoteId: input.creditNoteId ?? null,
    returnRequestId: input.returnRequestId ?? null,
    originalTaxable,
    returnedTaxable,
    remainingPoints,
    priorReturnedTaxable,
    reason: input.reason,
    db,
  });
}

/**
 * Reverse loyalty per credit allocation (multi-order returns).
 * Uses each allocation's taxableAmount — never tax-inclusive totals.
 */
export async function reverseLoyaltyForCreditAllocations(input: {
  customerId: string;
  returnRequestId: string;
  creditNoteId: string;
  reason: string;
  allocations: Array<{
    orderId: string;
    invoiceId: string;
    taxableAmount: number;
  }>;
  db?: TxClient;
}): Promise<number> {
  let total = 0;
  for (const alloc of input.allocations) {
    if (!(Number(alloc.taxableAmount) > 0) || !alloc.orderId) continue;
    const reversed = await reverseForReturn({
      customerId: input.customerId,
      orderId: alloc.orderId,
      invoiceId: alloc.invoiceId,
      creditNoteId: input.creditNoteId,
      returnRequestId: input.returnRequestId,
      returnedTaxable: Number(alloc.taxableAmount),
      reason: input.reason,
      db: input.db,
    });
    total = roundMoney(total + reversed);
  }
  return total;
}
