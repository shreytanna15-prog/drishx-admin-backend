import type { Prisma } from "@prisma/client";

export const INVOICES_LIST_DEFAULT_LIMIT = 30;
export const INVOICES_LIST_MAX_LIMIT = 100;

export const invoicesListInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      gstNumber: true,
      businessName: true,
      businessAddress: true,
      state: true,
      pincode: true,
    },
  },
  order: {
    select: {
      id: true,
      orderNumber: true,
      lensType: true,
      quantity: true,
      status: true,
      totalAmount: true,
    },
  },
} satisfies Prisma.InvoiceInclude;

export type InvoicesListParams = {
  page: number;
  limit: number;
  status?: string;
  q?: string;
  /** Inclusive lower bound on issuedAt (ISO / parseable date string). */
  dateFrom?: string;
  /** Inclusive upper bound on issuedAt (ISO / parseable date string). */
  dateTo?: string;
};

function parseOptionalDate(raw: string | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function parseInvoicesListParams(
  searchParams: URLSearchParams
): InvoicesListParams {
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const limitRaw = Number(
    searchParams.get("limit") ?? String(INVOICES_LIST_DEFAULT_LIMIT)
  );
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Math.min(
    INVOICES_LIST_MAX_LIMIT,
    Math.max(
      1,
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.floor(limitRaw)
        : INVOICES_LIST_DEFAULT_LIMIT
    )
  );

  const status = searchParams.get("status")?.trim().toUpperCase() || undefined;
  const q = searchParams.get("q")?.trim() || undefined;
  const dateFrom = parseOptionalDate(searchParams.get("dateFrom"));
  const dateTo = parseOptionalDate(searchParams.get("dateTo"));
  return { page, limit, status, q, dateFrom, dateTo };
}

export function buildInvoicesListWhere(
  roleScope: Prisma.InvoiceWhereInput | undefined,
  params: InvoicesListParams
): Prisma.InvoiceWhereInput {
  const parts: Prisma.InvoiceWhereInput[] = [];
  if (roleScope && Object.keys(roleScope).length > 0) {
    parts.push(roleScope);
  }

  if (params.status) {
    parts.push({ status: params.status as never });
  }

  const q = params.q?.trim();
  if (q) {
    parts.push({
      OR: [
        { invoiceNumber: { contains: q, mode: "insensitive" } },
        { status: { equals: q.toUpperCase() as never } },
        {
          user: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { businessName: { contains: q, mode: "insensitive" } },
              { gstNumber: { contains: q, mode: "insensitive" } },
            ],
          },
        },
      ],
    });
  }

  if (params.dateFrom || params.dateTo) {
    const issuedAt: Prisma.DateTimeFilter = {};
    if (params.dateFrom) issuedAt.gte = new Date(params.dateFrom);
    if (params.dateTo) issuedAt.lte = new Date(params.dateTo);
    parts.push({ issuedAt });
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0]!;
  return { AND: parts };
}

type ListRow = Prisma.InvoiceGetPayload<{ include: typeof invoicesListInclude }>;

export function serializeInvoiceListItem(row: ListRow) {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    userId: row.userId,
    orderId: row.orderId,
    amount: Number(row.amount),
    amountPaid: Number(row.amountPaid ?? 0),
    amountOutstanding: Number(row.amountOutstanding ?? 0),
    taxableAmount:
      row.taxableAmount != null ? Number(row.taxableAmount) : undefined,
    cgstAmount: row.cgstAmount != null ? Number(row.cgstAmount) : undefined,
    sgstAmount: row.sgstAmount != null ? Number(row.sgstAmount) : undefined,
    igstAmount: row.igstAmount != null ? Number(row.igstAmount) : undefined,
    status: row.status,
    issuedAt: row.issuedAt?.toISOString() ?? row.createdAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    user: row.user,
    order: row.order
      ? {
          ...row.order,
          totalAmount: Number(row.order.totalAmount),
        }
      : null,
  };
}
