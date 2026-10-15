import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OrderSource } from "@prisma/client";
import {
  buildOnBehalfActivityMessage,
  formatPlacedByAdminBadge,
  hasKnownOrderSource,
  isAdminPanelOrder,
  resolveOrderAttribution,
  stripClientOrderAttribution,
} from "./order-attribution";

describe("resolveOrderAttribution (RW-10)", () => {
  it("attributes customer self-checkout without placer", () => {
    assert.deepEqual(
      resolveOrderAttribution({
        session: { role: "CUSTOMER", userId: "cust-1" },
        customerUserId: "cust-1",
      }),
      { orderSource: OrderSource.CUSTOMER_APP, placedByUserId: null }
    );
  });

  it("attributes admin on-behalf to ADMIN_PANEL with session placer", () => {
    assert.deepEqual(
      resolveOrderAttribution({
        session: { role: "ADMIN", userId: "admin-1" },
        customerUserId: "cust-1",
      }),
      { orderSource: OrderSource.ADMIN_PANEL, placedByUserId: "admin-1" }
    );
  });

  it("attributes employee on-behalf separately from admin panel", () => {
    assert.deepEqual(
      resolveOrderAttribution({
        session: { role: "EMPLOYEE", userId: "emp-1" },
        customerUserId: "cust-1",
      }),
      { orderSource: OrderSource.EMPLOYEE_ON_BEHALF, placedByUserId: "emp-1" }
    );
  });

  it("never uses a different actor than the session user", () => {
    const result = resolveOrderAttribution({
      session: { role: "ADMIN", userId: "admin-real" },
      customerUserId: "cust-1",
    });
    assert.equal(result.placedByUserId, "admin-real");
    assert.notEqual(result.placedByUserId, "admin-spoof");
  });

  it("keeps Order.userId conceptually as customer (customer id ≠ placer)", () => {
    const customerId = "cust-owner";
    const adminId = "admin-actor";
    const attr = resolveOrderAttribution({
      session: { role: "ADMIN", userId: adminId },
      customerUserId: customerId,
    });
    assert.equal(customerId, "cust-owner");
    assert.equal(attr.placedByUserId, adminId);
    assert.notEqual(attr.placedByUserId, customerId);
  });
});

describe("stripClientOrderAttribution", () => {
  it("removes client-supplied attribution fields", () => {
    const cleaned = stripClientOrderAttribution({
      userId: "cust-1",
      lensId: "lens-1",
      placedByUserId: "spoof-admin",
      orderSource: "ADMIN_PANEL",
      placedBy: { id: "spoof" },
      quantity: 2,
    });
    assert.equal("placedByUserId" in cleaned, false);
    assert.equal("orderSource" in cleaned, false);
    assert.equal("placedBy" in cleaned, false);
    assert.equal(cleaned.userId, "cust-1");
    assert.equal(cleaned.quantity, 2);
  });
});

describe("display helpers", () => {
  it("shows admin badge only for ADMIN_PANEL", () => {
    assert.equal(
      formatPlacedByAdminBadge({
        orderSource: OrderSource.ADMIN_PANEL,
        placedBy: { name: "Ada Admin" },
      }),
      "Placed by admin · Ada Admin"
    );
    assert.equal(
      formatPlacedByAdminBadge({
        orderSource: OrderSource.EMPLOYEE_ON_BEHALF,
        placedBy: { name: "Ed Employee" },
      }),
      null
    );
    assert.equal(
      formatPlacedByAdminBadge({ orderSource: null, placedBy: null }),
      null
    );
  });

  it("does not invent labels for legacy null source", () => {
    assert.equal(hasKnownOrderSource({ orderSource: null }), false);
    assert.equal(isAdminPanelOrder({ orderSource: null }), false);
    assert.equal(isAdminPanelOrder({ orderSource: undefined }), false);
  });

  it("builds on-behalf activity message for admins", () => {
    const msg = buildOnBehalfActivityMessage({
      orderNumber: 42,
      orderId: "ord-abcdef",
      customerLabel: "Acme Optics",
      sessionRole: "ADMIN",
      actorLabel: "Ada",
    });
    assert.match(msg, /on behalf of Acme Optics/);
    assert.match(msg, /by admin Ada/);
  });
});
