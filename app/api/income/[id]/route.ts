import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { prisma } from "../../../lib/prisma";
import {
  TransactionType,
  TransactionStatus,
  LedgerEntryType,
} from "@prisma/client";
import { voidTransaction } from "../../../lib/audit-query";
import {
  ReasonCode,
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  diffFields,
  recordAuditEvent,
} from "../../../lib/audit";

/** Extract & verify JWT from Authorization header */
// ─────────────────────────────────────────────────────────────
// GET /api/income/:id
// Access: ADMIN | EMPLOYEE
// Returns a single income record with user & ledger details
// ─────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const income = await prisma.transaction.findFirst({
      where: { id, type: TransactionType.CREDIT },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        ledgerEntries: true,
      },
    });

    if (!income) {
      return NextResponse.json(
        { error: "Income record not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(income);
  } catch (error) {
    console.error("GET /api/income/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/income/:id
// Access: ADMIN | EMPLOYEE
// Update amount, status, description, or reference of an income record
// Body: { amount?, status?, description?, reference? }
// ─────────────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { amount, status, description, reference } = body;

    if (!amount && !status && !description && !reference) {
      return NextResponse.json(
        { error: "Provide at least one field to update: amount, status, description, or reference." },
        { status: 400 }
      );
    }

    const validStatuses = Object.values(TransactionStatus);
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}.` },
        { status: 400 }
      );
    }

    // Verify it's an income record
    const existing = await prisma.transaction.findFirst({
      where: { id, type: TransactionType.CREDIT },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Income record not found." },
        { status: 404 }
      );
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        ...(amount !== undefined && { amount: Number(amount) }),
        ...(status && { status }),
        ...(description && { description }),
        ...(reference && { reference }),
      },
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.PAYMENT_CREATED,
      module: AuditModule.FINANCE,
      entityType: "Transaction",
      entityId: id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      changes: diffFields(
        {
          amount: existing.amount,
          status: existing.status,
          description: existing.description,
          reference: existing.reference,
        },
        {
          amount: updated.amount,
          status: updated.status,
          description: updated.description,
          reference: updated.reference,
        },
        ["amount", "status", "description", "reference"]
      ),
      activityMessage: `Income updated — ${updated.reference}`,
    });

    // Sync ledger entry if amount or description changed
    if (amount || description) {
      const firstEntry = await prisma.ledgerEntry.findFirst({
        where: { transactionId: id },
      });
      if (firstEntry) {
        await prisma.ledgerEntry.update({
          where: { id: firstEntry.id },
          data: {
            ...(amount !== undefined && { amount: Number(amount) }),
            ...(description && { description }),
          },
        });
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/income/[id] error:", error);
    if ((error as any).code === "P2002") {
      return NextResponse.json(
        { error: "Reference already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/income/:id — void (preserve history)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reasonText = String(body.reason ?? "").trim() || null;

    const existing = await prisma.transaction.findFirst({
      where: { id, type: TransactionType.CREDIT },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Income record not found." },
        { status: 404 }
      );
    }

    await voidTransaction(
      id,
      ReasonCode.VOID.INCORRECT_ENTRY,
      reasonText,
      session
    );

    return NextResponse.json(
      { message: "Income record voided successfully." },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE /api/income/[id] error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
