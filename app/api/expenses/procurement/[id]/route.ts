import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { prisma } from "../../../../lib/prisma";
import { ExpenseCategory, TransactionType } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// GET /api/expenses/procurement/:id
// Access: ADMIN | EMPLOYEE
// Returns a single procurement expense by transaction ID
// ─────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // Next.js 15: params is a Promise
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const expense = await prisma.transaction.findFirst({
      where: {
        id,
        type: TransactionType.DEBIT,
        category: ExpenseCategory.PROCUREMENT,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        ledgerEntries: true,
      },
    });

    if (!expense) {
      return NextResponse.json(
        { error: "Procurement expense not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(expense);
  } catch (error) {
    console.error("GET /api/expenses/procurement/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
