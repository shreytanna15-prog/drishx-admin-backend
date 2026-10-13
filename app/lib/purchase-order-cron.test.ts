import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("stock-reorder cron — manual demand only (RW-08)", () => {
  it("does not create procurement requests automatically", () => {
    const source = readFileSync(
      join(process.cwd(), "app/api/cron/stock-reorder/route.ts"),
      "utf8"
    );
    assert.match(source, /disabled:\s*true/);
    assert.equal(source.includes("createProcurementRequestFromRule"), false);
    assert.equal(source.includes("runReorderCheck"), false);
    assert.match(source, /Run Reorder/);
  });
});
