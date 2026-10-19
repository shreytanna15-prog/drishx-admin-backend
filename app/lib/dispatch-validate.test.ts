import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertDispatchReadiness,
  validateCourierName,
  validateTrackingNumber,
} from "./dispatch-validate";

const readyBase = {
  order: {
    quantity: 4,
    reservedQuantity: 2,
    pickedQuantity: 2,
    deliveryServiceId: "svc-1",
  },
  delivery: {
    deliveryServiceId: "svc-1",
    actualWeight: 1.25,
  },
};

describe("dispatch-validate", () => {
  it("courier name is required", () => {
    assert.equal(validateCourierName(undefined).ok, false);
    assert.equal(validateCourierName("").ok, false);
    assert.equal(validateCourierName("   ").ok, false);
    assert.equal(validateCourierName(123).ok, false);
  });

  it("courier name trims and caps length", () => {
    const ok = validateCourierName("  Sri Raj Courier  ");
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.value, "Sri Raj Courier");

    const tooLong = validateCourierName("x".repeat(121));
    assert.equal(tooLong.ok, false);
  });

  it("accepts a realistic AWB number", () => {
    const ok = validateTrackingNumber("SRE1234567890");
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.value, "SRE1234567890");
  });

  it("accepts tracking with - _ / . : characters", () => {
    const ok = validateTrackingNumber("SRD-789_/001:2");
    assert.equal(ok.ok, true);
  });

  it("rejects empty and too-short tracking", () => {
    assert.equal(validateTrackingNumber("").ok, false);
    assert.equal(validateTrackingNumber("  ").ok, false);
    assert.equal(validateTrackingNumber("abc").ok, false);
  });

  it("rejects junk / placeholder tracking", () => {
    assert.equal(validateTrackingNumber("test").ok, false);
    assert.equal(validateTrackingNumber("NONE").ok, false);
    assert.equal(validateTrackingNumber("nnnn").ok, false);
    assert.equal(validateTrackingNumber("xxxx").ok, false);
  });

  it("rejects tracking with forbidden characters", () => {
    assert.equal(validateTrackingNumber("SR#12345").ok, false);
    assert.equal(validateTrackingNumber("hello world").ok, false);
    assert.equal(validateTrackingNumber("AB%^&*").ok, false);
  });

  it("caps tracking length", () => {
    const tooLong = validateTrackingNumber("A".repeat(201));
    assert.equal(tooLong.ok, false);
    const atLimit = validateTrackingNumber("AB".repeat(100));
    assert.equal(atLimit.ok, true);
  });
});

describe("assertDispatchReadiness", () => {
  it("accepts a packed order with service, weight, and partial pick", () => {
    const result = assertDispatchReadiness(readyBase);
    assert.equal(result.ok, true);
  });

  it("does not require picked quantity to equal ordered quantity", () => {
    const result = assertDispatchReadiness({
      ...readyBase,
      order: {
        ...readyBase.order,
        quantity: 10,
        reservedQuantity: 3,
        pickedQuantity: 3,
      },
    });
    assert.equal(result.ok, true);
  });

  it("rejects missing delivery service on order and delivery", () => {
    const result = assertDispatchReadiness({
      order: { ...readyBase.order, deliveryServiceId: null },
      delivery: { deliveryServiceId: null, actualWeight: 1 },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /delivery service/i);
    }
  });

  it("accepts service from OrderDelivery when order.deliveryServiceId is null", () => {
    const result = assertDispatchReadiness({
      order: { ...readyBase.order, deliveryServiceId: null },
      delivery: { deliveryServiceId: "svc-legacy", actualWeight: 0.8 },
    });
    assert.equal(result.ok, true);
  });

  it("rejects clearing service via next overlay", () => {
    const result = assertDispatchReadiness({
      ...readyBase,
      next: { deliveryServiceId: null },
    });
    assert.equal(result.ok, false);
  });

  it("accepts next overlay that supplies service and weight when delivery is null", () => {
    const result = assertDispatchReadiness({
      order: {
        quantity: 2,
        reservedQuantity: 2,
        pickedQuantity: 2,
        deliveryServiceId: null,
      },
      delivery: null,
      next: { deliveryServiceId: "svc-new", actualWeight: 1.1 },
    });
    assert.equal(result.ok, true);
  });

  it("rejects missing or non-positive packed weight", () => {
    assert.equal(
      assertDispatchReadiness({
        order: readyBase.order,
        delivery: null,
      }).ok,
      false
    );
    assert.equal(
      assertDispatchReadiness({
        ...readyBase,
        delivery: { deliveryServiceId: "svc-1", actualWeight: 0 },
      }).ok,
      false
    );
    assert.equal(
      assertDispatchReadiness({
        ...readyBase,
        next: { actualWeight: -1 },
      }).ok,
      false
    );
  });

  it("rejects picked quantity below 1", () => {
    const result = assertDispatchReadiness({
      ...readyBase,
      order: { ...readyBase.order, pickedQuantity: 0 },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /picked/i);
    }
  });

  it("rejects picked quantity above ordered quantity", () => {
    const result = assertDispatchReadiness({
      ...readyBase,
      order: { ...readyBase.order, quantity: 2, pickedQuantity: 3 },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /cannot exceed/i);
    }
  });

  it("uses next.pickedQuantity when provided", () => {
    const bad = assertDispatchReadiness({
      ...readyBase,
      order: { ...readyBase.order, pickedQuantity: 0 },
      next: { pickedQuantity: 0 },
    });
    assert.equal(bad.ok, false);

    const good = assertDispatchReadiness({
      ...readyBase,
      order: { ...readyBase.order, pickedQuantity: 0 },
      next: { pickedQuantity: 1 },
    });
    assert.equal(good.ok, true);
  });
});

describe("dispatch readiness route contracts", () => {
  it("PUT /api/orders/:id gates dispatch with assertDispatchReadiness", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/orders/[id]/route.ts"),
      "utf8"
    );
    assert.match(src, /assertDispatchReadiness/);
    assert.match(src, /resolveActiveDeliveryService/);
    assert.match(
      src,
      /Cannot remove the delivery service from a dispatched order/
    );
    // Courier / cutoff gates remain for the dispatch transition.
    assert.match(src, /validateCourierName/);
    assert.match(src, /validateTrackingNumber/);
    assert.match(src, /assertDispatchAllowed/);
    assert.match(src, /const dispatching = status === "DISPATCHED"/);
  });

  it("POST /api/orders/:id/dispatch gates status change with assertDispatchReadiness", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/orders/[id]/dispatch/route.ts"),
      "utf8"
    );
    assert.match(src, /assertDispatchReadiness/);
    assert.match(src, /resolveActiveDeliveryService/);
    assert.match(src, /validateCourierName/);
    assert.match(src, /validateTrackingNumber/);
    assert.match(src, /assertDispatchAllowed/);
    // Historical courier correction on already-dispatched orders skips readiness.
    assert.match(src, /if \(statusChanged\)/);
    assert.match(src, /alreadyDispatched/);
  });
});
