import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_INVOICE_TAX_PDF_OBJECT_URL_REVOKE_MS,
  adminInvoiceTaxPdfPath,
  presentAdminInvoiceTaxDocument,
} from "./admin-invoices";

describe("adminInvoiceTaxPdfPath", () => {
  it("builds a same-origin path without query tokens", () => {
    const path = adminInvoiceTaxPdfPath("inv_abc123");
    assert.equal(path, "/api/invoices/inv_abc123/pdf");
    assert.equal(path.includes("?"), false);
    assert.match(path, /^\/api\/invoices\//);
    assert.doesNotMatch(path, /access_token|token=/i);
  });

  it("encodes invoice ids safely", () => {
    assert.equal(
      adminInvoiceTaxPdfPath("id with space"),
      "/api/invoices/id%20with%20space/pdf"
    );
  });

  it("rejects empty invoice ids", () => {
    assert.throws(() => adminInvoiceTaxPdfPath("  "), /Missing invoice id/);
  });
});

describe("presentAdminInvoiceTaxDocument", () => {
  it("navigates a pre-opened popup and schedules object URL revoke", () => {
    const blob = new Blob(["<html>invoice</html>"], { type: "text/html" });
    const replaced: string[] = [];
    const revoked: string[] = [];
    const delays: number[] = [];
    const popup = {
      closed: false,
      location: {
        replace(url: string) {
          replaced.push(url);
        },
      },
      close() {},
    } as unknown as Window;

    const result = presentAdminInvoiceTaxDocument(blob, popup, {
      createObjectUrl: () => "blob:admin-invoice-test",
      revokeObjectUrl: (url) => {
        revoked.push(url);
      },
      schedule: ((fn: () => void, ms: number) => {
        delays.push(ms);
        fn();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      revokeAfterMs: 1_000,
    });

    assert.equal(result.objectUrl, "blob:admin-invoice-test");
    assert.equal(result.openedInPopup, true);
    assert.equal(result.usedAnchorFallback, false);
    assert.deepEqual(replaced, ["blob:admin-invoice-test"]);
    assert.deepEqual(revoked, ["blob:admin-invoice-test"]);
    assert.deepEqual(delays, [1_000]);
  });

  it("defaults revoke delay to 60s when popup open succeeds", () => {
    const blob = new Blob(["x"], { type: "text/html" });
    const delays: number[] = [];
    const popup = {
      closed: false,
      location: { replace() {} },
      close() {},
    } as unknown as Window;

    presentAdminInvoiceTaxDocument(blob, popup, {
      createObjectUrl: () => "blob:default-delay",
      revokeObjectUrl: () => {},
      schedule: ((fn: () => void, ms: number) => {
        delays.push(ms);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
    });

    assert.deepEqual(delays, [ADMIN_INVOICE_TAX_PDF_OBJECT_URL_REVOKE_MS]);
  });
});
