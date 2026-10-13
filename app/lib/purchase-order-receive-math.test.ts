import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allocationActiveQuantity,
  isCloseOutstandingReason,
  nextPoStatusAfterReceipt,
  planAllocationReversals,
  reconcileBillRanges,
  reconcilePowerReceipt,
} from "./purchase-order-receive-math";

const poLine = (overrides: Partial<{
  id: string;
  lensType: string;
  lensId: string;
  poQuantity: number;
  receivedQuantity: number;
  cancelledQuantity: number;
}> = {}) => ({
  id: overrides.id ?? "line-1",
  lensType: overrides.lensType ?? "SINGLE_VISION",
  lensId: overrides.lensId ?? "lens-a",
  poQuantity: overrides.poQuantity ?? 100,
  receivedQuantity: overrides.receivedQuantity ?? 0,
  cancelledQuantity: overrides.cancelledQuantity ?? 0,
  productLabel: "SV Blue",
  rangeLabel: "1.56",
  powerLabel: "-1.00 / -0.50",
});

describe("reconcilePowerReceipt", () => {
  it("matches full delivery within outstanding", () => {
    const { lines, totals } = reconcilePowerReceipt({
      poLines: [poLine()],
      deliveries: [
        {
          lensType: "SINGLE_VISION",
          lensId: "lens-a",
          deliveredQuantity: 100,
        },
      ],
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.acceptedQuantity, 100);
    assert.equal(lines[0]!.lineStatus, "MATCHED");
    assert.equal(totals.acceptedUnits, 100);
    assert.equal(totals.excessUnits, 0);
  });

  it("supports partial receiving (short)", () => {
    const { lines, totals } = reconcilePowerReceipt({
      poLines: [poLine({ poQuantity: 100 })],
      deliveries: [
        {
          lensType: "SINGLE_VISION",
          lensId: "lens-a",
          deliveredQuantity: 40,
        },
      ],
    });
    assert.equal(lines[0]!.acceptedQuantity, 40);
    assert.equal(lines[0]!.shortQuantity, 60);
    assert.equal(lines[0]!.lineStatus, "SHORT");
    assert.equal(totals.shortUnits, 60);
  });

  it("caps accepted at outstanding and flags excess (does not silently accept)", () => {
    const { lines, totals } = reconcilePowerReceipt({
      poLines: [poLine({ poQuantity: 50, receivedQuantity: 0 })],
      deliveries: [
        {
          lensType: "SINGLE_VISION",
          lensId: "lens-a",
          deliveredQuantity: 80,
        },
      ],
    });
    assert.equal(lines[0]!.acceptedQuantity, 50);
    assert.equal(lines[0]!.excessQuantity, 30);
    assert.equal(lines[0]!.lineStatus, "EXTRA");
    assert.equal(totals.excessUnits, 30);
  });

  it("subtracts previously received when capping outstanding", () => {
    const { lines } = reconcilePowerReceipt({
      poLines: [poLine({ poQuantity: 100, receivedQuantity: 60 })],
      deliveries: [
        {
          lensType: "SINGLE_VISION",
          lensId: "lens-a",
          deliveredQuantity: 50,
        },
      ],
    });
    assert.equal(lines[0]!.outstandingBefore, 40);
    assert.equal(lines[0]!.acceptedQuantity, 40);
    assert.equal(lines[0]!.excessQuantity, 10);
    assert.equal(lines[0]!.previouslyReceived, 60);
  });

  it("does not accept damaged quantity as stock", () => {
    const { lines, totals } = reconcilePowerReceipt({
      poLines: [poLine({ poQuantity: 50 })],
      deliveries: [
        {
          lensType: "SINGLE_VISION",
          lensId: "lens-a",
          deliveredQuantity: 50,
          damagedQuantity: 10,
        },
      ],
    });
    assert.equal(lines[0]!.acceptedQuantity, 40);
    assert.equal(lines[0]!.damagedQuantity, 10);
    assert.equal(totals.acceptedUnits, 40);
    assert.equal(totals.damagedUnits, 10);
  });

  it("marks unknown powers as INVALID with zero accepted", () => {
    const { lines, totals } = reconcilePowerReceipt({
      poLines: [poLine()],
      deliveries: [
        {
          lensType: "SINGLE_VISION",
          lensId: "unknown-power",
          deliveredQuantity: 5,
        },
      ],
    });
    const invalid = lines.find((l) => l.lensId === "unknown-power");
    assert.ok(invalid);
    assert.equal(invalid!.lineStatus, "INVALID");
    assert.equal(invalid!.acceptedQuantity, 0);
    assert.equal(totals.invalidRows, 1);
  });

  it("sums duplicate Excel rows for the same power", () => {
    const { lines, totals } = reconcilePowerReceipt({
      poLines: [poLine({ poQuantity: 100 })],
      deliveries: [
        {
          lensType: "SINGLE_VISION",
          lensId: "lens-a",
          deliveredQuantity: 30,
        },
        {
          lensType: "SINGLE_VISION",
          lensId: "lens-a",
          deliveredQuantity: 20,
        },
      ],
    });
    assert.equal(lines[0]!.deliveredQuantity, 50);
    assert.equal(lines[0]!.acceptedQuantity, 50);
    assert.ok(
      lines[0]!.warnings.some((w) => w.toLowerCase().includes("duplicate"))
    );
    assert.equal(totals.acceptedUnits, 50);
  });

  it("leaves undelivered outstanding powers as SHORT pending", () => {
    const { lines } = reconcilePowerReceipt({
      poLines: [
        poLine({ id: "l1", lensId: "a", poQuantity: 10 }),
        poLine({ id: "l2", lensId: "b", poQuantity: 20 }),
      ],
      deliveries: [
        {
          lensType: "SINGLE_VISION",
          lensId: "a",
          deliveredQuantity: 10,
        },
      ],
    });
    const pending = lines.find((l) => l.lensId === "b");
    assert.ok(pending);
    assert.equal(pending!.deliveredQuantity, 0);
    assert.equal(pending!.shortQuantity, 20);
    assert.equal(pending!.lineStatus, "SHORT");
  });

  it("MARK_DAMAGED rejects all good units from stock", () => {
    const { lines } = reconcilePowerReceipt({
      poLines: [poLine({ poQuantity: 40 })],
      deliveries: [
        {
          lensType: "SINGLE_VISION",
          lensId: "lens-a",
          deliveredQuantity: 40,
        },
      ],
      actions: { "SINGLE_VISION::lens-a": "MARK_DAMAGED" },
    });
    assert.equal(lines[0]!.acceptedQuantity, 0);
    assert.equal(lines[0]!.shortQuantity, 40);
  });
});

describe("reconcileBillRanges", () => {
  it("matches bill vs excel by product/range", () => {
    const rows = reconcileBillRanges({
      billRows: [{ productLabel: "SV Blue", rangeLabel: "1.56", billQuantity: 100 }],
      excelByRange: [
        { productLabel: "SV Blue", rangeLabel: "1.56", quantity: 100 },
      ],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.status, "MATCHED");
    assert.equal(rows[0]!.difference, 0);
  });

  it("highlights range-wise mismatches", () => {
    const rows = reconcileBillRanges({
      billRows: [{ productLabel: "SV Blue", rangeLabel: "1.56", billQuantity: 100 }],
      excelByRange: [
        { productLabel: "SV Blue", rangeLabel: "1.56", quantity: 80 },
      ],
    });
    assert.equal(rows[0]!.status, "MISMATCH");
    assert.equal(rows[0]!.difference, -20);
  });
});

describe("nextPoStatusAfterReceipt", () => {
  it("stays OPEN when nothing received yet", () => {
    assert.equal(
      nextPoStatusAfterReceipt([
        { poQuantity: 10, receivedQuantity: 0, cancelledQuantity: 0 },
      ]),
      "OPEN"
    );
  });

  it("becomes PARTIALLY_RECEIVED after first partial receipt", () => {
    assert.equal(
      nextPoStatusAfterReceipt([
        { poQuantity: 100, receivedQuantity: 40, cancelledQuantity: 0 },
      ]),
      "PARTIALLY_RECEIVED"
    );
  });

  it("closes when fully received", () => {
    assert.equal(
      nextPoStatusAfterReceipt([
        { poQuantity: 50, receivedQuantity: 50, cancelledQuantity: 0 },
      ]),
      "CLOSED"
    );
  });

  it("closes when remaining outstanding is cancelled", () => {
    assert.equal(
      nextPoStatusAfterReceipt([
        { poQuantity: 50, receivedQuantity: 20, cancelledQuantity: 30 },
      ]),
      "CLOSED"
    );
  });
});

describe("close outstanding allocation reversals", () => {
  it("plans FIFO partial reversals", () => {
    const plan = planAllocationReversals(
      [
        { id: "a1", quantity: 30, reversedQuantity: 0 },
        { id: "a2", quantity: 40, reversedQuantity: 10 },
      ],
      45
    );
    assert.deepEqual(plan, [
      { id: "a1", reverseBy: 30 },
      { id: "a2", reverseBy: 15 },
    ]);
  });

  it("ignores fully reversed rows", () => {
    assert.equal(allocationActiveQuantity({ quantity: 20, reversedQuantity: 20 }), 0);
    const plan = planAllocationReversals(
      [{ id: "a1", quantity: 20, reversedQuantity: 20 }],
      10
    );
    assert.deepEqual(plan, []);
  });

  it("validates close reasons", () => {
    assert.equal(isCloseOutstandingReason("SUPPLIER_UNABLE_TO_SUPPLY"), true);
    assert.equal(isCloseOutstandingReason("NOPE"), false);
  });
});

describe("confirm receipt idempotency contract (pure)", () => {
  /**
   * Models the claim-confirmationKey-first behavior without touching production DB.
   * Stock posts only when transitioning draft/validated → confirmed once.
   */
  type ReceiptSim = {
    id: string;
    status: "DRAFT" | "VALIDATED" | "CONFIRMED";
    confirmationKey: string | null;
    stockPosted: number;
  };

  function attemptConfirm(
    store: Map<string, ReceiptSim>,
    keys: Map<string, string>,
    receiptId: string,
    confirmationKey: string,
    acceptedUnits: number
  ): { ok: boolean; stockDelta: number; status: string } {
    const byKey = [...store.values()].find(
      (r) => r.confirmationKey === confirmationKey
    );
    if (byKey && byKey.id !== receiptId) {
      return { ok: false, stockDelta: 0, status: byKey.status };
    }
    if (byKey && byKey.status === "CONFIRMED") {
      return { ok: true, stockDelta: 0, status: "CONFIRMED" };
    }
    const receipt = store.get(receiptId);
    if (!receipt) return { ok: false, stockDelta: 0, status: "MISSING" };
    if (receipt.status === "CONFIRMED") {
      return { ok: true, stockDelta: 0, status: "CONFIRMED" };
    }
    if (keys.has(confirmationKey) && keys.get(confirmationKey) !== receiptId) {
      return { ok: false, stockDelta: 0, status: receipt.status };
    }
    keys.set(confirmationKey, receiptId);
    receipt.confirmationKey = confirmationKey;
    receipt.status = "CONFIRMED";
    receipt.stockPosted += acceptedUnits;
    return { ok: true, stockDelta: acceptedUnits, status: "CONFIRMED" };
  }

  it("posts stock exactly once for the same confirmationKey", () => {
    const store = new Map<string, ReceiptSim>([
      [
        "grn1",
        {
          id: "grn1",
          status: "VALIDATED",
          confirmationKey: null,
          stockPosted: 0,
        },
      ],
    ]);
    const keys = new Map<string, string>();
    const first = attemptConfirm(store, keys, "grn1", "key-1", 25);
    const second = attemptConfirm(store, keys, "grn1", "key-1", 25);
    assert.equal(first.stockDelta, 25);
    assert.equal(second.stockDelta, 0);
    assert.equal(store.get("grn1")!.stockPosted, 25);
  });

  it("rejects confirmationKey reuse on a different receipt", () => {
    const store = new Map<string, ReceiptSim>([
      [
        "grn1",
        {
          id: "grn1",
          status: "CONFIRMED",
          confirmationKey: "key-1",
          stockPosted: 10,
        },
      ],
      [
        "grn2",
        {
          id: "grn2",
          status: "VALIDATED",
          confirmationKey: null,
          stockPosted: 0,
        },
      ],
    ]);
    const keys = new Map([["key-1", "grn1"]]);
    const result = attemptConfirm(store, keys, "grn2", "key-1", 5);
    assert.equal(result.ok, false);
    assert.equal(store.get("grn2")!.stockPosted, 0);
  });
});
