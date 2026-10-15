/**
 * Pure Purchase Order math (RW-08 Phase A) — no database access.
 */

/** Approved, not yet closed — outstanding qty counts as incoming stock. */
export const OPEN_PO_STATUSES_FOR_INCOMING = [
  "OPEN",
  "SENT",
  "PARTIALLY_RECEIVED",
] as const;

/** Statuses that may receive goods / close outstanding. Same set as incoming. */
export const RECEIVABLE_PO_STATUSES = OPEN_PO_STATUSES_FOR_INCOMING;

export function isReceivablePoStatus(status: string): boolean {
  return (RECEIVABLE_PO_STATUSES as readonly string[]).includes(status);
}

export const MAIN_WAREHOUSE_CODE = "MAIN";

export type PoLineQtyInput = {
  poQuantity: number;
  receivedQuantity?: number;
  cancelledQuantity?: number;
};

export type PrAllocationInput = {
  requestedQuantity: number;
  orderedQuantity: number;
};

/** Outstanding qty still expected on an approved/open PO line. */
export function openPoLineOutstanding(line: PoLineQtyInput): number {
  const received = line.receivedQuantity ?? 0;
  const cancelled = line.cancelledQuantity ?? 0;
  return Math.max(0, line.poQuantity - received - cancelled);
}

/** PR qty not yet allocated onto an approved PO. */
export function unallocatedProcurementQuantity(pr: PrAllocationInput): number {
  return Math.max(0, pr.requestedQuantity - pr.orderedQuantity);
}

/**
 * Incoming for reorder: open-PO outstanding + unallocated PR qty.
 * Linked/allocated PR qty must not be counted twice.
 */
export function combineIncomingQuantities(input: {
  openPoOutstanding: number;
  unallocatedPrOutstanding: number;
}): number {
  return (
    Math.max(0, input.openPoOutstanding) +
    Math.max(0, input.unallocatedPrOutstanding)
  );
}

/** Allocate as much of `want` as the PR still has unallocated. */
export function allocateProcurementQuantity(
  pr: PrAllocationInput,
  want: number
): { allocated: number; orderedAfter: number } {
  const available = unallocatedProcurementQuantity(pr);
  const allocated = Math.max(0, Math.min(available, Math.trunc(want)));
  return {
    allocated,
    orderedAfter: pr.orderedQuantity + allocated,
  };
}

export type PrCandidate = PrAllocationInput & { id: string };

export type PlannedAllocation = {
  procurementRequestId: string;
  quantity: number;
  orderedAfter: number;
};

/**
 * Plan FIFO allocations across PR candidates for one PO line quantity.
 * Mutates a working copy of orderedQuantity so partial multi-PR plans stay consistent.
 * Prefers `preferredRequestId` first when present.
 */
export function planLineAllocations(input: {
  want: number;
  candidates: PrCandidate[];
  preferredRequestId?: string | null;
}): PlannedAllocation[] {
  let remaining = Math.max(0, Math.trunc(input.want));
  if (remaining <= 0 || !input.candidates.length) return [];

  const working = input.candidates.map((c) => ({ ...c }));
  const preferred = input.preferredRequestId
    ? working.filter((c) => c.id === input.preferredRequestId)
    : [];
  const rest = working.filter((c) => c.id !== input.preferredRequestId);
  const ordered = [...preferred, ...rest];

  const plan: PlannedAllocation[] = [];
  for (const pr of ordered) {
    if (remaining <= 0) break;
    const { allocated, orderedAfter } = allocateProcurementQuantity(pr, remaining);
    if (allocated <= 0) continue;
    plan.push({
      procurementRequestId: pr.id,
      quantity: allocated,
      orderedAfter,
    });
    pr.orderedQuantity = orderedAfter;
    remaining -= allocated;
  }
  return plan;
}

/** Reverse one allocation onto a PR's orderedQuantity (never below 0). */
export function reverseAllocationQuantity(
  pr: PrAllocationInput,
  quantity: number
): { orderedAfter: number; reversed: number } {
  const want = Math.max(0, Math.trunc(quantity));
  const reversed = Math.min(want, Math.max(0, pr.orderedQuantity));
  return {
    reversed,
    orderedAfter: pr.orderedQuantity - reversed,
  };
}

/**
 * Apply only active (non-reversed) allocation rows for one PO onto PR ordered maps.
 * Used by cancel simulation / tests — never touches other POs' rows.
 */
export function reversePoAllocationsOnPrMap(input: {
  prOrderedById: Map<string, number>;
  allocations: Array<{
    procurementRequestId: string;
    quantity: number;
    reversedAt?: Date | string | null;
  }>;
}): Map<string, number> {
  const next = new Map(input.prOrderedById);
  for (const row of input.allocations) {
    if (row.reversedAt) continue;
    const current = next.get(row.procurementRequestId) ?? 0;
    const { orderedAfter } = reverseAllocationQuantity(
      { requestedQuantity: Number.MAX_SAFE_INTEGER, orderedQuantity: current },
      row.quantity
    );
    next.set(row.procurementRequestId, orderedAfter);
  }
  return next;
}

/** Incoming snapshot helper for tests: draft vs approved vs cancelled. */
export function incomingForPowerState(input: {
  openPoOutstanding: number;
  prs: PrAllocationInput[];
}): number {
  const unallocatedPrOutstanding = input.prs.reduce(
    (sum, pr) => sum + unallocatedProcurementQuantity(pr),
    0
  );
  return combineIncomingQuantities({
    openPoOutstanding: input.openPoOutstanding,
    unallocatedPrOutstanding,
  });
}

export function lineAmount(poQuantity: number, rate: number | null | undefined): number {
  if (rate == null || !Number.isFinite(rate)) return 0;
  return Math.round(poQuantity * rate * 100) / 100;
}

export function powerKey(lensType: string, lensId: string): string {
  return `${lensType}::${lensId}`;
}

/** Detect duplicate powers within a single PO draft payload. */
export function findDuplicatePowersInDraft(
  lines: Array<{ lensType: string; lensId: string }>
): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const line of lines) {
    const key = powerKey(line.lensType, line.lensId);
    if (seen.has(key)) dupes.add(key);
    else seen.add(key);
  }
  return [...dupes];
}

/**
 * Detect the same procurement request linked on more than one draft line.
 * A PR may contribute to only one PO line in a draft payload.
 */
export function findDuplicateProcurementRequestIdsInDraft(
  lines: Array<{ procurementRequestId?: string | null }>
): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const line of lines) {
    const id = line.procurementRequestId?.trim();
    if (!id) continue;
    if (seen.has(id)) dupes.add(id);
    else seen.add(id);
  }
  return [...dupes];
}

/** Reason Run Reorder skips a power covered by an open PO (null = not blocked). Pure. */
export function openPurchaseOrderSuppression(
  po: { publicId: string; status: string } | null
): string | null {
  if (!po) return null;
  if (!(OPEN_PO_STATUSES_FOR_INCOMING as readonly string[]).includes(po.status)) return null;
  return `Purchase order ${po.publicId} is still open for this power. Reorder will consider it again after the PO is closed.`;
}
