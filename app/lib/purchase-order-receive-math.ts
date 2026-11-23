/**
 * Pure Phase B receiving math — no database access.
 */

import { openPoLineOutstanding, type PoLineQtyInput } from "./purchase-order-math";
import { missingReceiptDocuments } from "./procurement-documents";
import { draftPowerIdentityKey } from "./catalog/catalog-po-identity-core";

export const CLOSE_OUTSTANDING_REASONS = [
  "SUPPLIER_UNABLE_TO_SUPPLY",
  "SUPPLIER_DISCONTINUED",
  "SUPPLIER_CANCELLED_BALANCE",
  "COMMERCIAL_DISAGREEMENT",
  "BUYER_CANCELLATION",
  "OTHER",
] as const;

export type CloseOutstandingReason = (typeof CLOSE_OUTSTANDING_REASONS)[number];

export function isCloseOutstandingReason(value: string): value is CloseOutstandingReason {
  return (CLOSE_OUTSTANDING_REASONS as readonly string[]).includes(value);
}

export type PowerReceiptInput = {
  lensType?: string | null;
  lensId?: string | null;
  lensProductPowerId?: string | null;
  lensProductVariantId?: string | null;
  sph?: number | null;
  cyl?: number | null;
  deliveredQuantity: number;
  damagedQuantity?: number;
  productLabel?: string | null;
  rangeLabel?: string | null;
  powerLabel?: string | null;
};

export type PoLineReceiptContext = PoLineQtyInput & {
  id: string;
  lensType?: string | null;
  lensId?: string | null;
  lensProductPowerId?: string | null;
  lensProductVariantId?: string | null;
  sph?: number | null;
  cyl?: number | null;
  productLabel?: string | null;
  rangeLabel?: string | null;
  powerLabel?: string | null;
};

export type ReconciledReceiptLine = {
  purchaseOrderLineId: string | null;
  lensType: string | null;
  lensId: string | null;
  lensProductPowerId: string | null;
  lensProductVariantId: string | null;
  sph: number | null;
  cyl: number | null;
  productLabel: string | null;
  rangeLabel: string | null;
  powerLabel: string | null;
  orderedQuantity: number;
  previouslyReceived: number;
  outstandingBefore: number;
  deliveredQuantity: number;
  damagedQuantity: number;
  acceptedQuantity: number;
  shortQuantity: number;
  excessQuantity: number;
  lineStatus: "MATCHED" | "SHORT" | "EXTRA" | "INVALID" | "DAMAGED" | "PENDING";
  actionCode: string | null;
  errors: string[];
  warnings: string[];
};

export type BillRangeInput = {
  productLabel: string;
  rangeLabel?: string | null;
  billQuantity: number;
};

export type RangeReconcileRow = {
  productLabel: string;
  rangeLabel: string | null;
  billQuantity: number;
  excelQuantity: number;
  difference: number;
  status: "MATCHED" | "MISMATCH";
  resolution: string | null;
};

function receiptIdentityKey(row: {
  lensType?: string | null;
  lensId?: string | null;
  lensProductPowerId?: string | null;
  lensProductVariantId?: string | null;
  sph?: number | null;
  cyl?: number | null;
}): string | null {
  return draftPowerIdentityKey(row);
}

/**
 * Build power-wise reconciliation from PO lines + Excel deliveries.
 * Accepted defaults to delivered − damaged, capped at outstanding (excess is not accepted).
 * Matches by catalog leaf id when present, else legacy lensType+lensId.
 */
export function reconcilePowerReceipt(input: {
  poLines: PoLineReceiptContext[];
  deliveries: PowerReceiptInput[];
  actions?: Record<string, string | undefined>;
}): {
  lines: ReconciledReceiptLine[];
  totals: {
    acceptedUnits: number;
    damagedUnits: number;
    shortUnits: number;
    excessUnits: number;
    invalidRows: number;
    errorCount: number;
    warningCount: number;
  };
} {
  const byPower = new Map<string, PoLineReceiptContext>();
  for (const l of input.poLines) {
    const key = receiptIdentityKey(l);
    if (key) byPower.set(key, l);
    // Also index legacy so Excel rows without powerId still match bridged catalog lines.
    if (l.lensType && l.lensId) {
      const legacy = draftPowerIdentityKey({
        lensType: l.lensType,
        lensId: l.lensId,
      });
      if (legacy && !byPower.has(legacy)) byPower.set(legacy, l);
    }
  }

  const deliveredByPower = new Map<string, PowerReceiptInput[]>();
  for (const d of input.deliveries) {
    const key = receiptIdentityKey(d);
    if (!key) continue;
    const list = deliveredByPower.get(key) ?? [];
    list.push(d);
    deliveredByPower.set(key, list);
  }

  const lines: ReconciledReceiptLine[] = [];
  const seen = new Set<string>();
  const seenPoLineIds = new Set<string>();

  for (const [key, rows] of deliveredByPower) {
    seen.add(key);
    const poLine = byPower.get(key);
    const delivered = rows.reduce((s, r) => s + Math.max(0, Math.trunc(r.deliveredQuantity)), 0);
    const damaged = rows.reduce(
      (s, r) => s + Math.max(0, Math.trunc(r.damagedQuantity ?? 0)),
      0
    );
    const sample = rows[0]!;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Number.isInteger(delivered) || delivered < 0) {
      errors.push("Delivered quantity must be a whole number ≥ 0.");
    }
    if (damaged > delivered) {
      errors.push("Damaged quantity cannot exceed delivered quantity.");
    }
    if (rows.length > 1) {
      warnings.push("Duplicate Excel rows for the same power were summed.");
    }

    if (!poLine) {
      lines.push({
        purchaseOrderLineId: null,
        lensType: sample.lensType ?? null,
        lensId: sample.lensId ?? null,
        lensProductPowerId: sample.lensProductPowerId ?? null,
        lensProductVariantId: sample.lensProductVariantId ?? null,
        sph: sample.sph ?? null,
        cyl: sample.cyl ?? null,
        productLabel: sample.productLabel ?? null,
        rangeLabel: sample.rangeLabel ?? null,
        powerLabel: sample.powerLabel ?? null,
        orderedQuantity: 0,
        previouslyReceived: 0,
        outstandingBefore: 0,
        deliveredQuantity: delivered,
        damagedQuantity: damaged,
        acceptedQuantity: 0,
        shortQuantity: 0,
        excessQuantity: delivered,
        lineStatus: "INVALID",
        actionCode: input.actions?.[key] ?? "REJECT_EXTRA",
        errors: [...errors, "Power is not on this purchase order."],
        warnings,
      });
      continue;
    }

    seenPoLineIds.add(poLine.id);
    const outstanding = openPoLineOutstanding(poLine);
    const action = input.actions?.[key] ?? null;
    const netGood = Math.max(0, delivered - damaged);
    let accepted = Math.min(netGood, outstanding);
    let excess = Math.max(0, netGood - outstanding);
    let short = Math.max(0, outstanding - netGood);

    if (action === "MARK_DAMAGED" && damaged === 0 && netGood > 0) {
      // Treat all good units as damaged / rejected — no stock.
      accepted = 0;
      short = outstanding;
      excess = 0;
    }
    if (action === "REJECT_EXTRA") {
      accepted = Math.min(netGood, outstanding);
      excess = Math.max(0, netGood - outstanding);
    }

    if (excess > 0) {
      warnings.push(
        `Excess ${excess} unit(s) beyond outstanding will not be posted to stock.`
      );
    }

    let lineStatus: ReconciledReceiptLine["lineStatus"] = "MATCHED";
    if (errors.length) lineStatus = "INVALID";
    else if (damaged > 0 && accepted === 0 && netGood === 0) lineStatus = "DAMAGED";
    else if (excess > 0) lineStatus = "EXTRA";
    else if (short > 0) lineStatus = "SHORT";
    else if (damaged > 0) lineStatus = "DAMAGED";

    lines.push({
      purchaseOrderLineId: poLine.id,
      lensType: poLine.lensType ?? null,
      lensId: poLine.lensId ?? null,
      lensProductPowerId: poLine.lensProductPowerId ?? null,
      lensProductVariantId: poLine.lensProductVariantId ?? null,
      sph: poLine.sph ?? null,
      cyl: poLine.cyl ?? null,
      productLabel: sample.productLabel ?? poLine.productLabel ?? null,
      rangeLabel: sample.rangeLabel ?? poLine.rangeLabel ?? null,
      powerLabel: sample.powerLabel ?? poLine.powerLabel ?? null,
      orderedQuantity: poLine.poQuantity,
      previouslyReceived: poLine.receivedQuantity ?? 0,
      outstandingBefore: outstanding,
      deliveredQuantity: delivered,
      damagedQuantity: damaged,
      acceptedQuantity: accepted,
      shortQuantity: short,
      excessQuantity: excess,
      lineStatus,
      actionCode: action,
      errors,
      warnings,
    });
  }

  // PO lines with no delivery → short / pending
  for (const poLine of input.poLines) {
    if (seenPoLineIds.has(poLine.id)) continue;
    const key = receiptIdentityKey(poLine);
    if (key && seen.has(key)) continue;
    const outstanding = openPoLineOutstanding(poLine);
    if (outstanding <= 0) continue;
    const actionKey = key ?? poLine.id;
    const action = input.actions?.[actionKey] ?? "KEEP_PENDING";
    lines.push({
      purchaseOrderLineId: poLine.id,
      lensType: poLine.lensType ?? null,
      lensId: poLine.lensId ?? null,
      lensProductPowerId: poLine.lensProductPowerId ?? null,
      lensProductVariantId: poLine.lensProductVariantId ?? null,
      sph: poLine.sph ?? null,
      cyl: poLine.cyl ?? null,
      productLabel: poLine.productLabel ?? null,
      rangeLabel: poLine.rangeLabel ?? null,
      powerLabel: poLine.powerLabel ?? null,
      orderedQuantity: poLine.poQuantity,
      previouslyReceived: poLine.receivedQuantity ?? 0,
      outstandingBefore: outstanding,
      deliveredQuantity: 0,
      damagedQuantity: 0,
      acceptedQuantity: 0,
      shortQuantity: outstanding,
      excessQuantity: 0,
      lineStatus: "SHORT",
      actionCode: action,
      errors: [],
      warnings: ["No Excel quantity for this outstanding power."],
    });
  }

  const totals = {
    acceptedUnits: 0,
    damagedUnits: 0,
    shortUnits: 0,
    excessUnits: 0,
    invalidRows: 0,
    errorCount: 0,
    warningCount: 0,
  };
  for (const line of lines) {
    totals.acceptedUnits += line.acceptedQuantity;
    totals.damagedUnits += line.damagedQuantity;
    totals.shortUnits += line.shortQuantity;
    totals.excessUnits += line.excessQuantity;
    if (line.lineStatus === "INVALID") totals.invalidRows += 1;
    totals.errorCount += line.errors.length;
    totals.warningCount += line.warnings.length;
  }

  return { lines, totals };
}

export function reconcileBillRanges(input: {
  billRows: BillRangeInput[];
  excelByRange: Array<{ productLabel: string; rangeLabel?: string | null; quantity: number }>;
  resolutions?: Record<string, string | undefined>;
}): RangeReconcileRow[] {
  const excelMap = new Map<string, number>();
  for (const row of input.excelByRange) {
    const key = `${row.productLabel}::${row.rangeLabel ?? ""}`;
    excelMap.set(key, (excelMap.get(key) ?? 0) + Math.max(0, Math.trunc(row.quantity)));
  }

  const keys = new Set<string>();
  const billMap = new Map<string, BillRangeInput>();
  for (const row of input.billRows) {
    const key = `${row.productLabel}::${row.rangeLabel ?? ""}`;
    keys.add(key);
    billMap.set(key, row);
  }
  for (const key of excelMap.keys()) keys.add(key);

  const out: RangeReconcileRow[] = [];
  for (const key of keys) {
    const [productLabel, rangeLabel = ""] = key.split("::");
    const billQuantity = billMap.get(key)?.billQuantity ?? 0;
    const excelQuantity = excelMap.get(key) ?? 0;
    const difference = excelQuantity - billQuantity;
    out.push({
      productLabel: productLabel || "",
      rangeLabel: rangeLabel || null,
      billQuantity,
      excelQuantity,
      difference,
      status: difference === 0 ? "MATCHED" : "MISMATCH",
      resolution: input.resolutions?.[key] ?? null,
    });
  }
  return out;
}

/** Remaining active allocation qty (allocated and not reversed). */
export function allocationActiveQuantity(row: {
  quantity: number;
  reversedQuantity?: number;
}): number {
  return Math.max(0, row.quantity - (row.reversedQuantity ?? 0));
}

/**
 * Allocation qty that can still be reversed: active minus what was already
 * received against it. Received units are never un-ordered.
 */
export function allocationReversibleQuantity(row: {
  quantity: number;
  reversedQuantity?: number;
  receivedQuantity?: number;
}): number {
  return Math.max(0, allocationActiveQuantity(row) - (row.receivedQuantity ?? 0));
}

/**
 * Plan partial reverse of allocations for close-outstanding / cancel.
 * FIFO by created order (caller sorts). Received portions are excluded, so the
 * plan is exact regardless of order.
 */
export function planAllocationReversals(
  allocations: Array<{
    id: string;
    quantity: number;
    reversedQuantity?: number;
    receivedQuantity?: number;
  }>,
  want: number
): Array<{ id: string; reverseBy: number }> {
  let remaining = Math.max(0, Math.trunc(want));
  const plan: Array<{ id: string; reverseBy: number }> = [];
  for (const row of allocations) {
    if (remaining <= 0) break;
    const reversible = allocationReversibleQuantity(row);
    if (reversible <= 0) continue;
    const reverseBy = Math.min(reversible, remaining);
    plan.push({ id: row.id, reverseBy });
    remaining -= reverseBy;
  }
  return plan;
}

/**
 * Plan how a confirmed receipt quantity settles this PO line's PR allocations
 * (FIFO). Units beyond the allocated quantity (PO qty raised above demand)
 * settle no request.
 */
export function planAllocationReceipts(
  allocations: Array<{
    id: string;
    procurementRequestId: string;
    quantity: number;
    reversedQuantity?: number;
    receivedQuantity?: number;
  }>,
  quantity: number
): Array<{ id: string; procurementRequestId: string; receiveBy: number }> {
  let remaining = Math.max(0, Math.trunc(quantity));
  const plan: Array<{ id: string; procurementRequestId: string; receiveBy: number }> = [];
  for (const row of allocations) {
    if (remaining <= 0) break;
    const room = allocationReversibleQuantity(row);
    if (room <= 0) continue;
    const receiveBy = Math.min(room, remaining);
    plan.push({ id: row.id, procurementRequestId: row.procurementRequestId, receiveBy });
    remaining -= receiveBy;
  }
  return plan;
}

export type ReceivablePoStatus = "OPEN" | "SENT" | "PARTIALLY_RECEIVED";

/**
 * PO status after a receipt is confirmed.
 * Nothing outstanding → CLOSED; anything received → PARTIALLY_RECEIVED;
 * otherwise keep SENT when the PO was already sent, else OPEN.
 */
export function nextPoStatusAfterReceipt(
  lines: PoLineQtyInput[],
  options?: { wasSent?: boolean }
): "OPEN" | "SENT" | "PARTIALLY_RECEIVED" | "CLOSED" {
  let anyOutstanding = false;
  let anyReceived = false;
  for (const line of lines) {
    if ((line.receivedQuantity ?? 0) > 0) anyReceived = true;
    if (openPoLineOutstanding(line) > 0) anyOutstanding = true;
  }
  if (!anyOutstanding) return "CLOSED";
  if (anyReceived) return "PARTIALLY_RECEIVED";
  return options?.wasSent ? "SENT" : "OPEN";
}

/**
 * Bill-vs-Excel range rows that still block Confirm Receipt: a mismatch must
 * carry an explicit resolution before stock can be posted.
 */
export function unresolvedRangeMismatches<
  T extends { difference: number; resolution: string | null },
>(rows: T[]): T[] {
  return rows.filter((row) => row.difference !== 0 && !row.resolution?.trim());
}

export const RANGE_RESOLUTIONS = [
  "BILL_CORRECTION",
  "EXCEL_CORRECTION",
  "ACCEPT_EXCEL",
  "KEEP_PENDING",
] as const;

export function isRangeResolution(value: unknown): value is (typeof RANGE_RESOLUTIONS)[number] {
  return typeof value === "string" && (RANGE_RESOLUTIONS as readonly string[]).includes(value);
}

/** Why a receipt cannot be confirmed yet (empty = ready). Pure. */
export function receiptConfirmBlockers(receipt: {
  status: string;
  billStoragePath: string | null;
  excelStoragePath: string | null;
  lines: Array<{ acceptedQuantity: number; purchaseOrderLineId: string | null }>;
  billSummaries: Array<{ difference: number; resolution: string | null }>;
}): string[] {
  const blockers: string[] = [];
  if (receipt.status !== "DRAFT" && receipt.status !== "VALIDATED") {
    blockers.push(`Receipt is ${receipt.status.toLowerCase()}.`);
  }
  const missing = missingReceiptDocuments(receipt);
  if (missing.includes("bill")) blockers.push("Supplier bill has not been stored.");
  if (missing.includes("excel")) blockers.push("Power-wise Excel has not been stored.");
  const unresolved = unresolvedRangeMismatches(receipt.billSummaries).length;
  if (unresolved > 0) {
    blockers.push(`${unresolved} range-wise bill mismatch(es) need a resolution.`);
  }
  if (receipt.lines.some((l) => l.acceptedQuantity > 0 && !l.purchaseOrderLineId)) {
    blockers.push("Units are accepted on a power that is not on the purchase order.");
  }
  if (receipt.lines.reduce((sum, l) => sum + Math.max(0, l.acceptedQuantity), 0) <= 0) {
    blockers.push("No accepted units to post. Use Close outstanding if nothing will arrive.");
  }
  return blockers;
}
