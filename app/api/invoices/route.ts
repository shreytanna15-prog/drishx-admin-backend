import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../lib/session-auth";
import { prisma, withDbRetry } from "../../lib/prisma";
import {
  buildInvoicesListWhere,
  invoicesListInclude,
  parseInvoicesListParams,
  serializeInvoiceListItem,
} from "../../lib/invoices-list";

// GET /api/invoices — paginated summary (RW-11 Phase C)
// Access: ADMIN | EMPLOYEE => all invoices, CUSTOMER => own invoices
// Fat order/lines payload remains on GET /api/invoices/:id
export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  try {
    const { searchParams } = new URL(req.url);
    const params = parseInvoicesListParams(searchParams);
    const roleScope =
      session.role === "CUSTOMER" ? { userId: session.userId } : undefined;
    const where = buildInvoicesListWhere(roleScope, params);
    const skip = (params.page - 1) * params.limit;

    const [total, invoices] = await withDbRetry(() =>
      Promise.all([
        prisma.invoice.count({ where }),
        prisma.invoice.findMany({
          where,
          include: invoicesListInclude,
          orderBy: { issuedAt: "desc" },
          skip,
          take: params.limit,
        }),
      ])
    );

    const items = invoices.map(serializeInvoiceListItem);
    const hasMore = skip + items.length < total;

    return NextResponse.json({
      items,
      page: params.page,
      limit: params.limit,
      hasMore,
      total,
    });
  } catch (error) {
    console.error("GET /api/invoices error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
