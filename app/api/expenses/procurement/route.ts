import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { prisma } from "../../../lib/prisma";
import { requireStaffPermission } from "../../../lib/staff-access";
import {
  applyStockIntake,
  formatLensStockLabel,
  processStockIntakeBatch,
  receiveStockLine,
  type StockIntakeItemInput,
  validateStockIntakeItem,
} from "../../../lib/stock-intake";
import { fulfillProcurementOrder, getOrderLensId } from "../../../lib/order-inventory";
import { recordProcurementReceipt } from "../../../lib/procurement-requests";
import {
  findProcurementReplay,
  getClientRequestId,
  markClientRequestProcessed,
  procurementBatchReferenceFor,
  procurementReferenceFor,
  replayProcurementBatch,
} from "../../../lib/idempotency";
import {
  LensType,
  TransactionType,
  LedgerEntryType,
  TransactionStatus,
  ExpenseCategory,
} from "@prisma/client";
import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../lib/audit";

/** Extract & verify JWT from Authorization header */
function parseStockItems(raw: unknown): StockIntakeItemInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }

  return raw.map((entry) => ({
    lensType: entry.lensType as LensType,
    lensId: String(entry.lensId),
    quantityAdded: Number(entry.quantityAdded),
    amount: Number(entry.amount),
    costPrice: Number(entry.costPrice),
    sellingPrice: Number(entry.sellingPrice),
    description: entry.description ? String(entry.description) : undefined,
    orderId: typeof entry.orderId === "string" ? entry.orderId : null,
  }));
}

// ─────────────────────────────────────────────────────────────
// GET /api/expenses/procurement
// Access: ADMIN | EMPLOYEE
// Returns all procurement expenses (DEBIT + PROCUREMENT)
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "procurement.view");
    if ("error" in gate) return gate.error;
  }

  try {
    const expenses = await prisma.transaction.findMany({
      where: {
        type: TransactionType.DEBIT,
        category: ExpenseCategory.PROCUREMENT,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        ledgerEntries: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(expenses);
  } catch (error) {
    console.error("GET /api/expenses/procurement error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/expenses/procurement
// Access: ADMIN | EMPLOYEE
// Single: { amount, lensType, lensId, quantityAdded, description?, ... }
// Batch:  { items: [{ lensType, lensId, quantityAdded, amount, description? }], notes? }
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "procurement.intake");
    if ("error" in gate) return gate.error;
  }

  try {
    const body = await req.json();
    const clientRequestId = getClientRequestId(req);
    const batchItems = parseStockItems(body.items);

    // ── Idempotency guard ─────────────────────────────────────────────────
    // The mobile offline queue replays submissions with the same X-Request-Id.
    // Returning the stored result keeps stock, expense and cash single-applied.
    if (clientRequestId) {
      const replay = batchItems
        ? await replayProcurementBatch(clientRequestId)
        : await findProcurementReplay(clientRequestId);
      if (replay) {
        return NextResponse.json({ ...replay, replayed: true }, { status: 200 });
      }
    }

    if (batchItems) {
      if (clientRequestId) {
        // Anchor the whole batch on the request id so a replay is detectable
        // via the unique Transaction.reference of its first line.
        const anchored = await processStockIntakeBatch(
          batchItems,
          session.userId,
          typeof body.notes === "string" ? body.notes : undefined,
          procurementBatchReferenceFor(clientRequestId)
        );
        await markClientRequestProcessed(clientRequestId);
        return NextResponse.json(anchored, { status: 201 });
      }

      const batchResult = await processStockIntakeBatch(
        batchItems,
        session.userId,
        body.notes
      );
      return NextResponse.json(batchResult, { status: 201 });
    }

    const {
      amount,
      description,
      reference,
      currency,
      status,
      lensType,
      lensId,
      quantityAdded,
      costPrice,
      sellingPrice,
      orderId,
    } = body;

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "A valid amount greater than 0 is required." }, { status: 400 });
    }

    const isStockIntake = Boolean(lensType && lensId && quantityAdded !== undefined);
    const parsedQty = Number(quantityAdded);
    const parsedCostPrice = Number(costPrice);
    const parsedSellingPrice = Number(sellingPrice);

    if (isStockIntake) {
      const itemError = validateStockIntakeItem({
        lensType: lensType as LensType,
        lensId,
        quantityAdded: parsedQty,
        amount: parsedAmount,
        costPrice: parsedCostPrice,
        sellingPrice: parsedSellingPrice,
      });
      if (itemError) {
        return NextResponse.json({ error: itemError }, { status: 400 });
      }
    }

    const finalReference =
      reference ||
      (clientRequestId
        ? procurementReferenceFor(clientRequestId)
        : `PROC-${Date.now()}-${Math.floor(Math.random() * 10000)}`);

    let updatedLens: Awaited<ReturnType<typeof applyStockIntake>> | null = null;
    let updatedOrder = null;
    let settledRequests: Awaited<ReturnType<typeof recordProcurementReceipt>> = [];
    let expenseDescription = description?.trim() || "Procurement expense";
    const normalizedOrderId =
      typeof orderId === "string" && orderId.trim() ? orderId.trim() : null;

    // Validate the order BEFORE any write, so a rejected request cannot leave
    // stock incremented (the previous non-transactional path could).
    if (isStockIntake && normalizedOrderId) {
      const order = await prisma.order.findUnique({ where: { id: normalizedOrderId } });
      if (!order) {
        return NextResponse.json({ error: "Order not found." }, { status: 404 });
      }
      if (
        session.role === "EMPLOYEE" &&
        order.assignedToId &&
        order.assignedToId !== session.userId
      ) {
        return NextResponse.json(
          { error: "Forbidden. Not your assigned order." },
          { status: 403 }
        );
      }
      if (order.status !== "AWAITING_PROCUREMENT") {
        return NextResponse.json(
          { error: "Only procurement orders can be fulfilled from this flow." },
          { status: 400 }
        );
      }
      const orderLensId = getOrderLensId(order);
      if (!orderLensId || orderLensId !== lensId) {
        return NextResponse.json(
          { error: "Selected product does not match this order line." },
          { status: 400 }
        );
      }
    }

    // ── One transaction: stock + movement + expense + ledger ──────────────
    // Stock, the movement record, the expense row and the ledger entry now
    // commit together or not at all.
    const result = await prisma.$transaction(async (tx) => {
      let lens: Awaited<ReturnType<typeof applyStockIntake>> | null = null;
      let settled: Awaited<ReturnType<typeof recordProcurementReceipt>> = [];
      let lineDescription = expenseDescription;

      if (isStockIntake) {
        const received = await receiveStockLine({
          lensType: lensType as LensType,
          lensId,
          quantityAdded: parsedQty,
          costPrice: parsedCostPrice,
          sellingPrice: parsedSellingPrice,
          orderId: normalizedOrderId,
          actorUserId: session.userId,
          referenceId: finalReference,
          client: tx,
        });
        lens = received.lens;
        settled = received.settledRequests;

        const lensLabel = formatLensStockLabel(lensType as LensType, received.lens);
        lineDescription =
          description?.trim() ||
          `Stock intake: ${lensLabel} (+${parsedQty} units, cost ₹${parsedCostPrice}/unit, sell ₹${parsedSellingPrice}, new qty ${received.lens.quantity})`;
      }

      const newTransaction = await tx.transaction.create({
        data: {
          reference: finalReference,
          amount: parsedAmount,
          currency: currency || "INR",
          type: TransactionType.DEBIT,
          status: status || TransactionStatus.COMPLETED,
          description: lineDescription,
          category: ExpenseCategory.PROCUREMENT,
          userId: session.userId,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          transactionId: newTransaction.id,
          entryType: LedgerEntryType.DEBIT,
          amount: parsedAmount,
          description: lineDescription,
        },
      });

      return { transaction: newTransaction, lens, settledRequests: settled };
    });

    updatedLens = result.lens;
    settledRequests = result.settledRequests;
    expenseDescription = description?.trim() || "Procurement expense";

    if (isStockIntake && normalizedOrderId) {
      updatedOrder = await fulfillProcurementOrder(normalizedOrderId);
    }

    const auditEvent = await recordAuditEvent(prisma, {
      action: AuditAction.EXPENSE_CREATED,
      module: AuditModule.FINANCE,
      entityType: "Transaction",
      entityId: result.transaction.id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      context: {
        reference: finalReference,
        amount: String(parsedAmount),
        category: "PROCUREMENT",
        orderId: normalizedOrderId,
        clientRequestId,
        settledProcurementRequests: settledRequests
          .map((r) => r.publicId)
          .join(",") || null,
      },
      relatedRefs: {
        ...(normalizedOrderId ? { orderId: normalizedOrderId } : {}),
        transactionId: result.transaction.id,
      },
      activityMessage: `Procurement expense — ${finalReference}`,
    });

    if (clientRequestId) {
      await markClientRequestProcessed(clientRequestId, auditEvent?.id ?? null);
    }

    return NextResponse.json(
      {
        transaction: result.transaction,
        lens: updatedLens,
        order: updatedOrder,
        procurementRequests: settledRequests,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/expenses/procurement error:", error);
    // P2002 = unique violation. With deterministic references this is the
    // database-level backstop for a concurrent duplicate submission.
    const prismaCode = (error as { code?: unknown }).code;
    if (prismaCode === "P2002") {
      return NextResponse.json(
        { error: "This procurement receipt was already recorded." },
        { status: 409 }
      );
    }
    if ((error as Error).message === "Lens not found.") {
      return NextResponse.json({ error: "Lens not found." }, { status: 404 });
    }
    if ((error as Error).message) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
