import type { Prisma } from "@prisma/client";

export const CUSTOMERS_LIST_DEFAULT_LIMIT = 30;
export const CUSTOMERS_LIST_MAX_LIMIT = 100;

export type CustomersListParams = {
  page: number;
  limit: number;
  status: string;
  activeOnly: boolean;
  q?: string;
};

export function parseCustomersListParams(
  searchParams: URLSearchParams
): CustomersListParams {
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const limitRaw = Number(
    searchParams.get("limit") ?? String(CUSTOMERS_LIST_DEFAULT_LIMIT)
  );
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Math.min(
    CUSTOMERS_LIST_MAX_LIMIT,
    Math.max(
      1,
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.floor(limitRaw)
        : CUSTOMERS_LIST_DEFAULT_LIMIT
    )
  );

  const status =
    searchParams.get("status")?.trim().toLowerCase() || "approved";
  const activeOnly =
    searchParams.get("activeOnly") === "1" ||
    searchParams.get("activeOnly") === "true";
  const q = searchParams.get("q")?.trim() || undefined;

  return { page, limit, status, activeOnly, q };
}

export function buildCustomersListWhere(
  params: CustomersListParams
): Prisma.UserWhereInput {
  let where: Prisma.UserWhereInput = {
    role: "CUSTOMER",
    isApproved: true,
    approvalStatus: "APPROVED",
  };

  if (params.status === "rejected") {
    where = { role: "CUSTOMER", approvalStatus: "REJECTED" };
  } else if (params.status === "suspended") {
    where = {
      role: "CUSTOMER",
      approvalStatus: "APPROVED",
      isApproved: true,
      isActive: false,
    };
  } else {
    where = {
      role: "CUSTOMER",
      isApproved: true,
      approvalStatus: "APPROVED",
    };
    if (params.activeOnly) {
      where.isActive = true;
    }
  }

  const q = params.q?.trim();
  if (q) {
    where = {
      AND: [
        where,
        {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { businessName: { contains: q, mode: "insensitive" } },
            { shopName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { mobileNumber: { contains: q, mode: "insensitive" } },
          ],
        },
      ],
    };
  }

  return where;
}
