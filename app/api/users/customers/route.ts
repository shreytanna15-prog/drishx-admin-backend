import { NextRequest, NextResponse } from "next/server";

import { prisma } from "../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { toSafeUser } from "../../../lib/user-public";
import {
  buildCustomersListWhere,
  parseCustomersListParams,
} from "../../../lib/customers-list";

/**
 * Customer directory for staff (RW-11 Phase C — paginated).
 * - status=approved (default): approved customers
 * - status=rejected: rejected applications
 * - status=suspended: approved but inactive (suspended)
 * Query: page, limit, q, status, activeOnly
 * Response: { items, customers (compat), page, limit, hasMore, total, status, activeOnly }
 */
export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Staff authorization required." }, { status: 403 });
  }

  try {
    const searchParams = new URL(req.url).searchParams;
    const params = parseCustomersListParams(searchParams);
    const where = buildCustomersListWhere(params);
    const skip = (params.page - 1) * params.limit;

    const [total, customers] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: [{ businessName: "asc" }, { email: "asc" }],
        skip,
        take: params.limit,
      }),
    ]);

    const items = customers.map(toSafeUser);
    const hasMore = skip + items.length < total;

    return NextResponse.json({
      items,
      /** Backward-compatible alias for Phase B/C cutover clients. */
      customers: items,
      page: params.page,
      limit: params.limit,
      hasMore,
      total,
      status: params.status,
      activeOnly: params.activeOnly,
    });
  } catch (error) {
    console.error("GET /api/users/customers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
