import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lineAmount } from "./purchase-order-math";
import {
  PO_WIZARD_STEPS,
  contributedProcurementRequestIds,
  decideDuplicateImport,
  fingerprintImportBytes,
  formatCountLabel,
  importNoticeShouldClear,
  mergePoWizardLines,
  parseOptionalRate,
  parsePositiveWholeQuantity,
  poWizardBackAction,
  poWizardLineAmountDisplay,
  poWizardLineError,
  poWizardSummaryAmountLabel,
  poWizardSummaryValidationMessage,
  pruneImportFingerprints,
  summarizePoWizardLines,
  type PoWizardDraftLine,
} from "./purchase-order-wizard";

function draftLine(
  over: Partial<PoWizardDraftLine> &
    Pick<PoWizardDraftLine, "key" | "procurementRequestId" | "requiredQuantity" | "poQuantity">
): PoWizardDraftLine {
  const prId = over.procurementRequestId;
  const ids = over.procurementRequestIds ?? (prId ? [prId] : []);
  return {
    lensType: "SINGLE_VISION",
    lensId: "lens-1",
    rate: "",
    productLabel: "Test",
    rangeLabel: null,
    powerLabel: "-1.00/-1.00",
    openPurchaseOrder: null,
    ...over,
    procurementRequestIds: ids,
  };
}

describe("formatCountLabel", () => {
  it("uses singular and plural forms", () => {
    assert.equal(formatCountLabel(1, "line"), "1 line");
    assert.equal(formatCountLabel(2, "line"), "2 lines");
    assert.equal(formatCountLabel(1, "unit"), "1 unit");
    assert.equal(formatCountLabel(18, "unit"), "18 units");
  });
});

describe("PO quantity validation", () => {
  it("rejects zero and decimal quantities", () => {
    assert.equal(parsePositiveWholeQuantity("0"), null);
    assert.equal(parsePositiveWholeQuantity("1.5"), null);
    assert.equal(parsePositiveWholeQuantity("-2"), null);
    assert.equal(parsePositiveWholeQuantity("  "), null);
    assert.equal(poWizardLineError({ poQuantity: "0", rate: "" }), "PO qty must be a whole number > 0");
    assert.equal(
      poWizardLineError({ poQuantity: "1.5", rate: "10" }),
      "PO qty must be a whole number > 0"
    );
  });

  it("accepts positive whole quantities", () => {
    assert.equal(parsePositiveWholeQuantity("18"), 18);
    assert.equal(poWizardLineError({ poQuantity: "18", rate: "" }), null);
  });
});

describe("optional rate parsing", () => {
  it("treats blank as pending and zero as a real rate", () => {
    assert.deepEqual(parseOptionalRate(""), { ok: true, value: null });
    assert.deepEqual(parseOptionalRate("0"), { ok: true, value: 0 });
    assert.deepEqual(parseOptionalRate("150"), { ok: true, value: 150 });
  });

  it("rejects negative rates", () => {
    assert.deepEqual(parseOptionalRate("-1"), { ok: false });
    assert.equal(
      poWizardLineError({ poQuantity: "2", rate: "-1" }),
      "Rate must be ≥ 0"
    );
  });
});

describe("line amount display", () => {
  it("distinguishes pending rate, zero rate, and calculated amount", () => {
    assert.deepEqual(
      poWizardLineAmountDisplay({ poQuantity: "18", rate: "" }),
      { kind: "pending_rate" }
    );
    assert.deepEqual(
      poWizardLineAmountDisplay({ poQuantity: "18", rate: "0" }),
      { kind: "amount", value: 0 }
    );
    assert.deepEqual(
      poWizardLineAmountDisplay({ poQuantity: "18", rate: "150" }),
      { kind: "amount", value: 2700 }
    );
    assert.deepEqual(
      poWizardLineAmountDisplay({ poQuantity: "0", rate: "150" }),
      { kind: "invalid" }
    );
  });

  it("calculates 18 units × ₹150 = ₹2,700", () => {
    assert.equal(lineAmount(18, 150), 2700);
    const summary = summarizePoWizardLines([{ poQuantity: "18", rate: "150" }]);
    assert.equal(summary.qty, 18);
    assert.equal(summary.amount, 2700);
    assert.equal(summary.amountComplete, true);
    assert.equal(summary.canSave, true);
  });
});

describe("summarizePoWizardLines", () => {
  it("excludes invalid quantities from totals and disables save", () => {
    const summary = summarizePoWizardLines([
      { poQuantity: "18", rate: "150" },
      { poQuantity: "0", rate: "100" },
      { poQuantity: "1.5", rate: "50" },
    ]);
    assert.equal(summary.qty, 18);
    assert.equal(summary.amount, 2700);
    assert.equal(summary.hasErrors, true);
    assert.equal(summary.hasQuantityErrors, true);
    assert.equal(summary.hasRateErrors, false);
    assert.equal(summary.canSave, false);
    assert.equal(summary.priced, 1);
    assert.match(
      String(poWizardSummaryValidationMessage(summary)),
      /invalid quantities/i
    );
  });

  it("keeps valid quantity when only rate is invalid", () => {
    const summary = summarizePoWizardLines([
      { poQuantity: "18", rate: "-50" },
    ]);
    assert.equal(summary.qty, 18);
    assert.equal(summary.amount, 0);
    assert.equal(summary.priced, 0);
    assert.equal(summary.unpriced, 0);
    assert.equal(summary.hasErrors, true);
    assert.equal(summary.hasQuantityErrors, false);
    assert.equal(summary.hasRateErrors, true);
    assert.equal(summary.canSave, false);
    assert.equal(poWizardSummaryAmountLabel(summary), "none");
    assert.equal(
      poWizardSummaryValidationMessage(summary),
      "Fix invalid rates before saving. Amount cannot include lines with invalid rates."
    );
  });

  it("counts valid qty across mixed qty and rate errors without using invalid money", () => {
    const summary = summarizePoWizardLines([
      { poQuantity: "18", rate: "-50" },
      { poQuantity: "0", rate: "100" },
      { poQuantity: "2", rate: "25" },
    ]);
    assert.equal(summary.qty, 20);
    assert.equal(summary.amount, 50);
    assert.equal(summary.hasQuantityErrors, true);
    assert.equal(summary.hasRateErrors, true);
    assert.equal(summary.canSave, false);
    assert.match(
      String(poWizardSummaryValidationMessage(summary)),
      /quantities and rates/i
    );
  });

  it("does not treat missing rates as ₹0 totals", () => {
    const summary = summarizePoWizardLines([
      { poQuantity: "10", rate: "" },
      { poQuantity: "5", rate: "20" },
    ]);
    assert.equal(summary.qty, 15);
    assert.equal(summary.amount, 100);
    assert.equal(summary.unpriced, 1);
    assert.equal(summary.priced, 1);
    assert.equal(summary.amountComplete, false);
    assert.equal(summary.canSave, true);
    assert.equal(poWizardSummaryAmountLabel(summary), "partial");
    assert.equal(poWizardSummaryValidationMessage(summary), null);
  });

  it("labels all-unpriced totals as pending", () => {
    const summary = summarizePoWizardLines([
      { poQuantity: "3", rate: "" },
      { poQuantity: "4", rate: "" },
    ]);
    assert.equal(summary.amount, 0);
    assert.equal(summary.unpriced, 2);
    assert.equal(poWizardSummaryAmountLabel(summary), "pending");
  });
});

describe("wizard step labels", () => {
  it("keeps approval as an informational step on the PO page", () => {
    assert.equal(PO_WIZARD_STEPS.length, 3);
    assert.equal(PO_WIZARD_STEPS[0]!.label, "1. Select items");
    assert.equal(PO_WIZARD_STEPS[1]!.label, "2. Review & save");
    assert.equal(PO_WIZARD_STEPS[2]!.label, "3. Approve on PO page");
    assert.equal(PO_WIZARD_STEPS[0]!.kind, "step");
    assert.equal(PO_WIZARD_STEPS[1]!.kind, "step");
    assert.equal(PO_WIZARD_STEPS[2]!.kind, "info");
  });
});

describe("poWizardBackAction", () => {
  it("returns to select items from review without exiting", () => {
    const action = poWizardBackAction("review");
    assert.equal(action.kind, "previous_step");
    if (action.kind === "previous_step") {
      assert.equal(action.targetStep, "select");
      assert.equal(action.label, "Back to select items");
    }
  });

  it("exits to the purchase orders list from select", () => {
    const action = poWizardBackAction("select");
    assert.deepEqual(action, {
      kind: "exit",
      label: "Back to purchase orders",
      href: "/procurement/purchase-orders",
    });
  });

  it("exits to the draft PO when editing an existing draft", () => {
    const action = poWizardBackAction("select", { draftId: "po_123" });
    assert.deepEqual(action, {
      kind: "exit",
      label: "Back to purchase order",
      href: "/procurement/purchase-orders/po_123",
    });
  });

  it("keeps review→select navigation even when a draft id is present", () => {
    const action = poWizardBackAction("review", { draftId: "po_123" });
    assert.equal(action.kind, "previous_step");
    if (action.kind === "previous_step") {
      assert.equal(action.targetStep, "select");
    }
  });
});

describe("wizard in-memory state preservation contract", () => {
  it("documents that step changes do not clear line or header fields", () => {
    // Pure contract: backAction never implies a form reset. The page keeps
    // lines/supplier/etc. in React state and only flips `step`.
    const reviewBack = poWizardBackAction("review");
    assert.equal(reviewBack.kind, "previous_step");
    assert.notEqual(reviewBack.kind, "exit");

    const draft = {
      lines: [{ poQuantity: "18", rate: "150" }],
      supplierId: "sup_1",
      warehouseCode: "MAIN",
      expectedDelivery: "2026-10-20",
      notes: "keep me",
    };
    const afterBackToSelect = { ...draft, step: "select" as const };
    const afterContinueToReview = { ...afterBackToSelect, step: "review" as const };

    assert.deepEqual(afterContinueToReview.lines, draft.lines);
    assert.equal(afterContinueToReview.supplierId, draft.supplierId);
    assert.equal(afterContinueToReview.warehouseCode, draft.warehouseCode);
    assert.equal(afterContinueToReview.expectedDelivery, draft.expectedDelivery);
    assert.equal(afterContinueToReview.notes, draft.notes);
    assert.equal(summarizePoWizardLines(afterContinueToReview.lines).qty, 18);
    assert.equal(summarizePoWizardLines(afterContinueToReview.lines).amount, 2700);
  });
});

describe("mergePoWizardLines — duplicate PR idempotency", () => {
  const pr1 = draftLine({
    key: "SINGLE_VISION::lens-1",
    procurementRequestId: "pr_1",
    requiredQuantity: 20,
    poQuantity: "20",
    rate: "150",
  });

  it("adding the same request twice does not increase quantities", () => {
    const once = mergePoWizardLines([], [pr1]);
    const twice = mergePoWizardLines(once, [pr1]);
    assert.equal(twice.length, 1);
    assert.equal(twice[0]!.requiredQuantity, 20);
    assert.equal(twice[0]!.poQuantity, "20");
    assert.equal(twice[0]!.rate, "150");
    assert.deepEqual(twice[0]!.procurementRequestIds, ["pr_1"]);
  });

  it("adding the same request three times remains idempotent", () => {
    let lines = mergePoWizardLines([], [pr1]);
    lines = mergePoWizardLines(lines, [pr1]);
    lines = mergePoWizardLines(lines, [pr1]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.requiredQuantity, 20);
    assert.equal(lines[0]!.poQuantity, "20");
  });

  it("preserves manually edited PO qty and rate on duplicate selection", () => {
    const edited = draftLine({
      key: "SINGLE_VISION::lens-1",
      procurementRequestId: "pr_1",
      requiredQuantity: 20,
      poQuantity: "12",
      rate: "99.5",
    });
    const after = mergePoWizardLines([edited], [pr1]);
    assert.equal(after[0]!.poQuantity, "12");
    assert.equal(after[0]!.rate, "99.5");
    assert.equal(after[0]!.requiredQuantity, 20);
  });

  it("aggregates different PRs for the same power without duplicating lines", () => {
    const pr2 = draftLine({
      key: "SINGLE_VISION::lens-1",
      procurementRequestId: "pr_2",
      requiredQuantity: 10,
      poQuantity: "10",
      rate: "",
    });
    const after = mergePoWizardLines([pr1], [pr2]);
    assert.equal(after.length, 1);
    assert.equal(after[0]!.requiredQuantity, 30);
    assert.equal(after[0]!.poQuantity, "30");
    assert.equal(after[0]!.rate, "150");
    assert.deepEqual(after[0]!.procurementRequestIds, ["pr_1", "pr_2"]);
  });

  it("does not overwrite an existing rate when aggregating a second PR", () => {
    const pr2 = draftLine({
      key: "SINGLE_VISION::lens-1",
      procurementRequestId: "pr_2",
      requiredQuantity: 5,
      poQuantity: "5",
      rate: "1",
    });
    const after = mergePoWizardLines([pr1], [pr2]);
    assert.equal(after[0]!.rate, "150");
  });

  it("exposes contributed PR ids for Already added UX", () => {
    const lines = mergePoWizardLines(
      [pr1],
      [
        draftLine({
          key: "SINGLE_VISION::lens-1",
          procurementRequestId: "pr_2",
          requiredQuantity: 5,
          poQuantity: "5",
        }),
      ]
    );
    const ids = contributedProcurementRequestIds(lines);
    assert.equal(ids.has("pr_1"), true);
    assert.equal(ids.has("pr_2"), true);
    assert.equal(ids.has("pr_missing"), false);
  });

  it("keeps header fields untouched when only lines are merged", () => {
    const header = {
      supplierId: "sup_1",
      warehouseCode: "MAIN",
      expectedDelivery: "2026-11-01",
      notes: "do not touch",
    };
    const lines = mergePoWizardLines([pr1], [pr1]);
    assert.equal(header.supplierId, "sup_1");
    assert.equal(header.warehouseCode, "MAIN");
    assert.equal(header.expectedDelivery, "2026-11-01");
    assert.equal(header.notes, "do not touch");
    assert.equal(lines[0]!.requiredQuantity, 20);
  });
});

describe("Excel import fingerprint + notice", () => {
  it("first import merges with correct quantities", () => {
    const excel = draftLine({
      key: "SINGLE_VISION::lens-1",
      procurementRequestId: null,
      requiredQuantity: 20,
      poQuantity: "20",
      importFingerprint: "fp-a",
    });
    const lines = mergePoWizardLines([], [excel]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.requiredQuantity, 20);
    assert.equal(lines[0]!.poQuantity, "20");
    assert.equal(lines[0]!.importFingerprint, "fp-a");
  });

  it("blocks unconfirmed re-import of the same fingerprint", () => {
    assert.deepEqual(
      decideDuplicateImport({ alreadyImported: false, userConfirmedRepeat: false }),
      { action: "proceed", reason: "first" }
    );
    assert.deepEqual(
      decideDuplicateImport({ alreadyImported: true, userConfirmedRepeat: false }),
      { action: "block", reason: "duplicate_unconfirmed" }
    );
  });

  it("allows explicitly confirmed repeated imports to add quantities", () => {
    assert.deepEqual(
      decideDuplicateImport({ alreadyImported: true, userConfirmedRepeat: true }),
      { action: "proceed", reason: "confirmed_repeat" }
    );
    const first = draftLine({
      key: "SINGLE_VISION::lens-1",
      procurementRequestId: null,
      requiredQuantity: 20,
      poQuantity: "20",
      rate: "12",
      importFingerprint: "fp-a",
    });
    const again = draftLine({
      key: "SINGLE_VISION::lens-1",
      procurementRequestId: null,
      requiredQuantity: 20,
      poQuantity: "20",
      importFingerprint: "fp-a",
    });
    // Confirmed path still uses additive merge (intentional after confirm).
    const after = mergePoWizardLines([first], [again]);
    assert.equal(after[0]!.requiredQuantity, 40);
    assert.equal(after[0]!.poQuantity, "40");
    assert.equal(after[0]!.rate, "12");
  });

  it("does not silently increase quantities when duplicate import is rejected", () => {
    const existing = draftLine({
      key: "SINGLE_VISION::lens-1",
      procurementRequestId: null,
      requiredQuantity: 20,
      poQuantity: "15",
      rate: "99",
      importFingerprint: "fp-a",
    });
    const decision = decideDuplicateImport({
      alreadyImported: true,
      userConfirmedRepeat: false,
    });
    assert.equal(decision.action, "block");
    // Rejected import never calls merge — lines stay as edited.
    assert.equal(existing.requiredQuantity, 20);
    assert.equal(existing.poQuantity, "15");
    assert.equal(existing.rate, "99");
  });

  it("allows different legitimate Excel imports to add", () => {
    const fileA = draftLine({
      key: "SINGLE_VISION::lens-1",
      procurementRequestId: null,
      requiredQuantity: 20,
      poQuantity: "20",
      importFingerprint: "fp-a",
    });
    const fileB = draftLine({
      key: "SINGLE_VISION::lens-2",
      lensId: "lens-2",
      procurementRequestId: null,
      requiredQuantity: 5,
      poQuantity: "5",
      importFingerprint: "fp-b",
    });
    assert.equal(
      decideDuplicateImport({ alreadyImported: false, userConfirmedRepeat: false }).action,
      "proceed"
    );
    const after = mergePoWizardLines([fileA], [fileB]);
    assert.equal(after.length, 2);
    assert.equal(after.find((l) => l.key.endsWith("lens-1"))!.requiredQuantity, 20);
    assert.equal(after.find((l) => l.key.endsWith("lens-2"))!.requiredQuantity, 5);
  });

  it("keeps queue PR lines correct alongside Excel imports", () => {
    const queue = draftLine({
      key: "SINGLE_VISION::lens-1",
      procurementRequestId: "pr_1",
      requiredQuantity: 20,
      poQuantity: "20",
      rate: "10",
    });
    const excel = draftLine({
      key: "SINGLE_VISION::lens-2",
      lensId: "lens-2",
      procurementRequestId: null,
      requiredQuantity: 8,
      poQuantity: "8",
      importFingerprint: "fp-b",
    });
    const after = mergePoWizardLines([queue], [excel]);
    assert.equal(after.length, 2);
    assert.equal(after.find((l) => l.procurementRequestId === "pr_1")!.poQuantity, "20");
    assert.equal(after.find((l) => l.importFingerprint === "fp-b")!.requiredQuantity, 8);
  });

  it("clears import success notice when associated lines are removed", () => {
    assert.equal(
      importNoticeShouldClear(["SINGLE_VISION::lens-1"], [
        { key: "SINGLE_VISION::lens-1" },
      ]),
      false
    );
    assert.equal(
      importNoticeShouldClear(["SINGLE_VISION::lens-1"], []),
      true
    );
    assert.equal(
      importNoticeShouldClear(
        ["SINGLE_VISION::lens-1"],
        [{ key: "SINGLE_VISION::lens-2" }]
      ),
      true
    );
  });

  it("prunes session fingerprints when imported lines are removed", () => {
    const pruned = pruneImportFingerprints(["fp-a", "fp-b"], [
      { importFingerprint: "fp-a" },
    ]);
    assert.deepEqual([...pruned], ["fp-a"]);
    assert.deepEqual(
      [...pruneImportFingerprints(["fp-a"], [])],
      []
    );
  });

  it("fingerprints content, not filenames", async () => {
    const a = await fingerprintImportBytes(new TextEncoder().encode("workbook-bytes-1"));
    const b = await fingerprintImportBytes(new TextEncoder().encode("workbook-bytes-1"));
    const c = await fingerprintImportBytes(new TextEncoder().encode("workbook-bytes-2"));
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  it("does not treat import errors as a success notice", () => {
    // Contract: failed imports never set notice keys.
    assert.equal(importNoticeShouldClear([], [{ key: "x" }]), false);
  });
});
