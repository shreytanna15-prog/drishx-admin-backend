import { prisma } from "@/app/lib/prisma";
import { getOrCreateWallet, getExpiringWithinDays } from "./wallet";
import { expirePoints } from "./expire";

const EXPIRING_SOON_DAYS = 30;

/**
 * Customer-facing loyalty summary (available, pending, value, expiring soon).
 */
export async function getLoyaltyDashboard(customerId: string) {
  await expirePoints();
  const wallet = await getOrCreateWallet(customerId);
  const expiringSoon = await getExpiringWithinDays(
    customerId,
    EXPIRING_SOON_DAYS
  );
  return {
    availablePoints: Number(wallet.availablePoints) || 0,
    pendingPoints: Number(wallet.pendingPoints) || 0,
    expiringSoon,
    totalRedeemed: Number(wallet.totalRedeemed) || 0,
    totalEarned: Number(wallet.totalEarned) || 0,
    expiringSoonDays: EXPIRING_SOON_DAYS,
  };
}

/**
 * Paginated loyalty transaction ledger for a customer.
 */
export async function getLoyaltyLedger(
  customerId: string,
  opts: { cursor?: string; take?: number } = {}
) {
  const take = Math.min(opts.take ?? 50, 100);
  const txns = await prisma.loyaltyTransaction.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(opts.cursor
      ? { cursor: { id: opts.cursor }, skip: 1 }
      : {}),
  });
  const hasMore = txns.length > take;
  const rows = hasMore ? txns.slice(0, take) : txns;
  return {
    transactions: rows,
    nextCursor: hasMore ? rows[rows.length - 1]!.id : null,
  };
}
