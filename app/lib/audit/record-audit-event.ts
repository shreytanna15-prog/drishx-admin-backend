import type {
  AuditActorType,
  AuditResult,
  AuditSeverity,
  AuditSource,
  Prisma,
} from "@prisma/client";
import { prisma } from "../prisma";
import type { FieldChange } from "./diff";
import { isHighRiskAction } from "./high-risk";
import { validateReason } from "./reason-codes";
import type { AuditActor, AuditRequestContext } from "./request-context";

type TxClient = Prisma.TransactionClient | typeof prisma;

export type RecordAuditEventInput = {
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  actor: AuditActor;
  request?: AuditRequestContext | null;
  reasonCode?: string | null;
  reasonText?: string | null;
  result?: AuditResult;
  severity?: AuditSeverity;
  changes?: FieldChange[];
  context?: Record<string, unknown> | null;
  relatedRefs?: Record<string, unknown> | null;
  message?: string | null;
  /** Also write human-readable ActivityEvent */
  activityMessage?: string | null;
};

async function nextPublicId(client: TxClient): Promise<string> {
  const row = await client.auditSequence.upsert({
    where: { id: "default" },
    create: { id: "default", value: 1 },
    update: { value: { increment: 1 } },
  });
  return `AU-${String(row.value).padStart(6, "0")}`;
}

export async function recordAuditEvent(
  client: TxClient,
  input: RecordAuditEventInput
) {
  const reasonError = validateReason(
    input.action,
    input.reasonCode,
    input.reasonText
  );
  if (reasonError) {
    throw new Error(reasonError);
  }

  const publicId = await nextPublicId(client);
  const req = input.request;
  const isHighRisk = isHighRiskAction(input.action);

  const event = await client.auditEvent.create({
    data: {
      publicId,
      actorType: input.actor.actorType as AuditActorType,
      actorUserId: input.actor.actorUserId ?? null,
      actorName: input.actor.actorName ?? null,
      action: input.action,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      severity: input.severity ?? (isHighRisk ? "WARNING" : "INFO"),
      isHighRisk,
      source: (req?.source ?? "API") as AuditSource,
      ipAddress: req?.ipAddress ?? null,
      userAgent: req?.userAgent ?? null,
      correlationId: req?.correlationId ?? null,
      clientRequestId: req?.clientRequestId ?? null,
      reasonCode: input.reasonCode ?? null,
      reasonText: input.reasonText ?? null,
      result: input.result ?? "SUCCESS",
      changes: input.changes?.length
        ? (input.changes as unknown as Prisma.InputJsonValue)
        : undefined,
      context: input.context
        ? (input.context as Prisma.InputJsonValue)
        : undefined,
      relatedRefs: input.relatedRefs
        ? (input.relatedRefs as Prisma.InputJsonValue)
        : undefined,
      message: input.message ?? null,
    },
  });

  const activityMsg =
    input.activityMessage ?? input.message ?? `${input.action} on ${input.entityType}`;
  await client.activityEvent.create({
    data: {
      actorUserId: input.actor.actorUserId ?? null,
      actorName: input.actor.actorName ?? null,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      message: activityMsg,
      auditEventId: event.id,
    },
  });

  return event;
}
