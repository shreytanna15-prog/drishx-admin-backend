import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import {
  isReceivablePoStatus,
  OPEN_PO_STATUSES_FOR_INCOMING,
  openPurchaseOrderSuppression,
  incomingForPowerState,
} from "./purchase-order-math";
import {
  allocationReversibleQuantity,
  nextPoStatusAfterReceipt,
  planAllocationReceipts,
  planAllocationReversals,
  receiptConfirmBlockers,
  unresolvedRangeMismatches,
  isRangeResolution,
} from "./purchase-order-receive-math";
import {
  buildPoEmailDraft,
  canMarkPoSent,
  isPoSentChannel,
  poDispatchState,
} from "./purchase-order-sent";
import { buildPoImportTemplate, parsePoImportWorkbook } from "./purchase-order-import";
import { formatSupplierAddressLines } from "./purchase-order-supplier";

async function workbook(rows: unknown[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("PO");
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("SENT is distinct from approved/open", () => {
  it("counts SENT as incoming and receivable", () => {
    assert.ok((OPEN_PO_STATUSES_FOR_INCOMING as readonly string[]).includes("SENT"));
    assert.equal(isReceivablePoStatus("SENT"), true);
    assert.equal(isReceivablePoStatus("DRAFT"), false);
    assert.equal(isReceivablePoStatus("PENDING_APPROVAL"), false);
    assert.equal(isReceivablePoStatus("CLOSED"), false);
  });
  it("only an explicit record can mark sent, once", () => {
    assert.equal(canMarkPoSent("OPEN", null), true);
    assert.equal(canMarkPoSent("PARTIALLY_RECEIVED", null), true);
    assert.equal(canMarkPoSent("OPEN", "2026-10-01"), false);
    assert.equal(canMarkPoSent("PENDING_APPROVAL", null), false);
    assert.equal(canMarkPoSent("CANCELLED", null), false);
    assert.equal(poDispatchState("OPEN", null), "NOT_SENT");
    assert.equal(isPoSentChannel("EMAIL"), true);
    assert.equal(isPoSentChannel("SMS_AUTO"), false);
  });
  it("email draft is a mailto link only (no server send) and needs an address", () => {
    const draft = buildPoEmailDraft({
      publicId: "PO-2026-000001",
      supplierName: "ASH Optical",
      supplierEmail: "orders@ash.example",
      contactPerson: "Mr. Rahul",
      buyerName: "DrishX",
      expectedDelivery: "2026-10-20T00:00:00.000Z",
      lineCount: 2,
      totalQuantity: 60,
    });
    assert.ok(draft.mailto?.startsWith("mailto:orders%40ash.example?subject="));
    assert.match(draft.body, /Dear Mr\. Rahul/);
    assert.match(draft.body, /2026-10-20/);
    const none = buildPoEmailDraft({ ...{ publicId: "P", supplierName: "S", supplierEmail: null, buyerName: "D", lineCount: 1, totalQuantity: 1 } });
    assert.equal(none.mailto, null);
  });
  it("receipts keep SENT while nothing has been received", () => {
    const lines = [{ poQuantity: 10, receivedQuantity: 0, cancelledQuantity: 0 }];
    assert.equal(nextPoStatusAfterReceipt(lines, { wasSent: true }), "SENT");
    assert.equal(nextPoStatusAfterReceipt(lines), "OPEN");
    assert.equal(
      nextPoStatusAfterReceipt([{ poQuantity: 10, receivedQuantity: 4, cancelledQuantity: 0 }], { wasSent: true }),
      "PARTIALLY_RECEIVED"
    );
    assert.equal(
      nextPoStatusAfterReceipt([{ poQuantity: 10, receivedQuantity: 4, cancelledQuantity: 6 }], { wasSent: true }),
      "CLOSED"
    );
  });
});

describe("exact allocation receipts and reversals", () => {
  const allocs = [
    { id: "a1", procurementRequestId: "pr1", quantity: 30, reversedQuantity: 0, receivedQuantity: 0 },
    { id: "a2", procurementRequestId: "pr2", quantity: 30, reversedQuantity: 0, receivedQuantity: 0 },
  ];
  it("settles receipts FIFO onto this line's PRs only, never beyond allocation", () => {
    assert.deepEqual(planAllocationReceipts(allocs, 45), [
      { id: "a1", procurementRequestId: "pr1", receiveBy: 30 },
      { id: "a2", procurementRequestId: "pr2", receiveBy: 15 },
    ]);
    // PO qty raised above demand: extra units settle no request.
    assert.equal(planAllocationReceipts(allocs, 80).reduce((s, p) => s + p.receiveBy, 0), 60);
  });
  it("partial receipt (54 of 60) then close outstanding reverses only the 6 unreceived", () => {
    const afterReceipt = [
      { ...allocs[0]!, receivedQuantity: 30 },
      { ...allocs[1]!, receivedQuantity: 24 },
    ];
    assert.equal(allocationReversibleQuantity(afterReceipt[0]!), 0);
    assert.equal(allocationReversibleQuantity(afterReceipt[1]!), 6);
    assert.deepEqual(planAllocationReversals(afterReceipt, 6), [{ id: "a2", reverseBy: 6 }]);
    // Asking for more than reversible can never un-order received units.
    assert.deepEqual(planAllocationReversals(afterReceipt, 60), [{ id: "a2", reverseBy: 6 }]);
  });
  it("cancel after partial reversal does not double-reverse", () => {
    const partly = [{ id: "a1", procurementRequestId: "p", quantity: 10, reversedQuantity: 4, receivedQuantity: 0 }];
    assert.deepEqual(planAllocationReversals(partly, 10), [{ id: "a1", reverseBy: 6 }]);
  });
  it("incoming = open PO outstanding + unallocated PR (no double count; drafts excluded)", () => {
    // PR 60 fully allocated to an approved PO of 60 → incoming 60, not 120.
    assert.equal(incomingForPowerState({ openPoOutstanding: 60, prs: [{ requestedQuantity: 60, orderedQuantity: 60 }] }), 60);
    // Draft PO (not approved) → only the unallocated PR counts.
    assert.equal(incomingForPowerState({ openPoOutstanding: 0, prs: [{ requestedQuantity: 60, orderedQuantity: 0 }] }), 60);
    // After close outstanding (6 reversed) the shortage is visible again via the PR.
    assert.equal(incomingForPowerState({ openPoOutstanding: 0, prs: [{ requestedQuantity: 60, orderedQuantity: 54 }] }), 6);
  });
});

describe("Run Reorder suppression while a PO is open for the power", () => {
  it("suppresses for open / sent / partially received, not for closed", () => {
    for (const status of ["OPEN", "SENT", "PARTIALLY_RECEIVED"]) {
      assert.match(openPurchaseOrderSuppression({ publicId: "PO-1", status })!, /PO-1/);
    }
    assert.equal(openPurchaseOrderSuppression({ publicId: "PO-1", status: "CLOSED" }), null);
    assert.equal(openPurchaseOrderSuppression(null), null);
  });
});

describe("Confirm Receipt gating (documents vs stock posting)", () => {
  const ready = {
    status: "VALIDATED",
    billStoragePath: "procurement/bill.pdf",
    excelStoragePath: "procurement/x.xlsx",
    lines: [{ acceptedQuantity: 54, purchaseOrderLineId: "l1" }],
    billSummaries: [{ difference: 0, resolution: null }],
  };
  it("is ready only when both documents are stored and mismatches resolved", () => {
    assert.deepEqual(receiptConfirmBlockers(ready), []);
    assert.equal(receiptConfirmBlockers({ ...ready, billStoragePath: null }).length, 1);
    assert.equal(receiptConfirmBlockers({ ...ready, excelStoragePath: null }).length, 1);
    assert.match(
      receiptConfirmBlockers({ ...ready, billSummaries: [{ difference: -2, resolution: null }] })[0]!,
      /mismatch/
    );
    assert.deepEqual(
      receiptConfirmBlockers({ ...ready, billSummaries: [{ difference: -2, resolution: "ACCEPT_EXCEL" }] }),
      []
    );
  });
  it("blocks confirmed/cancelled receipts, zero accepted, and off-PO accepted lines", () => {
    assert.ok(receiptConfirmBlockers({ ...ready, status: "CONFIRMED" }).length > 0);
    assert.ok(receiptConfirmBlockers({ ...ready, lines: [{ acceptedQuantity: 0, purchaseOrderLineId: "l1" }] }).length > 0);
    assert.ok(receiptConfirmBlockers({ ...ready, lines: [{ acceptedQuantity: 1, purchaseOrderLineId: null }] }).length > 0);
  });
  it("validates range resolutions", () => {
    assert.equal(isRangeResolution("BILL_CORRECTION"), true);
    assert.equal(isRangeResolution("DROP TABLE"), false);
    assert.equal(unresolvedRangeMismatches([{ difference: 3, resolution: "  " }]).length, 1);
  });
});

describe("structural guards on DB code (exactly-once posting)", () => {
  const src = readFileSync(join(process.cwd(), "app/lib/goods-receipts.ts"), "utf8");
  const confirm = src.slice(src.indexOf("export async function confirmGoodsReceipt"), src.indexOf("export async function closePurchaseOrderOutstanding"));
  it("locks the PO before re-reading the receipt inside the confirm transaction", () => {
    const lockAt = confirm.indexOf("await lockPurchaseOrder(tx, head.purchaseOrderId)");
    const readAt = confirm.indexOf("tx.goodsReceipt.findUnique");
    assert.ok(lockAt > 0 && readAt > lockAt);
  });
  it("settles PRs via allocations, increments received atomically, and drafts (not posts) the bill", () => {
    assert.match(confirm, /settleProcurementRequests: false/);
    assert.match(confirm, /receivedQuantity: \{ increment: line\.acceptedQuantity \}/);
    assert.match(confirm, /status: PurchaseBillStatus\.DRAFT/);
    assert.equal(confirm.includes("PurchaseBillStatus.POSTED"), false);
    assert.match(confirm, /grnReference: receipt\.publicId/);
  });
  it("receipt route requires both documents and never skips storage", () => {
    const route = readFileSync(join(process.cwd(), "app/api/procurement/purchase-orders/[id]/receipts/route.ts"), "utf8");
    assert.equal(route.includes("upload skipped"), false);
    assert.match(route, /readUpload\(form, "bill"\)/);
    assert.match(route, /readUpload\(form, "excel"\)/);
  });
  it("incoming calculation has no silent fallback", () => {
    const pr = readFileSync(join(process.cwd(), "app/lib/procurement-requests.ts"), "utf8");
    const fn = pr.slice(pr.indexOf("export async function getIncomingQuantity"), pr.indexOf("/** Reserved-but-not-picked"));
    assert.equal(/catch\s*\{/.test(fn), false);
  });
});

describe("Create-PO Excel import", () => {
  it("parses valid rows, skips blank quantities, normalises rates", async () => {
    const buf = await workbook([
      ["lensType", "lensId", "product", "power", "required", "poQuantity", "rate"],
      ["SINGLE_VISION", "lens-a", "ASH", "SPH -2", 10, 12, "₹ 1,250.50"],
      ["KT", "lens-b", "", "", "", 5, ""],
      ["PROGRESSIVE", "lens-c", "", "", 3, "", ""],
    ]);
    const res = await parsePoImportWorkbook(buf);
    assert.deepEqual(res.errors, []);
    assert.equal(res.rows.length, 2);
    assert.deepEqual(res.rows[0], { rowNumber: 2, lensType: "SINGLE_VISION", lensId: "lens-a", requiredQuantity: 10, poQuantity: 12, rate: 1250.5 });
    assert.equal(res.rows[1]!.lensType, "KRYPTOK");
    assert.equal(res.rows[1]!.requiredQuantity, 5);
    assert.equal(res.rows[1]!.rate, null);
    assert.equal(res.warnings.length, 1);
  });
  it("rejects duplicate powers, bad quantities, unknown types and missing columns", async () => {
    const res = await parsePoImportWorkbook(
      await workbook([
        ["lensType", "lensId", "poQuantity"],
        ["SINGLE_VISION", "a", 2],
        ["SINGLE_VISION", "a", 3],
        ["SINGLE_VISION", "b", 1.5],
        ["BIFOCAL", "c", 1],
        ["SINGLE_VISION", "d", -4],
      ])
    );
    assert.equal(res.errors.length, 4);
    assert.match(res.errors[0]!, /row 2/);
    const missing = await parsePoImportWorkbook(await workbook([["lensId", "qty"], ["a", 1]]));
    assert.match(missing.errors[0]!, /lensType/);
    const notXlsx = await parsePoImportWorkbook(new Uint8Array(Buffer.from("not a workbook")));
    assert.match(notXlsx.errors[0]!, /readable/);
  });
  it("the downloadable template round-trips through the parser", async () => {
    const buf = await buildPoImportTemplate([
      { lensType: "SINGLE_VISION", lensId: "lens-a", product: "ASH", power: "SPH -2", required: 6 },
    ]);
    const res = await parsePoImportWorkbook(new Uint8Array(buf));
    assert.deepEqual(res.errors, []);
    assert.equal(res.rows[0]!.poQuantity, 6);
  });
});

describe("supplier address on PO documents", () => {
  it("formats multi-line address, city/pincode and state code", () => {
    assert.deepEqual(
      formatSupplierAddressLines({ address: "12 Ring Rd\nUnit 4", city: "Surat", pincode: "395003", state: "Gujarat", stateCode: "24" }),
      ["12 Ring Rd", "Unit 4", "Surat - 395003", "Gujarat (24)"]
    );
    assert.deepEqual(formatSupplierAddressLines({}), []);
  });
});
