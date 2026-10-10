import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../lib/session-auth";
import { prisma } from "../../lib/prisma";
import {
  TransactionType,
  LedgerEntryType,
  TransactionStatus,
} from "@prisma/client";
import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../lib/audit";

/** Extract & verify JWT from Authorization header */
// ─────────────────────────────────────────────────────────────
// GET /api/income
// Access: ADMIN | EMPLOYEE
// Returns all income transactions (type: CREDIT)
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

  try {
    const income = await prisma.transaction.findMany({
      where: { type: TransactionType.CREDIT },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        ledgerEntries: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(income);
  } catch (error) {
    console.error("GET /api/income error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/income
// Access: ADMIN | EMPLOYEE
// Record a new income (CREDIT transaction + ledger entry)
// Body: { amount, description?, reference?, currency?, status? }
// userId is taken from the JWT token automatically
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

  try {
    const body = await req.json();
    const { amount, description, reference, currency, status } = body;

    if (!amount) {
      return NextResponse.json(
        { error: "amount is required." },
        { status: 400 }
      );
    }

    const finalReference =
      reference || `INC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Sequential queries — avoids P2028 on Supabase connection pooler
    const newTransaction = await prisma.transaction.create({
      data: {
        reference: finalReference,
        amount: Number(amount),
        currency: currency || "INR",
        type: TransactionType.CREDIT,
        status: status || TransactionStatus.COMPLETED,
        description: description || "Income recorded",
        userId: session.userId, // from JWT — no need to pass in body
      },
    });

    await prisma.ledgerEntry.create({
      data: {
        transactionId: newTransaction.id,
        entryType: LedgerEntryType.CREDIT,
        amount: Number(amount),
        description: description || "Income recorded",
      },
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.PAYMENT_CREATED,
      module: AuditModule.FINANCE,
      entityType: "Transaction",
      entityId: newTransaction.id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      context: {
        reference: finalReference,
        amount: String(amount),
        type: "CREDIT",
      },
      activityMessage: `Income recorded — ${finalReference}`,
    });

    return NextResponse.json(newTransaction, { status: 201 });
  } catch (error) {
    console.error("POST /api/income error:", error);
    if ((error as any).code === "P2002") {
      return NextResponse.json(
        { error: "Reference already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
