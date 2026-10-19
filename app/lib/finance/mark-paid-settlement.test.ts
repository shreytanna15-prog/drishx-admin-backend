import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveMarkPaidInvoiceSettlement } from "./mark-paid-settlement";

describe("resolveMarkPaidInvoiceSettlement (C9)", () => {
  it("allows zero-value markPaid without inventing amountPaid", () => {
    const result = resolveMarkPaidInvoiceSettlement({
      markPaid: true,
      grandTotal: 0,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.status, "PAID");
    assert.equal(result.amountPaid, 0);
    assert.equal(result.amountOutstanding, 0);
  });

  it("rejects nonzero markPaid (no invented payment)", () => {
    const result = resolveMarkPaidInvoiceSettlement({
      markPaid: true,
      grandTotal: 500,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /payment|Finance|markPaid/i);
    }
  });

  it("issues unpaid invoice when markPaid is false", () => {
    const result = resolveMarkPaidInvoiceSettlement({
      markPaid: false,
      grandTotal: 210,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.status, "ISSUED");
    assert.equal(result.amountPaid, 0);
    assert.equal(result.amountOutstanding, 210);
  });

  it("treats tiny floating totals as zero for replacement invoices", () => {
    const result = resolveMarkPaidInvoiceSettlement({
      markPaid: true,
      grandTotal: 0.004,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.status, "PAID");
    assert.equal(result.amountPaid, 0);
  });
});

describe("markPaid caller contracts (C9)", () => {
  it("order create / place-order / wholesale no longer pass COMPLETED→markPaid", () => {
    const place = readFileSync(
      join(process.cwd(), "app/lib/place-order.ts"),
      "utf8"
    );
    const ordersRoute = readFileSync(
      join(process.cwd(), "app/api/orders/route.ts"),
      "utf8"
    );
    const wholesale = readFileSync(
      join(process.cwd(), "app/lib/wholesale-checkout-batch.ts"),
      "utf8"
    );
    assert.equal(
      /markPaid:\s*newOrder\.status\s*===\s*OrderStatus\.COMPLETED/.test(place),
      false
    );
    assert.equal(
      /markPaid:\s*newOrder\.status\s*===\s*OrderStatus\.COMPLETED/.test(
        ordersRoute
      ),
      false
    );
    assert.equal(
      /markPaid:\s*newOrder\.status\s*===\s*OrderStatus\.COMPLETED/.test(
        wholesale
      ),
      false
    );
  });

  it("replacement orders still request markPaid (zero-value path)", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/returns/[id]/decision/route.ts"),
      "utf8"
    );
    assert.match(src, /markPaid:\s*true/);
    assert.match(src, /unitPrice:\s*0/);
    assert.match(src, /totalAmount:\s*0/);
  });

  it("createInvoiceFromOrder enforces resolveMarkPaidInvoiceSettlement", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/finance/create-invoice-from-order.ts"),
      "utf8"
    );
    assert.match(src, /resolveMarkPaidInvoiceSettlement/);
    assert.match(src, /MarkPaidWithoutSettlementError/);
    assert.match(src, /from "\.\/mark-paid-settlement"/);
    assert.equal(
      /amountPaid\s*=\s*input\.markPaid\s*\?\s*totals\.grandTotal/.test(src),
      false
    );
  });
});
