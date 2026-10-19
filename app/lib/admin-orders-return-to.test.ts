import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOrderDetailHref,
  buildOrdersReturnTo,
  resolveOrdersBackHref,
  sanitizeOrdersReturnTo,
} from "./admin-orders";

describe("orders returnTo helpers", () => {
  it("sanitizeOrdersReturnTo keeps filtered /orders list paths", () => {
    assert.equal(
      sanitizeOrdersReturnTo(
        "/orders?status=PENDING&lineType=RETAIL&assigneeId=u2&dateFrom=2026-04-08"
      ),
      "/orders?status=PENDING&lineType=RETAIL&assigneeId=u2&dateFrom=2026-04-08"
    );
  });

  it("sanitizeOrdersReturnTo keeps overview path + group params", () => {
    assert.equal(
      sanitizeOrdersReturnTo("/orders/overview?status=PENDING&group=customer"),
      "/orders/overview?status=PENDING&group=customer"
    );
  });

  it("sanitizeOrdersReturnTo falls back for unsafe values", () => {
    assert.equal(sanitizeOrdersReturnTo(null), "/orders");
    assert.equal(sanitizeOrdersReturnTo(""), "/orders");
    assert.equal(sanitizeOrdersReturnTo("https://evil.example/orders"), "/orders");
    assert.equal(sanitizeOrdersReturnTo("//evil.example/orders"), "/orders");
    assert.equal(sanitizeOrdersReturnTo("/clients"), "/orders");
    assert.equal(sanitizeOrdersReturnTo("/orders/../clients"), "/orders");
  });

  it("buildOrdersReturnTo snapshots pathname + search", () => {
    const params = new URLSearchParams({
      status: "PENDING",
      lineType: "RETAIL",
      assigneeId: "test2",
      dateFrom: "2026-04-08",
    });
    assert.equal(
      buildOrdersReturnTo("/orders", params),
      "/orders?status=PENDING&lineType=RETAIL&assigneeId=test2&dateFrom=2026-04-08"
    );
    assert.equal(
      buildOrdersReturnTo("/orders/overview", "group=customer&status=PENDING"),
      "/orders/overview?group=customer&status=PENDING"
    );
  });

  it("buildOrderDetailHref embeds returnTo and optional hash", () => {
    assert.equal(
      buildOrderDetailHref("ord_1", {
        returnTo:
          "/orders?status=PENDING&lineType=RETAIL&assigneeId=test2&dateFrom=2026-04-08",
      }),
      "/orders/ord_1?returnTo=%2Forders%3Fstatus%3DPENDING%26lineType%3DRETAIL%26assigneeId%3Dtest2%26dateFrom%3D2026-04-08"
    );
    assert.equal(
      buildOrderDetailHref("ord_1", {
        returnTo: "/orders/overview?status=PENDING",
        hash: "create-return-on-behalf",
      }),
      "/orders/ord_1?returnTo=%2Forders%2Foverview%3Fstatus%3DPENDING#create-return-on-behalf"
    );
  });

  it("resolveOrdersBackHref restores filters; missing returnTo falls back", () => {
    const withReturn = new URLSearchParams({
      returnTo:
        "/orders?status=PENDING&lineType=RETAIL&assigneeId=test2&dateFrom=2026-04-08",
    });
    assert.equal(
      resolveOrdersBackHref(withReturn),
      "/orders?status=PENDING&lineType=RETAIL&assigneeId=test2&dateFrom=2026-04-08"
    );

    assert.equal(resolveOrdersBackHref(new URLSearchParams()), "/orders");
    assert.equal(
      resolveOrdersBackHref(new URLSearchParams({ returnTo: "/clients" })),
      "/orders"
    );
  });
});
