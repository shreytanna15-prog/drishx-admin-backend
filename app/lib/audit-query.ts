import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { LedgerEntryType, TransactionStatus } from "@prisma/client";
import {
  AuditAction,
  AuditModule,
  actorFromSession,
  recordAuditEvent,
  singleChange,
} from "./audit";
import type { SessionPayload } from "./auth";

export async function voidTransaction(
  transactionId: string,
  reasonCode: string,
  reasonText: string | null,
  session: SessionPayload
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findUnique({
      where: { id: transactionId },
      include: { ledgerEntries: true },
    });
    if (!existing) throw new Error("Transaction not found.");
    if (existing.status === TransactionStatus.VOIDED) {
      throw new Error("Transaction is already voided.");
    }

    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status: TransactionStatus.VOIDED,
        voidedAt: new Date(),
        voidReason: reasonText ?? reasonCode,
      },
    });

    for (const entry of existing.ledgerEntries) {
      await tx.ledgerEntry.create({
        data: {
          transactionId,
          entryType:
            entry.entryType === LedgerEntryType.DEBIT
              ? LedgerEntryType.CREDIT
              : LedgerEntryType.DEBIT,
          amount: entry.amount,
          description: `Reversal: ${entry.description ?? "void"}`,
        },
      });
    }

    await recordAuditEvent(tx, {
      action: AuditAction.TRANSACTION_VOIDED,
      module: AuditModule.FINANCE,
      entityType: "Transaction",
      entityId: transactionId,
      actor: actorFromSession(session),
      reasonCode,
      reasonText,
      changes: singleChange("status", existing.status, TransactionStatus.VOIDED),
      context: { reference: existing.reference, amount: String(existing.amount) },
      activityMessage: `Transaction ${existing.reference} voided`,
    });

    return tx.transaction.findUnique({ where: { id: transactionId } });
  });
}

export function buildAuditListWhere(
  params: URLSearchParams,
  scopeWhere: Prisma.AuditEventWhereInput
): Prisma.AuditEventWhereInput {
  const filters: Prisma.AuditEventWhereInput[] = [];
  if (Object.keys(scopeWhere).length > 0) filters.push(scopeWhere);

  const module = params.get("module");
  if (module) filters.push({ module });

  const action = params.get("action");
  if (action) filters.push({ action });

  const entityType = params.get("entityType");
  if (entityType) filters.push({ entityType });

  const entityId = params.get("entityId");
  if (entityId) filters.push({ entityId });

  const actorUserId = params.get("actorUserId");
  if (actorUserId) filters.push({ actorUserId });

  const correlationId = params.get("correlationId");
  if (correlationId) filters.push({ correlationId });

  const highRisk = params.get("highRisk");
  if (highRisk === "true") filters.push({ isHighRisk: true });

  const from = params.get("from");
  const to = params.get("to");
  if (from || to) {
    const occurredAt: Prisma.DateTimeFilter = {};
    if (from) occurredAt.gte = new Date(from);
    if (to) occurredAt.lte = new Date(to);
    filters.push({ occurredAt });
  }

  const q = params.get("q")?.trim();
  if (q) {
    filters.push({
      OR: [
        { publicId: { contains: q, mode: "insensitive" } },
        { message: { contains: q, mode: "insensitive" } },
        { entityId: q },
      ],
    });
  }

  if (filters.length === 0) return {};
  if (filters.length === 1) return filters[0]!;
  return { AND: filters };
}
