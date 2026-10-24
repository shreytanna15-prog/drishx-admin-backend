/**
 * Regression: orders list lens selects must only use fields that exist on each
 * Prisma lens model (shared selects caused GET /api/orders 500s).
 *
 * Also: catalog/RETAIL scopes must be SQL NULL-safe for notes=null
 * (NOT(contains) drops NULL notes under three-valued logic — ORD238170).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import type { Prisma as PrismaTypes } from "@prisma/client";
import {
  buildOrdersListWhere,
  catalogWhere,
  classifyOrdersListScope,
  notesDoesNotContainMarker,
  ordersListInclude,
  ordersListKryptokLensSelect,
  ordersListProgressiveLensSelect,
  ordersListSvLensSelect,
  rxLabWhere,
  type OrdersListScopeFields,
} from "./orders-list";
import {
  COLOR_LENS_NOTES_MARKER,
} from "./prescription-order-hold";
import { RX_ORDER_NOTES_MARKER } from "./reports/rx-marker";

function modelFieldNames(modelName: string): Set<string> {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
  assert.ok(model, `Prisma model missing: ${modelName}`);
  return new Set(model.fields.map((f) => f.name));
}

function assertSelectKeysSubset(
  select: Record<string, unknown>,
  allowed: Set<string>,
  label: string
) {
  for (const key of Object.keys(select)) {
    assert.ok(
      allowed.has(key),
      `${label}: unknown field "${key}" (not on Prisma model)`
    );
  }
}

describe("orders list lens selects vs Prisma schema", () => {
  it("SV select has no axis/add/eye and only SV fields", () => {
    const fields = modelFieldNames("SingleVisionLens");
    assertSelectKeysSubset(ordersListSvLensSelect, fields, "SV");
    assert.equal("axis" in ordersListSvLensSelect, false);
    assert.equal("add" in ordersListSvLensSelect, false);
    assert.equal("eye" in ordersListSvLensSelect, false);
  });

  it("Kryptok select has no index/eye and only Kryptok fields", () => {
    const fields = modelFieldNames("KryptokLens");
    assertSelectKeysSubset(ordersListKryptokLensSelect, fields, "Kryptok");
    assert.equal("index" in ordersListKryptokLensSelect, false);
    assert.equal("eye" in ordersListKryptokLensSelect, false);
  });

  it("Progressive select has no crossPower and only Progressive fields", () => {
    const fields = modelFieldNames("ProgressiveLens");
    assertSelectKeysSubset(
      ordersListProgressiveLensSelect,
      fields,
      "Progressive"
    );
    assert.equal("crossPower" in ordersListProgressiveLensSelect, false);
  });

  it("ordersListInclude uses per-family selects (not one shared bag)", () => {
    const include = ordersListInclude as {
      singleVisionLens: { select: Record<string, boolean> };
      kryptokLens: { select: Record<string, boolean> };
      progressiveLens: { select: Record<string, boolean> };
    };
    assert.deepEqual(include.singleVisionLens.select, ordersListSvLensSelect);
    assert.deepEqual(include.kryptokLens.select, ordersListKryptokLensSelect);
    assert.deepEqual(
      include.progressiveLens.select,
      ordersListProgressiveLensSelect
    );
  });
});

describe("orders-list dependency isolation", () => {
  it("does not import prisma client (avoids DATABASE_URL in unit tests)", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/orders-list.ts"),
      "utf8"
    );
    assert.equal(src.includes('from "./prisma"'), false);
    assert.equal(src.includes("from './prisma'"), false);
  });
});

describe("notesDoesNotContainMarker", () => {
  it("includes explicit notes: null arm so NULL notes are not UNKNOWN", () => {
    const where = notesDoesNotContainMarker(RX_ORDER_NOTES_MARKER);
    assert.ok(where.OR && Array.isArray(where.OR));
    assert.ok(
      where.OR.some(
        (arm) =>
          arm &&
          typeof arm === "object" &&
          "notes" in arm &&
          arm.notes === null
      ),
      "expected { notes: null } arm"
    );
    assert.ok(
      where.OR.some(
        (arm) =>
          arm &&
          typeof arm === "object" &&
          "NOT" in arm &&
          arm.NOT != null &&
          typeof arm.NOT === "object" &&
          "notes" in arm.NOT
      ),
      "expected NOT contains arm"
    );
  });
});

describe("classifyOrdersListScope", () => {
  const cases: Array<{
    name: string;
    order: OrdersListScopeFields;
    expected: "catalog" | "rx_lab";
  }> = [
    {
      name: "customer catalog order with notes=null (ORD238170)",
      order: {
        warehouseHold: false,
        notes: null,
        orderImageUrl: null,
      },
      expected: "catalog",
    },
    {
      name: "catalog order with plain notes",
      order: {
        warehouseHold: false,
        notes: "Leave at reception",
        orderImageUrl: null,
      },
      expected: "catalog",
    },
    {
      name: "color lens with reference image stays catalog",
      order: {
        warehouseHold: false,
        notes: `${COLOR_LENS_NOTES_MARKER} custom tint`,
        orderImageUrl: "https://cdn.example/ref.jpg",
      },
      expected: "catalog",
    },
    {
      name: "RX notes → rx_lab",
      order: {
        warehouseHold: false,
        notes: `${RX_ORDER_NOTES_MARKER} OD/OS`,
        orderImageUrl: null,
      },
      expected: "rx_lab",
    },
    {
      name: "warehouse hold → rx_lab",
      order: {
        warehouseHold: true,
        notes: null,
        orderImageUrl: null,
      },
      expected: "rx_lab",
    },
    {
      name: "photo prescription (image, null notes) → rx_lab",
      order: {
        warehouseHold: false,
        notes: null,
        orderImageUrl: "https://cdn.example/rx.jpg",
      },
      expected: "rx_lab",
    },
    {
      name: "photo with warehouse hold → rx_lab",
      order: {
        warehouseHold: true,
        notes: null,
        orderImageUrl: "https://cdn.example/rx.jpg",
      },
      expected: "rx_lab",
    },
  ];

  for (const { name, order, expected } of cases) {
    it(name, () => {
      assert.equal(classifyOrdersListScope(order), expected);
    });
  }
});

describe("catalogWhere NULL-safety", () => {
  it("does not wrap rxLabWhere in NOT (SQL NULL trap)", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/orders-list.ts"),
      "utf8"
    );
    assert.equal(
      /catalogWhere\(\)[^{]*\{[^}]*NOT:\s*rxLabWhere/.test(src),
      false,
      "catalogWhere must not use NOT(rxLabWhere())"
    );
    const where = catalogWhere();
    assert.equal("NOT" in where && where.NOT != null, false);
    assert.ok(where.AND && Array.isArray(where.AND));
  });

  it("keeps warehouseHold false and null-safe notes / image arms", () => {
    const where = catalogWhere();
    const parts = where.AND as PrismaTypes.OrderWhereInput[];
    assert.ok(
      parts.some(
        (p) =>
          p &&
          typeof p === "object" &&
          "warehouseHold" in p &&
          p.warehouseHold === false
      )
    );
    const notesSafe = parts.filter(
      (p) => p && typeof p === "object" && "OR" in p && Array.isArray(p.OR)
    );
    assert.ok(
      notesSafe.some((p) =>
        (p.OR as PrismaTypes.OrderWhereInput[]).some(
          (arm) =>
            arm &&
            typeof arm === "object" &&
            "notes" in arm &&
            arm.notes === null
        )
      ),
      "catalogWhere must allow notes: null"
    );
  });
});

describe("rxLabWhere photo arm is NULL-safe", () => {
  it("photo branch uses notesDoesNotContainMarker (not bare NOT contains)", () => {
    const where = rxLabWhere();
    assert.ok(where.OR && Array.isArray(where.OR));
    const photoArm = where.OR.find(
      (arm) =>
        arm &&
        typeof arm === "object" &&
        "AND" in arm &&
        Array.isArray(arm.AND)
    ) as { AND: PrismaTypes.OrderWhereInput[] } | undefined;
    assert.ok(photoArm, "expected photo AND arm");
    const hasNullNotesArm = photoArm.AND.some(
      (p) =>
        p &&
        typeof p === "object" &&
        "OR" in p &&
        Array.isArray(p.OR) &&
        p.OR.some(
          (arm) =>
            arm &&
            typeof arm === "object" &&
            "notes" in arm &&
            arm.notes === null
        )
    );
    assert.ok(hasNullNotesArm, "photo arm must tolerate notes: null");
  });
});

describe("buildOrdersListWhere — catalog / RETAIL scopes", () => {
  const admin = { role: "ADMIN", userId: "admin-1" };

  it("scope=catalog embeds null-safe catalogWhere (not NOT rxLab)", () => {
    const where = buildOrdersListWhere(admin, {
      page: 1,
      limit: 30,
      scope: "catalog",
    });
    const json = JSON.stringify(where);
    assert.match(json, /"notes":null/);
    assert.equal(json.includes('"warehouseHold":false'), true);
  });

  it("scope=catalog + q=238170 still ANDs null-safe catalog (ORD238170 path)", () => {
    const where = buildOrdersListWhere(admin, {
      page: 1,
      limit: 30,
      scope: "catalog",
      q: "238170",
    });
    const and = where.AND as PrismaTypes.OrderWhereInput[];
    assert.ok(Array.isArray(and));
    assert.ok(
      and.some(
        (p) =>
          p &&
          typeof p === "object" &&
          "OR" in p &&
          Array.isArray(p.OR) &&
          p.OR.some(
            (arm) =>
              arm &&
              typeof arm === "object" &&
              "orderNumber" in arm &&
              arm.orderNumber === 238170
          )
      ),
      "expected orderNumber 238170 in q OR"
    );
    assert.ok(
      JSON.stringify(where).includes('"notes":null'),
      "catalog arm must remain null-safe when searching"
    );
  });

  it("orderKind=RETAIL uses null-safe notes filters", () => {
    const where = buildOrdersListWhere(admin, {
      page: 1,
      limit: 30,
      scope: "all",
      orderKind: "RETAIL",
    });
    const json = JSON.stringify(where);
    assert.match(json, /"lineType":"RETAIL"/);
    assert.match(json, /"notes":null/);
    assert.equal(
      /"NOT"\s*:\s*\{\s*"OR"\s*:\s*\[\s*\{\s*"notes"\s*:\s*\{\s*"contains"/.test(
        json
      ),
      false,
      "RETAIL must not use NOT(OR(contains…)) over notes"
    );
  });

  it("CUSTOMER scope has no catalog filter (sees notes=null orders)", () => {
    const where = buildOrdersListWhere(
      { role: "CUSTOMER", userId: "cust-1" },
      { page: 1, limit: 30, scope: "all" }
    );
    assert.deepEqual(where, { userId: "cust-1" });
  });
});
