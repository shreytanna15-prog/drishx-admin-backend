import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

type TxClient = Prisma.TransactionClient | typeof prisma;

export async function recordSystemError(
  client: TxClient,
  input: {
    message: string;
    code?: string;
    route?: string;
    correlationId?: string | null;
    context?: Record<string, unknown> | null;
    level?: string;
  }
) {
  return client.systemErrorLog.create({
    data: {
      message: input.message,
      code: input.code ?? null,
      route: input.route ?? null,
      correlationId: input.correlationId ?? null,
      level: input.level ?? "error",
      context: input.context
        ? (input.context as Prisma.InputJsonValue)
        : undefined,
    },
  });
}
