import {
  LoyaltyTransactionStatus,
  LoyaltyTransactionType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getLoyaltySettings } from "./settings";
import { recomputeWallet } from "./wallet";

type TxClient = Prisma.TransactionClient | typeof prisma;

/**
 * Activate an order's pending loyalty points once the order is COMPLETED.
 * Moves PENDING -> AVAILABLE and sets the expiry window.
 */
export async function activateOrderLoyalty(
  orderId: string,
  db: TxClient = prisma
): Promise<number> {
  const settings = await getLoyaltySettings();
  if (!settings.enabled) return 0;

  const pending = await db.loyaltyTransaction.findMany({
    where: {
      orderId,
      status: LoyaltyTransactionStatus.PENDING,
      type: {
        in: [
          LoyaltyTransactionType.POINTS_EARNED,
          LoyaltyTransactionType.ADVANCE_BONUS,
        ],
      },
    },
  });
  if (pending.length === 0) return 0;

  const expiryDays = settings.expiryDays ?? 365;
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + expiryDays);

  let total = 0;
  for (const t of pending) {
    await db.loyaltyTransaction.update({
      where: { id: t.id },
      data: {
        status: LoyaltyTransactionStatus.AVAILABLE,
        activatedAt: now,
        expiresAt,
      },
    });
    total += Number(t.points) || 0;
  }

  await recomputeWallet(pending[0]!.customerId, db);

  return total;
}
