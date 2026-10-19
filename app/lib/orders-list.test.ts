/**
 * Regression: orders list lens selects must only use fields that exist on each
 * Prisma lens model (shared selects caused GET /api/orders 500s).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import {
  ordersListInclude,
  ordersListKryptokLensSelect,
  ordersListProgressiveLensSelect,
  ordersListSvLensSelect,
} from "./orders-list";

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
