import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pathMatchesRoute,
  resolveActiveTitle,
} from "./admin-nav-active";

const FALLBACK = [
  { title: "Orders", href: "/orders" },
  { title: "Orders overview", href: "/orders/overview" },
  { title: "Rx Orders", href: "/orders/rx-lab" },
  { title: "Settings", href: "/settings" },
  { title: "Delivery Services", href: "/settings/delivery" },
];

describe("pathMatchesRoute", () => {
  it("matches exact and nested paths without prefix collisions", () => {
    assert.equal(pathMatchesRoute("/orders", "/orders"), true);
    assert.equal(pathMatchesRoute("/orders/abc", "/orders"), true);
    assert.equal(pathMatchesRoute("/orders-extra", "/orders"), false);
    assert.equal(pathMatchesRoute("/orders/overview", "/orders/overview"), true);
  });
});

describe("resolveActiveTitle", () => {
  it("highlights Orders overview instead of Orders", () => {
    assert.equal(resolveActiveTitle("/orders/overview"), "Orders overview");
    assert.equal(resolveActiveTitle("/orders/new"), "Create Order");
    assert.equal(
      resolveActiveTitle("/orders/overview/", FALLBACK),
      "Orders overview"
    );
  });

  it("highlights Orders for list and order detail routes", () => {
    assert.equal(resolveActiveTitle("/orders"), "Orders");
    assert.equal(resolveActiveTitle("/orders/ord_123"), "Orders");
  });

  it("keeps sibling order routes distinct", () => {
    assert.equal(resolveActiveTitle("/orders/rx-lab"), "Rx Orders");
    assert.equal(resolveActiveTitle("/orders/dispatch"), "Dispatch Management");
    assert.equal(resolveActiveTitle("/orders/procurement"), "Procurement");
  });

  it("highlights Reports and other unrelated routes", () => {
    assert.equal(resolveActiveTitle("/reports"), "Reports");
    assert.equal(
      resolveActiveTitle("/reports?report=gst-summary".split("?")[0]!),
      "Reports"
    );
    assert.equal(resolveActiveTitle("/finance/invoices"), "Sales & Invoices");
    assert.equal(resolveActiveTitle("/"), "Dashboard");
  });

  it("highlights Purchase Orders under procurement", () => {
    assert.equal(
      resolveActiveTitle("/procurement/purchase-orders"),
      "Purchase Orders"
    );
    assert.equal(
      resolveActiveTitle("/procurement/purchase-orders/new"),
      "Purchase Orders"
    );
    assert.equal(
      resolveActiveTitle("/procurement/requests"),
      "Procurement Cart"
    );
  });

  it("uses longest href match in the generic fallback", () => {
    assert.equal(
      resolveActiveTitle("/settings/delivery", FALLBACK),
      "Delivery Services"
    );
  });
});

describe("RW-08 Phase C nav entries", () => {
  it("activates Stock Matrix, Suppliers and Reorder Rules", () => {
    assert.equal(resolveActiveTitle("/inventory/stock-matrix"), "Stock Matrix");
    assert.equal(resolveActiveTitle("/procurement/suppliers"), "Suppliers");
    assert.equal(resolveActiveTitle("/inventory/power-wise-stock"), "Power-wise Inventory");
    assert.equal(resolveActiveTitle("/inventory/stock-dashboard"), "Stock Dashboard / Audit");
  });
});

describe("RW-09 product catalog nav", () => {
  it("activates Attributes and Products & catalog", () => {
    assert.equal(resolveActiveTitle("/inventory/attributes"), "Attributes");
    assert.equal(
      resolveActiveTitle("/inventory/products-catalog"),
      "Products & catalog"
    );
    assert.equal(
      resolveActiveTitle("/inventory/products-catalog/new"),
      "Products & catalog"
    );
  });
});
