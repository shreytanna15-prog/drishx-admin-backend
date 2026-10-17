import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { prisma } from "@/app/lib/prisma";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const searchParams = new URL(req.url).searchParams;
  const query = searchParams.get("q")?.trim() || "";
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

  // Loyalty is for approved customers only — exclude incomplete / pending / rejected.
  const where = {
    role: "CUSTOMER" as const,
    isApproved: true,
    approvalStatus: "APPROVED" as const,
    isActive: true,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
            { businessName: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, customers] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        businessName: true,
        loyaltyWallet: {
          select: {
            availablePoints: true,
            pendingPoints: true,
            totalEarned: true,
            totalRedeemed: true,
          },
        },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
  ]);

  const items = customers.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    businessName: c.businessName,
    wallet: c.loyaltyWallet
      ? {
          availablePoints: Number(c.loyaltyWallet.availablePoints) || 0,
          pendingPoints: Number(c.loyaltyWallet.pendingPoints) || 0,
          totalEarned: Number(c.loyaltyWallet.totalEarned) || 0,
          totalRedeemed: Number(c.loyaltyWallet.totalRedeemed) || 0,
        }
      : {
          availablePoints: 0,
          pendingPoints: 0,
          totalEarned: 0,
          totalRedeemed: 0,
        },
  }));

  const hasMore = skip + items.length < total;

  return NextResponse.json({
    items,
    customers: items,
    page,
    limit,
    hasMore,
    total,
  });
}
