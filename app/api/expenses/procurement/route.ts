import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session-auth";
import { prisma } from "../../../lib/prisma";
import { requireStaffPermission } from "../../../lib/staff-access";
import {
  applyStockIntake,
  formatLensStockLabel,
  processStockIntakeBatch,
  type StockIntakeItemInput,
  validateStockIntakeItem,
} from "../../../lib/stock-intake";
import { fulfillProcurementOrder, getOrderLensId } from "../../../lib/order-inventory";
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
  }));
}

// ─────────────────────────────────────────────────────────────
// GET /api/expenses/procurement
// Access: ADMIN | EMPLOYEE
// Returns all procurement expenses (DEBIT + PROCUREMENT)
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
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
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "procurement.intake");
    if ("error" in gate) return gate.error;
  }

  try {
    const body = await req.json();
    const batchItems = parseStockItems(body.items);

    if (batchItems) {
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
      reference || `PROC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    let updatedLens: Awaited<ReturnType<typeof applyStockIntake>> | null = null;
    let expenseDescription = description?.trim() || "Procurement expense";

    if (isStockIntake) {
      updatedLens = await applyStockIntake(
        lensType as LensType,
        lensId,
        parsedQty,
        parsedCostPrice,
        parsedSellingPrice
      );
      const lensLabel = formatLensStockLabel(lensType as LensType, updatedLens);
      expenseDescription =
        description?.trim() ||
        `Stock intake: ${lensLabel} (+${parsedQty} units, cost ₹${parsedCostPrice}/unit, sell ₹${parsedSellingPrice}, new qty ${updatedLens.quantity})`;

      if (typeof orderId === "string" && orderId.trim()) {
        const order = await prisma.order.findUnique({ where: { id: orderId.trim() } });
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
    }

    const newTransaction = await prisma.transaction.create({
      data: {
        reference: finalReference,
        amount: parsedAmount,
        currency: currency || "INR",
        type: TransactionType.DEBIT,
        status: status || TransactionStatus.COMPLETED,
        description: expenseDescription,
        category: ExpenseCategory.PROCUREMENT,
        userId: session.userId,
      },
    });

    await prisma.ledgerEntry.create({
      data: {
        transactionId: newTransaction.id,
        entryType: LedgerEntryType.DEBIT,
        amount: parsedAmount,
        description: expenseDescription,
      },
    });

    let updatedOrder = null;
    if (isStockIntake && typeof orderId === "string" && orderId.trim()) {
      updatedOrder = await fulfillProcurementOrder(orderId.trim());
    }

    await recordAuditEvent(prisma, {
      action: AuditAction.EXPENSE_CREATED,
      module: AuditModule.FINANCE,
      entityType: "Transaction",
      entityId: newTransaction.id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      context: {
        reference: finalReference,
        amount: String(parsedAmount),
        category: "PROCUREMENT",
        orderId: typeof orderId === "string" ? orderId.trim() : null,
      },
      relatedRefs:
        typeof orderId === "string" && orderId.trim()
          ? { orderId: orderId.trim(), transactionId: newTransaction.id }
          : { transactionId: newTransaction.id },
      activityMessage: `Procurement expense — ${finalReference}`,
    });

    return NextResponse.json(
      {
        transaction: newTransaction,
        lens: updatedLens,
        order: updatedOrder,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/expenses/procurement error:", error);
    if ((error as Error).message === "Lens not found.") {
      return NextResponse.json({ error: "Lens not found." }, { status: 404 });
    }
    if ((error as Error).message) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
    if ((error as any).code === "P2002") {
      return NextResponse.json({ error: "Reference already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
