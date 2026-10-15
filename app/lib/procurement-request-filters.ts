import {
  ProcurementRequestStatus,
  type Prisma,
} from "@prisma/client";

/**
 * Statuses treated as unresolved on the Procurement Requests list
 * ("Unresolved only" checkbox). Mirrors OPEN_REQUEST_STATUSES in
 * procurement-requests.ts — keep both aligned.
 */
export const UNRESOLVED_REQUEST_STATUSES: readonly ProcurementRequestStatus[] = [
  ProcurementRequestStatus.OPEN,
  ProcurementRequestStatus.UNDER_REVIEW,
  ProcurementRequestStatus.APPROVED,
] as const;

export type ProcurementRequestListFilterInput = {
  source?: string;
  status?: ProcurementRequestStatus;
  priority?: string;
  lensType?: string;
  orderId?: string;
  openOnly?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
};

type StatusWhere = NonNullable<Prisma.ProcurementRequestWhereInput["status"]>;

/**
 * Builds the Prisma where clause for GET /api/procurement/requests.
 *
 * Status and openOnly are combined with AND (not overwrite):
 * - status only → exact status
 * - openOnly only → status in unresolved set
 * - both → exact status if it is unresolved; otherwise no matches
 */
export function buildProcurementRequestListWhere(
  input: ProcurementRequestListFilterInput
): Prisma.ProcurementRequestWhereInput {
  const where: Prisma.ProcurementRequestWhereInput = {};

  if (input.source) {
    where.source = input.source as Prisma.ProcurementRequestWhereInput["source"];
  }
  if (input.priority) {
    where.priority =
      input.priority as Prisma.ProcurementRequestWhereInput["priority"];
  }
  if (input.lensType) {
    where.lensType =
      input.lensType as Prisma.ProcurementRequestWhereInput["lensType"];
  }
  if (input.orderId) where.orderId = input.orderId;

  const statusClause = resolveProcurementRequestStatusFilter({
    status: input.status,
    openOnly: Boolean(input.openOnly),
  });
  if (statusClause !== undefined) {
    where.status = statusClause;
  }

  if (input.dateFrom || input.dateTo) {
    where.createdAt = {
      ...(input.dateFrom ? { gte: input.dateFrom } : {}),
      ...(input.dateTo ? { lte: input.dateTo } : {}),
    };
  }

  return where;
}

export function resolveProcurementRequestStatusFilter(opts: {
  status?: ProcurementRequestStatus;
  openOnly: boolean;
}): StatusWhere | undefined {
  const unresolved = [...UNRESOLVED_REQUEST_STATUSES];

  if (opts.status && opts.openOnly) {
    if (!unresolved.includes(opts.status)) {
      // Explicit terminal status + unresolved-only → empty intersection.
      return { in: [] };
    }
    return opts.status;
  }

  if (opts.status) return opts.status;
  if (opts.openOnly) return { in: unresolved };
  return undefined;
}

/** Client empty-state copy for the requests table. */
export function procurementRequestsEmptyMessage(hasActiveFilters: boolean): string {
  return hasActiveFilters
    ? "No requests match the current filters."
    : "No procurement requests. Nothing needs buying right now.";
}

/**
 * Drop stale list responses when filters change faster than the network.
 * Commit only when this response's sequence matches the latest request.
 */
export function shouldCommitListResult(
  responseSeq: number,
  latestSeq: number
): boolean {
  return responseSeq === latestSeq;
}

/** Pure predicate used by tests and client search — row matches status filter. */
export function requestMatchesStatusFilter(
  rowStatus: string,
  opts: { status?: string; openOnly?: boolean }
): boolean {
  const unresolved = new Set<string>(UNRESOLVED_REQUEST_STATUSES);
  if (opts.status && opts.openOnly) {
    return opts.status === rowStatus && unresolved.has(rowStatus);
  }
  if (opts.status) return opts.status === rowStatus;
  if (opts.openOnly) return unresolved.has(rowStatus);
  return true;
}

const SUPPORTED_STATUSES = new Set<string>(
  Object.values(ProcurementRequestStatus)
);

/** True when `raw` is a real ProcurementRequestStatus enum member. */
export function isSupportedProcurementRequestStatus(
  raw: string | null | undefined
): raw is ProcurementRequestStatus {
  if (!raw) return false;
  return SUPPORTED_STATUSES.has(raw.toUpperCase());
}

/**
 * Parse `?status=` for GET /api/procurement/requests.
 * Empty / missing → no status filter. Unknown values → controlled 400.
 */
export function parseProcurementRequestStatusQuery(
  raw: string | null
):
  | { ok: true; status: ProcurementRequestStatus | undefined }
  | { ok: false; error: string; httpStatus: 400 } {
  if (!raw) return { ok: true, status: undefined };
  const upper = raw.toUpperCase();
  if (!SUPPORTED_STATUSES.has(upper)) {
    return {
      ok: false,
      error: "Invalid status filter.",
      httpStatus: 400,
    };
  }
  return { ok: true, status: upper as ProcurementRequestStatus };
}

/**
 * Receiving progress for a PR is quantity-based, not a status enum value.
 * Partial goods receipt keeps the PR status (typically APPROVED) while
 * bumping `receivedQuantity`; only full receipt flips to RESOLVED.
 */
export function nextProcurementRequestStatusAfterReceive(opts: {
  currentStatus: ProcurementRequestStatus;
  requestedQuantity: number;
  receivedQuantityBefore: number;
  receiveBy: number;
}): {
  receivedQuantity: number;
  status: ProcurementRequestStatus;
  fullyReceived: boolean;
} {
  const receivedQuantity =
    opts.receivedQuantityBefore + Math.max(0, Math.trunc(opts.receiveBy));
  const fullyReceived = receivedQuantity >= opts.requestedQuantity;
  return {
    receivedQuantity,
    fullyReceived,
    status: fullyReceived
      ? ProcurementRequestStatus.RESOLVED
      : opts.currentStatus,
  };
}
