import type { Prisma } from "@prisma/client";

export const CUSTOMERS_LIST_DEFAULT_LIMIT = 30;
export const CUSTOMERS_LIST_MAX_LIMIT = 100;

export type CustomersListParams = {
  page: number;
  limit: number;
  status: string;
  activeOnly: boolean;
  q?: string;
  accountAction?: string;
  /** Pricing tier code A–F (case-insensitive). */
  tierCode?: string;
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
  const accountAction =
    searchParams.get("accountAction")?.trim().toUpperCase() || undefined;
  const tierCode = searchParams.get("tierCode")?.trim().toUpperCase() || undefined;

  return { page, limit, status, activeOnly, q, accountAction, tierCode };
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
  } else if (params.status === "orderable") {
    // Create-order picker: approved+active OR pending staff-created (Path B/C).
    where = {
      role: "CUSTOMER",
      accountAction: { notIn: ["CLOSED", "BLOCKED"] },
      OR: [
        {
          isApproved: true,
          approvalStatus: "APPROVED",
          isActive: true,
        },
        {
          approvalStatus: "PENDING_REVIEW",
          createdByStaffId: { not: null },
        },
      ],
    };
  } else if (
    params.status === "staff-created" ||
    params.status === "walk-in-history"
  ) {
    // RC-06 walk-in history: staff-created only (Path B/C), not Path A.
    where = {
      role: "CUSTOMER",
      createdByStaffId: { not: null },
      accountAction: { notIn: ["CLOSED", "BLOCKED"] },
      OR: [
        {
          isApproved: true,
          approvalStatus: "APPROVED",
          isActive: true,
        },
        {
          approvalStatus: "PENDING_REVIEW",
        },
      ],
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

  const andParts: Prisma.UserWhereInput[] = [where];

  const q = params.q?.trim();
  if (q) {
    andParts.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { businessName: { contains: q, mode: "insensitive" } },
        { shopName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { mobileNumber: { contains: q, mode: "insensitive" } },
        { gstNumber: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const action = params.accountAction?.trim().toUpperCase();
  if (
    action === "NONE" ||
    action === "BLOCKED" ||
    action === "CREDIT_SUSPENDED" ||
    action === "CLOSED"
  ) {
    andParts.push({ accountAction: action });
  }

  const tier = params.tierCode?.trim().toUpperCase();
  if (tier && /^[A-F]$/.test(tier)) {
    andParts.push({ pricingTier: { code: tier } });
  }

  if (andParts.length === 1) return andParts[0]!;
  return { AND: andParts };
}
