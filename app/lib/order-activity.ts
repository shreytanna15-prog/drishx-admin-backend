import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type TxClient = Prisma.TransactionClient | typeof prisma;

export async function logOrderActivity(
  client: TxClient,
  input: {
    orderId: string;
    actorUserId?: string | null;
    action: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  }
) {
  return client.orderActivityLog.create({
    data: {
      orderId: input.orderId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      message: input.message,
      metadata: input.metadata,
    },
  });
}

/** Strip staff-only fields before returning an order to CUSTOMER clients. */
export function sanitizeOrderForRole<T extends Record<string, unknown>>(
  order: T,
  role: string
): T {
  if (role !== "CUSTOMER") return order;

  const {
    internalNotes: _internalNotes,
    cancelReason: _cancelReason,
    dispatchOverrideStamp: _dispatchOverrideStamp,
    activityLogs: _activityLogs,
    ...rest
  } = order as T & {
    internalNotes?: unknown;
    cancelReason?: unknown;
    dispatchOverrideStamp?: unknown;
    activityLogs?: unknown;
  };

  return rest as T;
}
