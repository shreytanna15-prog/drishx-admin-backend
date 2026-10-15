import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessReadyStockOrder,
  assessWholesaleAllocation,
  isRetailFullyReserved,
  selectReadyStockOrders,
  type ReadyStockOrderInput,
} from "./ready-stock-format";

function base(
  partial: Partial<ReadyStockOrderInput> &
    Pick<ReadyStockOrderInput, "id" | "status" | "quantity" | "reservedQuantity">
): ReadyStockOrderInput {
  return {
    orderNumber: 1,
    lineType: "RETAIL",
    notes: null,
    orderImageUrl: null,
    warehouseHold: false,
    warehouseReleasedAt: null,
    totalAmount: 100,
    createdAt: new Date("2026-10-01T10:00:00.000Z"),
    customer: "Shop",
    wholesaleLines: null,
    ...partial,
  };
}

describe("ready stock eligibility", () => {
  it("requires full retail reservation, not aggregate stock", () => {
    assert.equal(isRetailFullyReserved(10, 10), true);
    assert.equal(isRetailFullyReserved(10, 9.999), false);
    assert.equal(isRetailFullyReserved(0, 0), false);
  });

  it("excludes RX and photo prescription orders", () => {
    const rx = assessReadyStockOrder(
      base({
        id: "rx",
        status: "PACKED",
        quantity: 2,
        reservedQuantity: 2,
        notes: "[RX Order]\nOD -1.00",
      })
    );
    assert.equal(rx.ready, false);
    assert.equal(rx.reason, "RX_ORDER");

    const photo = assessReadyStockOrder(
      base({
        id: "photo",
        status: "PACKED",
        quantity: 2,
        reservedQuantity: 2,
        orderImageUrl: "https://example.com/rx.jpg",
      })
    );
    assert.equal(photo.ready, false);
    assert.equal(photo.reason, "PHOTO_PRESCRIPTION");
  });

  it("excludes cancelled, dispatched, awaiting procurement, and partials", () => {
    assert.equal(
      assessReadyStockOrder(
        base({ id: "c", status: "CANCELLED", quantity: 1, reservedQuantity: 1 })
      ).reason,
      "CANCELLED"
    );
    assert.equal(
      assessReadyStockOrder(
        base({
          id: "d",
          status: "DISPATCHED",
          quantity: 1,
          reservedQuantity: 1,
        })
      ).reason,
      "DISPATCHED"
    );
    assert.equal(
      assessReadyStockOrder(
        base({
          id: "a",
          status: "AWAITING_PROCUREMENT",
          quantity: 2,
          reservedQuantity: 1,
        })
      ).reason,
      "AWAITING_PROCUREMENT"
    );
  });

  it("distinguishes packed dispatch-eligible from allocated-not-packed", () => {
    const packed = assessReadyStockOrder(
      base({ id: "p", status: "PACKED", quantity: 4, reservedQuantity: 4 })
    );
    assert.equal(packed.ready, true);
    assert.equal(packed.dispatchState, "DISPATCH_ELIGIBLE");

    const pending = assessReadyStockOrder(
      base({ id: "n", status: "PENDING", quantity: 4, reservedQuantity: 4 })
    );
    assert.equal(pending.ready, true);
    assert.equal(pending.dispatchState, "ALLOCATED_NOT_PACKED");

    const short = assessReadyStockOrder(
      base({ id: "s", status: "PENDING", quantity: 4, reservedQuantity: 2 })
    );
    assert.equal(short.ready, false);
    assert.equal(short.reason, "NOT_FULLY_RESERVED");
  });

  it("requires every wholesale line reserved without procurement", () => {
    assert.equal(
      assessWholesaleAllocation([
        { quantity: 2, reservedQuantity: 2, needsProcurement: false },
        { quantity: 1, reservedQuantity: 1, needsProcurement: true },
      ]).reason,
      "WHOLESALE_NEEDS_PROCUREMENT"
    );
    assert.equal(
      assessWholesaleAllocation([
        { quantity: 2, reservedQuantity: 1, needsProcurement: false },
      ]).reason,
      "NOT_FULLY_RESERVED"
    );
    assert.equal(assessWholesaleAllocation(null).reason, "WHOLESALE_LINES_MISSING");

    const ready = assessReadyStockOrder(
      base({
        id: "w",
        status: "PICKING",
        lineType: "WHOLESALE",
        quantity: 3,
        reservedQuantity: 3,
        wholesaleLines: [
          { quantity: 2, reservedQuantity: 2, needsProcurement: false },
          { quantity: 1, reservedQuantity: 1, needsProcurement: false },
        ],
      })
    );
    assert.equal(ready.ready, true);
  });

  it("selects only ready rows and excludes returns/cancellations path", () => {
    const selected = selectReadyStockOrders([
      base({ id: "ok", status: "PACKED", quantity: 1, reservedQuantity: 1 }),
      base({
        id: "bad",
        status: "PENDING",
        quantity: 2,
        reservedQuantity: 0,
      }),
    ]);
    assert.deepEqual(
      selected.map((r) => r.id),
      ["ok"]
    );
  });
});
