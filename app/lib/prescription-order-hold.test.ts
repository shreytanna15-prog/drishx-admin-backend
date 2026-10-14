import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessWarehouseRelease,
  employeeMayAccessOrder,
  employeeOrdersWhere,
  isPhotoPrescriptionOrder,
  isPrescriptionHoldCandidate,
  isRxOrderNotes,
  isWarehouseHoldActive,
  shouldNotifyStaffOnEligibilityChange,
  warehouseReleaseCreateFields,
} from "./prescription-order-hold";

describe("prescription order identification", () => {
  it("detects RX notes marker", () => {
    assert.equal(isRxOrderNotes("[RX Order]\nOD -2.00"), true);
    assert.equal(isRxOrderNotes("normal notes"), false);
  });

  it("detects photo prescription vs color / RX", () => {
    assert.equal(
      isPhotoPrescriptionOrder({
        notes: null,
        orderImageUrl: "https://cdn.example/p.jpg",
      }),
      true
    );
    assert.equal(
      isPhotoPrescriptionOrder({
        notes: "[RX Order]",
        orderImageUrl: "https://cdn.example/p.jpg",
      }),
      false
    );
    assert.equal(
      isPhotoPrescriptionOrder({
        notes: "[Color Lens]",
        orderImageUrl: "https://cdn.example/p.jpg",
      }),
      false
    );
    assert.equal(
      isPrescriptionHoldCandidate({
        notes: "[RX Order]",
        orderImageUrl: null,
      }),
      true
    );
  });
});

describe("warehouse hold visibility", () => {
  it("new hold fields default to held", () => {
    const fields = warehouseReleaseCreateFields();
    assert.equal(fields.warehouseHold, true);
    assert.equal(fields.warehouseReleasedAt, null);
    assert.equal(isWarehouseHoldActive(fields), true);
  });

  it("assignment alone does not grant employee access while held", () => {
    assert.equal(
      employeeMayAccessOrder(
        {
          assignedToId: "emp-1",
          warehouseHold: true,
          warehouseReleasedAt: null,
        },
        "emp-1"
      ),
      false
    );
  });

  it("requires both assignment and release for employee access", () => {
    assert.equal(
      employeeMayAccessOrder(
        {
          assignedToId: "emp-1",
          warehouseHold: true,
          warehouseReleasedAt: "2026-10-14T10:00:00.000Z",
        },
        "emp-1"
      ),
      true
    );
    assert.equal(
      employeeMayAccessOrder(
        {
          assignedToId: null,
          warehouseHold: true,
          warehouseReleasedAt: "2026-10-14T10:00:00.000Z",
        },
        "emp-1"
      ),
      false
    );
    assert.equal(
      employeeMayAccessOrder(
        {
          assignedToId: "emp-2",
          warehouseHold: true,
          warehouseReleasedAt: "2026-10-14T10:00:00.000Z",
        },
        "emp-1"
      ),
      false
    );
  });

  it("non-hold orders remain visible when assigned", () => {
    assert.equal(
      employeeMayAccessOrder(
        {
          assignedToId: "emp-1",
          warehouseHold: false,
          warehouseReleasedAt: null,
        },
        "emp-1"
      ),
      true
    );
  });

  it("employee list where requires assignment + not held", () => {
    const where = employeeOrdersWhere("emp-1");
    assert.equal(where.assignedToId, "emp-1");
    assert.ok(Array.isArray(where.OR));
    assert.deepEqual(where.OR, [
      { warehouseHold: false },
      { warehouseReleasedAt: { not: null } },
    ]);
  });
});

describe("release + notify timing", () => {
  it("assesses release eligibility", () => {
    assert.equal(
      assessWarehouseRelease({
        warehouseHold: false,
        warehouseReleasedAt: null,
        assignedToId: null,
      }).reason,
      "NOT_HOLD_ORDER"
    );
    assert.equal(
      assessWarehouseRelease({
        warehouseHold: true,
        warehouseReleasedAt: "2026-10-01",
        assignedToId: "e",
      }).reason,
      "ALREADY_RELEASED"
    );
    assert.equal(
      assessWarehouseRelease({
        warehouseHold: true,
        warehouseReleasedAt: null,
        assignedToId: null,
      }).eligible,
      true
    );
  });

  it("notifies only when eligibility flips true", () => {
    const first = shouldNotifyStaffOnEligibilityChange({
      previouslyEligible: false,
      nowAssignedToId: "emp-1",
      warehouseHold: true,
      warehouseReleasedAt: "2026-10-14",
    });
    assert.equal(first.notify, true);
    assert.equal(first.assigneeId, "emp-1");

    const again = shouldNotifyStaffOnEligibilityChange({
      previouslyEligible: true,
      nowAssignedToId: "emp-1",
      warehouseHold: true,
      warehouseReleasedAt: "2026-10-14",
    });
    assert.equal(again.notify, false);

    const assignWhileHeld = shouldNotifyStaffOnEligibilityChange({
      previouslyEligible: false,
      nowAssignedToId: "emp-1",
      warehouseHold: true,
      warehouseReleasedAt: null,
    });
    assert.equal(assignWhileHeld.notify, false);
  });
});

describe("create routes never auto-assign held orders (structural)", () => {
  it("rx and photo create use warehouse hold fields and skip resolveOrderAssigneeId", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const file of [
      "app/api/orders/rx/route.ts",
      "app/api/orders/photo/route.ts",
    ]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      assert.match(src, /warehouseReleaseCreateFields/);
      assert.equal(src.includes("resolveOrderAssigneeId"), false);
      assert.equal(src.includes("notifyStaffOfNewOrder"), false);
    }
  });

  it("not-available staff mutation enforces warehouse hold gate", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(
        process.cwd(),
        "app/api/orders/[id]/procurement/not-available/route.ts"
      ),
      "utf8"
    );
    assert.match(src, /employeeOrderAccessForbidden/);
    assert.match(src, /loadOrderForEmployeeAccess/);
  });
});
