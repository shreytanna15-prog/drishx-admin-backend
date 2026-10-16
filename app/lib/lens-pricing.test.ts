import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  invoiceLineFromPairPrice,
  orderTotalFromPairPrice,
  PIECES_PER_PAIR,
} from "./lens-pricing";

describe("orderTotalFromPairPrice", () => {
  it("six pieces at ₹86/pair → ₹258", () => {
    assert.equal(orderTotalFromPairPrice(86, 6), 258);
  });

  it("two pieces at ₹86/pair → ₹86", () => {
    assert.equal(orderTotalFromPairPrice(86, 2), 86);
  });

  it("one piece is half a pair", () => {
    assert.equal(orderTotalFromPairPrice(86, 1), 43);
  });

  it("rejects non-positive quantities", () => {
    assert.equal(orderTotalFromPairPrice(86, 0), 0);
    assert.equal(orderTotalFromPairPrice(86, -2), 0);
  });
});

describe("invoiceLineFromPairPrice", () => {
  it("keeps piece quantity and reconciles qty × unitPrice to pair gross", () => {
    const line = invoiceLineFromPairPrice(86, 6);
    assert.equal(line.quantity, 6);
    assert.equal(line.lineGross, 258);
    assert.equal(line.unitPrice * line.quantity, 258);
    assert.equal(line.unitPrice, 86 / PIECES_PER_PAIR);
  });

  it("two pieces → per-piece rate equals pair price / 2", () => {
    const line = invoiceLineFromPairPrice(86, 2);
    assert.equal(line.quantity, 2);
    assert.equal(line.lineGross, 86);
    assert.equal(line.unitPrice * line.quantity, 86);
  });
});
