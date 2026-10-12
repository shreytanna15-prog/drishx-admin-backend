import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { prisma } from "@/app/lib/prisma";
import { getCustomerOutstanding } from "@/app/lib/finance/credit-limit";
import { agingBucket } from "@/app/lib/reports/aging";

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") || "summary";
  const customerIdParam = searchParams.get("customerId");

  if (session.role === "CUSTOMER") {
    const outstanding = await getCustomerOutstanding(session.userId);
    const invoices = await prisma.invoice.findMany({
      where: {
        userId: session.userId,
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        amountOutstanding: { gt: 0 },
      },
      orderBy: { issuedAt: "asc" },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        amountPaid: true,
        amountOutstanding: true,
        status: true,
        issuedAt: true,
        dueDate: true,
      },
    });
    const ledger = await prisma.customerLedgerEntry.findMany({
      where: { customerId: session.userId },
      orderBy: { occurredAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ outstanding, invoices, ledger });
  }

  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (view === "ledger" && customerIdParam) {
    const ledger = await prisma.customerLedgerEntry.findMany({
      where: { customerId: customerIdParam },
      orderBy: { occurredAt: "asc" },
      include: {
        invoice: { select: { invoiceNumber: true } },
        payment: { select: { paymentNumber: true } },
        creditNote: { select: { creditNoteNumber: true } },
      },
    });
    const outstanding = await getCustomerOutstanding(customerIdParam);
    return NextResponse.json({ ledger, outstanding });
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      amountOutstanding: { gt: 0 },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          businessName: true,
          creditLimit: true,
        },
      },
    },
    orderBy: { issuedAt: "asc" },
  });

  const now = new Date();
  const aging = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  let total = 0;
  let overdue = 0;
  let dueToday = 0;

  for (const inv of invoices) {
    const amt = Number(inv.amountOutstanding);
    total += amt;
    const bucket = agingBucket(inv.issuedAt, now) as keyof typeof aging;
    aging[bucket] += amt;
    if (inv.dueDate && inv.dueDate < now) overdue += amt;
    if (
      inv.dueDate &&
      inv.dueDate.toDateString() === now.toDateString()
    ) {
      dueToday += amt;
    }
  }

  const pendingClaims = await prisma.paymentClaim.count({
    where: { status: "PENDING" },
  });

  return NextResponse.json({
    totalReceivable: total,
    dueToday,
    overdue,
    aging,
    pendingClaims,
    invoices,
  });
}
