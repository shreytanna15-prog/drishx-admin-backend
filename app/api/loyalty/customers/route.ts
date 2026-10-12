import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { prisma } from "@/app/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if ((session.role !== "ADMIN" && session.role !== "EMPLOYEE")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const query = new URL(req.url).searchParams.get("q")?.trim().toLowerCase() || "";

  // Loyalty is for approved customers only — exclude incomplete / pending / rejected.
  const customers = await prisma.user.findMany({
    where: {
      role: "CUSTOMER",
      isApproved: true,
      approvalStatus: "APPROVED",
      isActive: true,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { businessName: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
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
    take: 100,
  });

  return NextResponse.json({
    customers: customers.map((c) => ({
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
    })),
  });
}
