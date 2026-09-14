import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session-auth";
import { prisma } from "../../../../lib/prisma";
import {
  TransactionType,
  LedgerEntryType,
  TransactionStatus,
  ExpenseCategory,
} from "@prisma/client";
import { voidTransaction } from "../../../../lib/audit-query";
import { ReasonCode } from "../../../../lib/audit";

// ─────────────────────────────────────────────────────────────
// PUT /api/expenses/manual/:id
// Access: ADMIN only
// Update a manual expense (amount, description, status)
// Body: { amount?, description?, status? }
// ─────────────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // Next.js 15: params is a Promise
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  try {
    // Verify expense exists and is a manual expense
    const existing = await prisma.transaction.findFirst({
      where: {
        id,
        type: TransactionType.DEBIT,
        category: ExpenseCategory.MANUAL,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Manual expense not found." },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { amount, description, status } = body;

    if (!amount && !description && !status) {
      return NextResponse.json(
        { error: "Provide at least one field to update: amount, description, or status." },
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

    // Sequential queries — avoids P2028 on Supabase connection pooler
    const updatedTransaction = await prisma.transaction.update({
      where: { id },
      data: {
        ...(amount && { amount: Number(amount) }),
        ...(description && { description }),
        ...(status && { status }),
      },
    });

    // Sync the first ledger entry if amount or description changed
    if (amount || description) {
      const firstEntry = await prisma.ledgerEntry.findFirst({
        where: { transactionId: id },
      });
      if (firstEntry) {
        await prisma.ledgerEntry.update({
          where: { id: firstEntry.id },
          data: {
            ...(amount && { amount: Number(amount) }),
            ...(description && { description }),
          },
        });
      }
    }

    return NextResponse.json(updatedTransaction);
  } catch (error) {
    console.error("PUT /api/expenses/manual/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/expenses/manual/:id
// Access: ADMIN only
// Hard-deletes a manual expense and its ledger entries
// ─────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // Next.js 15: params is a Promise
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  try {
    const existing = await prisma.transaction.findFirst({
      where: {
        id,
        type: TransactionType.DEBIT,
        category: ExpenseCategory.MANUAL,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Manual expense not found." },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const reasonText = String(body.reason ?? "").trim() || null;
    await voidTransaction(
      id,
      ReasonCode.VOID.INCORRECT_ENTRY,
      reasonText,
      session
    );

    return NextResponse.json(
      { message: "Manual expense voided successfully." },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE /api/expenses/manual/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
