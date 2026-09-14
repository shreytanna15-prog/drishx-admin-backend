import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session-auth";
import { prisma } from "../../../lib/prisma";
import {
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

// ─────────────────────────────────────────────────────────────
// GET /api/expenses/manual
// Access: ADMIN only
// Returns all manual expenses (DEBIT + MANUAL)
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  try {
    const expenses = await prisma.transaction.findMany({
      where: {
        type: TransactionType.DEBIT,
        category: ExpenseCategory.MANUAL,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        ledgerEntries: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(expenses);
  } catch (error) {
    console.error("GET /api/expenses/manual error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/expenses/manual
// Access: ADMIN only
// Admin manually records a business expense (rent, salary, etc.)
// Body: { amount, description, reference?, currency?, status? }
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { amount, description, reference, currency, status } = body;

    if (!amount) {
      return NextResponse.json(
        { error: "amount is required." },
        { status: 400 }
      );
    }
    if (!description) {
      return NextResponse.json(
        { error: "description is required for manual expenses." },
        { status: 400 }
      );
    }

    const finalReference =
      reference ||
      `MAN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Sequential queries — avoids P2028 on Supabase connection pooler
    const newTransaction = await prisma.transaction.create({
      data: {
        reference: finalReference,
        amount: Number(amount),
        currency: currency || "INR",
        type: TransactionType.DEBIT,
        status: status || TransactionStatus.COMPLETED,
        description,
        category: ExpenseCategory.MANUAL,
        userId: session.userId,
      },
    });

    await prisma.ledgerEntry.create({
      data: {
        transactionId: newTransaction.id,
        entryType: LedgerEntryType.DEBIT,
        amount: Number(amount),
        description,
      },
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.EXPENSE_CREATED,
      module: AuditModule.FINANCE,
      entityType: "Transaction",
      entityId: newTransaction.id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      context: {
        reference: finalReference,
        amount: String(amount),
        category: "MANUAL",
      },
      activityMessage: `Manual expense recorded — ${finalReference}`,
    });

    return NextResponse.json(newTransaction, { status: 201 });
  } catch (error) {
    console.error("POST /api/expenses/manual error:", error);
    if ((error as any).code === "P2002") {
      return NextResponse.json(
        { error: "Reference already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
