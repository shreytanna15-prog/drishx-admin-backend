import type { AuditResult, AuditSource, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import type { AuditRequestContext } from "./request-context";

type TxClient = Prisma.TransactionClient | typeof prisma;

export type RecordSecurityEventInput = {
  action: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  result?: AuditResult;
  request?: AuditRequestContext | null;
  context?: Record<string, unknown> | null;
  message?: string | null;
};

export async function recordSecurityEvent(
  client: TxClient,
  input: RecordSecurityEventInput
) {
  const req = input.request;
  return client.securityEvent.create({
    data: {
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail ?? null,
      result: input.result ?? "SUCCESS",
      source: (req?.source ?? "API") as AuditSource,
      ipAddress: req?.ipAddress ?? null,
      userAgent: req?.userAgent ?? null,
      correlationId: req?.correlationId ?? null,
      context: input.context
        ? (input.context as Prisma.InputJsonValue)
        : undefined,
      message: input.message ?? null,
    },
  });
}
