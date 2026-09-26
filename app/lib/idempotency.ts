import type { NextRequest } from "next/server";
import { prisma } from "./prisma";
import type { Transaction } from "@prisma/client";
import {
  procurementBatchReferenceFor,
  procurementReferenceFor,
  sanitizeReferenceSegment,
} from "./procurement-rules";

export {
  procurementBatchReferenceFor,
  procurementReferenceFor,
  sanitizeReferenceSegment,
};

/**
 * Idempotency for procurement mutations.
 *
 * The mobile app queues procurement submissions while offline and replays them
 * with the ORIGINAL `X-Request-Id` (see drishx-mobile-app/lib/offline-queue.ts).
 * Without a replay guard the same receipt applies twice: stock is incremented
 * twice, the expense is posted twice and cash is deducted twice.
 *
 * `ProcessedClientRequest` (prisma/schema.prisma) was created for exactly this
 * but was never referenced from any code path. This module activates it and
 * additionally anchors the guard on `Transaction.reference`, which is
 * `@unique` — so a concurrent duplicate loses at the database level (P2002)
 * rather than only in application code.
 */

const REQUEST_ID_HEADER = "x-request-id";

/** Read the client-supplied idempotency key, if any. */
export function getClientRequestId(req: NextRequest): string | null {
  const raw = req.headers.get(REQUEST_ID_HEADER);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return sanitizeReferenceSegment(trimmed) || null;
}

export type ReplayHit = {
  replayed: true;
  transaction: Transaction;
};

/**
 * Look for evidence that this client request was already applied.
 * `reference` is derived from the request id, so a match means the exact same
 * submission already created its expense row.
 */
export async function findProcurementReplay(
  clientRequestId: string,
  opts?: { batch?: boolean }
): Promise<ReplayHit | null> {
  const reference = opts?.batch
    ? `${procurementBatchReferenceFor(clientRequestId)}-1`
    : procurementReferenceFor(clientRequestId);

  const transaction = await prisma.transaction.findUnique({ where: { reference } });
  return transaction ? { replayed: true, transaction } : null;
}

/**
 * Reconstruct the full batch response for a replayed request.
 * Returns null when the batch was never applied.
 */
export async function replayProcurementBatch(clientRequestId: string): Promise<{
  batchReference: string;
  totalAmount: number;
  itemCount: number;
  replayed: true;
} | null> {
  const prefix = procurementBatchReferenceFor(clientRequestId);
  const transactions = await prisma.transaction.findMany({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "asc" },
  });
  if (transactions.length === 0) return null;

  return {
    batchReference: transactions.length === 1 ? prefix : `${prefix} (replayed)`,
    totalAmount: transactions.reduce(
      (sum, row) => sum + Number(row.amount),
      0
    ),
    itemCount: transactions.length,
    replayed: true,
  };
}

/**
 * Record that a client request id has been handled. Best-effort: the unique
 * violation simply means another attempt already recorded it.
 */
export async function markClientRequestProcessed(
  clientRequestId: string,
  auditEventId?: string | null
): Promise<void> {
  try {
    await prisma.processedClientRequest.upsert({
      where: { clientRequestId },
      create: { clientRequestId, auditEventId: auditEventId ?? null },
      update: {},
    });
  } catch {
    // Non-critical bookkeeping — never fail a procurement receipt over it.
  }
}
