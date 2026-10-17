import { NextRequest, NextResponse } from "next/server";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { prisma } from "@/app/lib/prisma";
import { getCustomerOutstanding } from "@/app/lib/finance/credit-limit";
import { agingBucket } from "@/app/lib/reports/aging";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const OUTSTANDING_INVOICE_STATUSES: InvoiceStatus[] = [
  "ISSUED",
  "PARTIALLY_PAID",
  "OVERDUE",
];

/**
 * GET /api/finance/receivables
 * Admin: summary aggregates + paginated outstanding invoices (RW-11 Phase C).
 * Customer: own outstanding + invoices + bounded ledger.
 */
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
        status: { in: OUTSTANDING_INVOICE_STATUSES },
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
    return NextResponse.json({
      outstanding,
      invoices,
      ledger,
      ledgerBounded: true,
      ledgerLimit: 50,
    });
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

  const outstandingWhere: Prisma.InvoiceWhereInput = {
    status: { in: OUTSTANDING_INVOICE_STATUSES },
    amountOutstanding: { gt: 0 },
  };

  const pageRaw = Number(searchParams.get("page") ?? "1");
  const limitRaw = Number(searchParams.get("limit") ?? String(DEFAULT_LIMIT));
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(
      1,
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : DEFAULT_LIMIT
    )
  );
  const skip = (page - 1) * limit;

  // Light rows for aging/totals (no user include); separate page for table.
  const [agingRows, totalCount, invoices, pendingClaims] = await Promise.all([
    prisma.invoice.findMany({
      where: outstandingWhere,
      select: {
        amountOutstanding: true,
        issuedAt: true,
        dueDate: true,
      },
    }),
    prisma.invoice.count({ where: outstandingWhere }),
    prisma.invoice.findMany({
      where: outstandingWhere,
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
      skip,
      take: limit,
    }),
    prisma.paymentClaim.count({
      where: { status: "PENDING" },
    }),
  ]);

  const now = new Date();
  const aging = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  let total = 0;
  let overdue = 0;
  let dueToday = 0;

  for (const inv of agingRows) {
    const amt = Number(inv.amountOutstanding);
    total += amt;
    const bucket = agingBucket(inv.issuedAt ?? now, now) as keyof typeof aging;
    aging[bucket] += amt;
    if (inv.dueDate && inv.dueDate < now) overdue += amt;
    if (
      inv.dueDate &&
      inv.dueDate.toDateString() === now.toDateString()
    ) {
      dueToday += amt;
    }
  }

  return NextResponse.json({
    totalReceivable: total,
    dueToday,
    overdue,
    aging,
    pendingClaims,
    invoices,
    items: invoices,
    page,
    limit,
    hasMore: skip + invoices.length < totalCount,
    total: totalCount,
  });
}
