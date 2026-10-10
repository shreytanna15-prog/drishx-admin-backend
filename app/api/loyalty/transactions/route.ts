import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { getLoyaltyLedger } from "@/app/lib/loyalty/dashboard";
import { expirePoints } from "@/app/lib/loyalty/expire";

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  const { searchParams } = new URL(req.url);
  const customerId =
    session.role === "CUSTOMER"
      ? session.userId
      : searchParams.get("customerId")?.trim() || null;

  if (!customerId) {
    return NextResponse.json({ error: "customerId is required." }, { status: 400 });
  }

  if (session.role === "CUSTOMER" && customerId !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (session.role !== "CUSTOMER" && session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await expirePoints();

  const cursor = searchParams.get("cursor")?.trim() || undefined;
  const takeRaw = Number(searchParams.get("take"));
  const take = Number.isFinite(takeRaw) ? takeRaw : undefined;

  const ledger = await getLoyaltyLedger(customerId, { cursor, take });

  return NextResponse.json({
    transactions: ledger.transactions.map((t) => ({
      ...t,
      points: Number(t.points),
      createdAt: t.createdAt.toISOString(),
      expiresAt: t.expiresAt?.toISOString() ?? null,
      activatedAt: t.activatedAt?.toISOString() ?? null,
    })),
    nextCursor: ledger.nextCursor,
  });
}
