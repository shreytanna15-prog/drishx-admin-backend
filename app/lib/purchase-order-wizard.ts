/**
 * Pure helpers for the Purchase Order create/edit wizard UI.
 * Keeps validation, summary math, and labels testable without React.
 */

import { lineAmount } from "./purchase-order-math";

export type PoWizardLineInput = {
  poQuantity: string;
  rate: string;
};

/**
 * Draft line shape used by the create-PO wizard while merging queue / Excel rows.
 * `procurementRequestIds` tracks which PRs already contributed (idempotent by PR id).
 */
export type PoWizardDraftLine = {
  key: string;
  lensType: string | null;
  lensId: string | null;
  lensProductPowerId?: string | null;
  lensProductVariantId?: string | null;
  sph?: number | null;
  cyl?: number | null;
  requiredQuantity: number;
  poQuantity: string;
  rate: string;
  procurementRequestId: string | null;
  procurementRequestIds: string[];
  productLabel: string | null;
  rangeLabel: string | null;
  powerLabel: string | null;
  openPurchaseOrder: string | null;
  /**
   * Session-only fingerprint of an Excel file that contributed this line.
   * Used to warn on silent re-import of the same file; not persisted to the API.
   */
  importFingerprint?: string | null;
};

function normalizeContributedRequestIds(line: {
  procurementRequestId: string | null;
  procurementRequestIds?: string[];
}): string[] {
  if (line.procurementRequestIds?.length) {
    return [...new Set(line.procurementRequestIds.filter(Boolean))];
  }
  return line.procurementRequestId ? [line.procurementRequestId] : [];
}

/**
 * Merge incoming wizard lines into existing ones by power (`lensType::lensId`).
 *
 * - Same procurement request id → no-op (required/PO qty/rate unchanged).
 * - Different PR ids for the same power → aggregate required + add incoming PO qty;
 *   never overwrite an existing rate.
 * - Excel rows (no PR id) still merge additively by power; within-file duplicates
 *   are rejected earlier by the import parser.
 */
export function mergePoWizardLines(
  existing: PoWizardDraftLine[],
  incoming: PoWizardDraftLine[]
): PoWizardDraftLine[] {
  const byPower = new Map<string, PoWizardDraftLine>();
  for (const line of existing) {
    const ids = normalizeContributedRequestIds(line);
    byPower.set(line.key, {
      ...line,
      procurementRequestIds: ids,
      procurementRequestId: line.procurementRequestId ?? ids[0] ?? null,
    });
  }

  for (const raw of incoming) {
    const incomingIds = normalizeContributedRequestIds(raw);
    const line: PoWizardDraftLine = {
      ...raw,
      procurementRequestIds: incomingIds,
      procurementRequestId: raw.procurementRequestId ?? incomingIds[0] ?? null,
    };

    const current = byPower.get(line.key);
    if (!current) {
      byPower.set(line.key, line);
      continue;
    }

    const prId = line.procurementRequestId;
    if (prId) {
      if (current.procurementRequestIds.includes(prId)) {
        // Already contributed this PR — idempotent.
        continue;
      }
      current.procurementRequestIds = [...current.procurementRequestIds, prId];
      if (!current.procurementRequestId) current.procurementRequestId = prId;
      current.requiredQuantity += line.requiredQuantity;
      current.poQuantity = String(
        (Number(current.poQuantity) || 0) + (Number(line.poQuantity) || 0)
      );
      if (!current.rate.trim() && line.rate.trim()) current.rate = line.rate;
      if (!current.productLabel && line.productLabel) {
        current.productLabel = line.productLabel;
      }
      if (!current.powerLabel && line.powerLabel) current.powerLabel = line.powerLabel;
      if (!current.rangeLabel && line.rangeLabel) current.rangeLabel = line.rangeLabel;
      continue;
    }

    // No PR id (Excel / manual): additive by power.
    current.requiredQuantity += line.requiredQuantity;
    current.poQuantity = String(
      (Number(current.poQuantity) || 0) + (Number(line.poQuantity) || 0)
    );
    if (!current.rate.trim() && line.rate.trim()) current.rate = line.rate;
    if (!current.productLabel && line.productLabel) {
      current.productLabel = line.productLabel;
    }
    if (!current.powerLabel && line.powerLabel) current.powerLabel = line.powerLabel;
    if (!current.rangeLabel && line.rangeLabel) current.rangeLabel = line.rangeLabel;
    if (!current.importFingerprint && line.importFingerprint) {
      current.importFingerprint = line.importFingerprint;
    }
  }

  return [...byPower.values()];
}

export const DUPLICATE_IMPORT_CONFIRM_MESSAGE =
  "This Excel file was already imported in this purchase order. Importing again will add its quantities to existing lines and may inflate Required / PO qty. Continue only if you intend to add those quantities again.";

export type DuplicateImportDecision =
  | { action: "proceed"; reason: "first" | "confirmed_repeat" }
  | { action: "block"; reason: "duplicate_unconfirmed" };

/** Session-scoped decision: same file content may add only after explicit confirm. */
export function decideDuplicateImport(input: {
  alreadyImported: boolean;
  userConfirmedRepeat: boolean;
}): DuplicateImportDecision {
  if (!input.alreadyImported) return { action: "proceed", reason: "first" };
  if (input.userConfirmedRepeat) {
    return { action: "proceed", reason: "confirmed_repeat" };
  }
  return { action: "block", reason: "duplicate_unconfirmed" };
}

/** Drop fingerprints that no longer appear on any wizard line (e.g. lines removed). */
export function pruneImportFingerprints(
  fingerprints: Iterable<string>,
  lines: Array<{ importFingerprint?: string | null }>
): Set<string> {
  const active = new Set<string>();
  for (const line of lines) {
    const fp = line.importFingerprint?.trim();
    if (fp) active.add(fp);
  }
  const next = new Set<string>();
  for (const fp of fingerprints) {
    if (active.has(fp)) next.add(fp);
  }
  return next;
}

/** Clear the import success banner once none of its line keys remain. */
export function importNoticeShouldClear(
  noticeKeys: string[],
  lines: Array<{ key: string }>
): boolean {
  if (!noticeKeys.length) return false;
  const present = new Set(lines.map((l) => l.key));
  return !noticeKeys.some((key) => present.has(key));
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

/** SHA-256 hex fingerprint of Excel bytes (content-based, not filename). */
export async function fingerprintImportBytes(
  data: ArrayBuffer | Uint8Array
): Promise<string> {
  const view =
    data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return toHex(new Uint8Array(digest));
}

/** PR ids already represented on wizard lines (for queue “Already added” UX). */
export function contributedProcurementRequestIds(
  lines: Array<{ procurementRequestIds?: string[]; procurementRequestId?: string | null }>
): Set<string> {
  const ids = new Set<string>();
  for (const line of lines) {
    for (const id of normalizeContributedRequestIds({
      procurementRequestId: line.procurementRequestId ?? null,
      procurementRequestIds: line.procurementRequestIds,
    })) {
      ids.add(id);
    }
  }
  return ids;
}

/** Wizard chrome: steps 1–2 are interactive; step 3 is informational only. */
export const PO_WIZARD_STEPS = [
  { key: "select", label: "1. Select items", kind: "step" as const },
  { key: "review", label: "2. Review & save", kind: "step" as const },
  {
    key: "approve",
    label: "3. Approve on PO page",
    kind: "info" as const,
  },
] as const;

export type PoWizardStepKey = (typeof PO_WIZARD_STEPS)[number]["key"];

/** Interactive wizard steps (excludes informational approve chip). */
export type PoWizardActiveStep = "select" | "review";

export type PoWizardBackAction =
  | {
      kind: "previous_step";
      targetStep: "select";
      label: string;
    }
  | {
      kind: "exit";
      label: string;
      href: string;
    };

/**
 * Header back control: Step 2 returns to Step 1 in-memory; Step 1 exits the wizard.
 * Form state is preserved by React state — no browser-refresh persistence.
 */
export function poWizardBackAction(
  step: PoWizardActiveStep,
  options?: { draftId?: string | null }
): PoWizardBackAction {
  if (step === "review") {
    return {
      kind: "previous_step",
      targetStep: "select",
      label: "Back to select items",
    };
  }
  const draftId = options?.draftId?.trim() || "";
  if (draftId) {
    return {
      kind: "exit",
      label: "Back to purchase order",
      href: `/procurement/purchase-orders/${draftId}`,
    };
  }
  return {
    kind: "exit",
    label: "Back to purchase orders",
    href: "/procurement/purchase-orders",
  };
}

/** `1 line` / `2 lines`, `1 unit` / `18 units`. */
export function formatCountLabel(
  count: number,
  singular: string,
  plural = `${singular}s`
): string {
  const n = Number.isFinite(count) ? Math.trunc(count) : 0;
  return `${n} ${n === 1 ? singular : plural}`;
}

export function parsePositiveWholeQuantity(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function parseOptionalRate(
  raw: string
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const rate = Number(trimmed);
  if (!Number.isFinite(rate) || rate < 0) return { ok: false };
  return { ok: true, value: rate };
}

export function poWizardLineError(line: PoWizardLineInput): string | null {
  if (parsePositiveWholeQuantity(line.poQuantity) == null) {
    return "PO qty must be a whole number > 0";
  }
  if (!parseOptionalRate(line.rate).ok) {
    return "Rate must be ≥ 0";
  }
  return null;
}

export type PoWizardLineAmountDisplay =
  | { kind: "pending_rate" }
  | { kind: "invalid" }
  | { kind: "amount"; value: number };

/** Distinguishes missing rate, invalid inputs, and a real (including zero) amount. */
export function poWizardLineAmountDisplay(
  line: PoWizardLineInput
): PoWizardLineAmountDisplay {
  const qty = parsePositiveWholeQuantity(line.poQuantity);
  const rate = parseOptionalRate(line.rate);
  if (qty == null || !rate.ok) return { kind: "invalid" };
  if (rate.value == null) return { kind: "pending_rate" };
  return { kind: "amount", value: lineAmount(qty, rate.value) };
}

export type PoWizardSummary = {
  /** Valid PO quantities only (counted even when rate is invalid). */
  qty: number;
  /** Sum of lines with both a valid quantity and a valid rate (includes rate 0). */
  amount: number;
  /** Valid qty + blank rate. */
  unpriced: number;
  /** Valid qty + valid rate (including 0). */
  priced: number;
  hasErrors: boolean;
  hasQuantityErrors: boolean;
  hasRateErrors: boolean;
  canSave: boolean;
  /** Every line is fully valid and has a rate. */
  amountComplete: boolean;
};

/**
 * Totals for the review footer.
 * - Invalid quantities are excluded from unit totals.
 * - Valid quantities still count when only the rate is invalid.
 * - Monetary totals never include invalid rates (or invalid quantities).
 */
export function summarizePoWizardLines(
  lines: PoWizardLineInput[]
): PoWizardSummary {
  let qty = 0;
  let amount = 0;
  let unpriced = 0;
  let priced = 0;
  let hasQuantityErrors = false;
  let hasRateErrors = false;

  for (const line of lines) {
    const q = parsePositiveWholeQuantity(line.poQuantity);
    const rate = parseOptionalRate(line.rate);

    if (q == null) {
      hasQuantityErrors = true;
      continue;
    }

    qty += q;

    if (!rate.ok) {
      hasRateErrors = true;
      continue;
    }

    if (rate.value == null) {
      unpriced += 1;
    } else {
      priced += 1;
      amount += lineAmount(q, rate.value);
    }
  }

  const hasErrors = hasQuantityErrors || hasRateErrors;

  return {
    qty,
    amount: Math.round(amount * 100) / 100,
    unpriced,
    priced,
    hasErrors,
    hasQuantityErrors,
    hasRateErrors,
    canSave: lines.length > 0 && !hasErrors,
    amountComplete: lines.length > 0 && !hasErrors && unpriced === 0,
  };
}

/** Accurate footer validation copy for quantity vs rate problems. */
export function poWizardSummaryValidationMessage(
  summary: PoWizardSummary
): string | null {
  if (!summary.hasErrors) return null;
  if (summary.hasQuantityErrors && summary.hasRateErrors) {
    return "Fix invalid quantities and rates before saving. Unit totals exclude invalid quantities; amounts exclude invalid rates.";
  }
  if (summary.hasQuantityErrors) {
    return "Fix invalid quantities before saving. Unit totals exclude invalid quantities.";
  }
  return "Fix invalid rates before saving. Amount cannot include lines with invalid rates.";
}

/** Footer amount copy for the review summary. */
export function poWizardSummaryAmountLabel(summary: PoWizardSummary): string {
  if (summary.amountComplete) {
    return "complete";
  }
  if (summary.priced > 0 && summary.unpriced > 0) {
    return "partial";
  }
  if (summary.unpriced > 0 && summary.priced === 0) {
    return "pending";
  }
  if (summary.hasRateErrors && summary.priced === 0 && summary.unpriced === 0) {
    return "none";
  }
  if (
    summary.hasQuantityErrors &&
    summary.priced === 0 &&
    summary.unpriced === 0 &&
    summary.qty === 0
  ) {
    return "none";
  }
  return "complete";
}
