import { NextRequest, NextResponse } from "next/server";
import { ExpenseApprovalStatus, ExpenseDocType } from "@prisma/client";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { prisma } from "@/app/lib/prisma";
import { roundMoney } from "@/app/lib/finance/tax-calc";
import { AuditAction, AuditModule, recordAuditEvent } from "@/app/lib/audit";

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  const { searchParams } = new URL(req.url);
  const resource = searchParams.get("resource") || "expenses";

  if (resource === "cash") {
    if (session.role === "CUSTOMER") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const accounts = await prisma.cashAccount.findMany({
      where:
        session.role === "EMPLOYEE"
          ? { OR: [{ employeeId: session.userId }, { accountType: "COMPANY" }] }
          : undefined,
      include: {
        employee: { select: { id: true, name: true, email: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(accounts);
  }

  const where =
    session.role === "EMPLOYEE"
      ? { employeeId: session.userId }
      : session.role === "ADMIN"
        ? {}
        : { employeeId: "__none__" };

  const status = searchParams.get("status");
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const limitRaw = Number(searchParams.get("limit") ?? "30");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Math.min(
    100,
    Math.max(1, Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 30)
  );
  const skip = (page - 1) * limit;
  const expenseWhere = {
    ...where,
    ...(status ? { status: status as ExpenseApprovalStatus } : {}),
  };
  const [total, expenses] = await Promise.all([
    prisma.expenseRequest.count({ where: expenseWhere }),
    prisma.expenseRequest.findMany({
      where: expenseWhere,
      include: {
        employee: { select: { id: true, name: true, email: true } },
        cashAccount: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);
  return NextResponse.json({
    items: expenses,
    page,
    limit,
    hasMore: skip + expenses.length < total,
    total,
  });
}

export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role === "CUSTOMER") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = await req.json();
  const action = body.action as string | undefined;

  try {
    if (action === "allocate-cash" && session.role === "ADMIN") {
      const amount = roundMoney(Number(body.amount));
      const employeeId = body.employeeId as string;
      let float = await prisma.cashAccount.findFirst({
        where: { employeeId, accountType: "EMPLOYEE_FLOAT" },
      });
      if (!float) {
        float = await prisma.cashAccount.create({
          data: {
            name: `Float — ${employeeId.slice(-6)}`,
            accountType: "EMPLOYEE_FLOAT",
            employeeId,
            balance: 0,
          },
        });
      }
      const company =
        (await prisma.cashAccount.findFirst({
          where: { accountType: "COMPANY" },
        })) ||
        (await prisma.cashAccount.create({
          data: { name: "Company Cash", accountType: "COMPANY", balance: 0 },
        }));

      await prisma.$transaction(async (tx) => {
        const companyBal = roundMoney(Number(company.balance) - amount);
        const floatBal = roundMoney(Number(float!.balance) + amount);
        await tx.cashAccount.update({
          where: { id: company.id },
          data: { balance: companyBal },
        });
        await tx.cashAccount.update({
          where: { id: float!.id },
          data: { balance: floatBal },
        });
        await tx.cashLedgerEntry.create({
          data: {
            cashAccountId: company.id,
            outAmount: amount,
            balanceAfter: companyBal,
            description: `Allocated to employee ${employeeId}`,
            referenceType: "CASH_ALLOCATION",
          },
        });
        await tx.cashLedgerEntry.create({
          data: {
            cashAccountId: float!.id,
            inAmount: amount,
            balanceAfter: floatBal,
            description: "Company cash allocation",
            referenceType: "CASH_ALLOCATION",
          },
        });
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "approve" && session.role === "ADMIN") {
      const expense = await prisma.expenseRequest.findUniqueOrThrow({
        where: { id: body.id },
      });
      if (expense.status !== ExpenseApprovalStatus.PENDING) {
        return NextResponse.json({ error: "Not pending." }, { status: 400 });
      }
      await prisma.$transaction(async (tx) => {
        await tx.expenseRequest.update({
          where: { id: expense.id },
          data: {
            status: ExpenseApprovalStatus.APPROVED,
            reviewedById: session.userId,
            reviewedAt: new Date(),
          },
        });
        if (expense.cashAccountId) {
          const acc = await tx.cashAccount.findUniqueOrThrow({
            where: { id: expense.cashAccountId },
          });
          const bal = roundMoney(Number(acc.balance) - Number(expense.amount));
          await tx.cashAccount.update({
            where: { id: acc.id },
            data: { balance: bal },
          });
          await tx.cashLedgerEntry.create({
            data: {
              cashAccountId: acc.id,
              outAmount: expense.amount,
              balanceAfter: bal,
              description: expense.description || expense.category,
              referenceType: "EXPENSE",
              referenceId: expense.id,
            },
          });
        }
      });
      await recordAuditEvent(prisma, {
        action: AuditAction.EXPENSE_APPROVED,
        module: AuditModule.FINANCE,
        entityType: "ExpenseRequest",
        entityId: expense.id,
        actor: {
          actorType: "HUMAN",
          actorUserId: session.userId,
          actorName: null,
        },
      }).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }

    if (action === "reject" && session.role === "ADMIN") {
      const expense = await prisma.expenseRequest.update({
        where: { id: body.id },
        data: {
          status: ExpenseApprovalStatus.REJECTED,
          reviewedById: session.userId,
          reviewedAt: new Date(),
          rejectReason: body.reason,
        },
      });
      await recordAuditEvent(prisma, {
        action: AuditAction.EXPENSE_REJECTED,
        module: AuditModule.FINANCE,
        entityType: "ExpenseRequest",
        entityId: expense.id,
        actor: {
          actorType: "HUMAN",
          actorUserId: session.userId,
          actorName: null,
        },
      }).catch(() => undefined);
      return NextResponse.json(expense);
    }

    if (action === "reconcile" && session.role === "ADMIN") {
      const acc = await prisma.cashAccount.findUniqueOrThrow({
        where: { id: body.cashAccountId },
      });
      const counted = roundMoney(Number(body.countedBalance));
      const system = Number(acc.balance);
      const log = await prisma.cashReconcileLog.create({
        data: {
          cashAccountId: acc.id,
          systemBalance: system,
          countedBalance: counted,
          difference: roundMoney(counted - system),
          notes: body.notes,
          actorUserId: session.userId,
        },
      });
      return NextResponse.json(log, { status: 201 });
    }

    // Create expense request (employee or admin)
    const billAvailable = body.billAvailable !== false && body.billAvailable !== "NO";
    const expense = await prisma.expenseRequest.create({
      data: {
        employeeId: session.role === "EMPLOYEE" ? session.userId : body.employeeId || session.userId,
        category: body.category || "Miscellaneous",
        amount: roundMoney(Number(body.amount)),
        expenseDate: body.expenseDate ? new Date(body.expenseDate) : new Date(),
        description: body.description,
        merchant: body.merchant,
        billAvailable,
        docType: billAvailable ? ExpenseDocType.WITH_BILL : ExpenseDocType.NO_BILL,
        noBillReason: billAvailable ? null : body.noBillReason || "No bill available",
        attachmentUrl: body.attachmentUrl,
        cashAccountId: body.cashAccountId,
        postingClass: body.postingClass === "PROCUREMENT" ? "PROCUREMENT" : "OPERATING",
        status: ExpenseApprovalStatus.PENDING,
      },
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
