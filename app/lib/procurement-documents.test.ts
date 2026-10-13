import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import {
  detectDocumentType,
  MAX_PROCUREMENT_DOC_BYTES,
  missingReceiptDocuments,
  persistDocumentsThenRecord,
  ProcurementDocumentError,
  safeDocumentStem,
  validateProcurementDocument,
  type DocumentStorage,
  type PreparedDocument,
} from "./procurement-documents";

const PDF = new Uint8Array(Buffer.from("%PDF-1.4\n%test\n"));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = new Uint8Array(Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ", "latin1"));
const XLS_OLE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_NOT_XLSX = new Uint8Array(Buffer.from("PK\u0003\u0004word/document.xml[Content_Types].xml", "latin1"));

async function realXlsx(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("S").addRow(["lensType", "lensId", "quantity"]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("document type detection (content, not file name)", () => {
  it("recognises PDF, PNG, JPEG, WebP and real XLSX", async () => {
    assert.equal(detectDocumentType(PDF)?.extension, "pdf");
    assert.equal(detectDocumentType(PNG)?.extension, "png");
    assert.equal(detectDocumentType(JPG)?.extension, "jpg");
    assert.equal(detectDocumentType(WEBP)?.extension, "webp");
    assert.equal(detectDocumentType(await realXlsx())?.extension, "xlsx");
  });
  it("rejects legacy .xls, other zip files and garbage", () => {
    assert.equal(detectDocumentType(XLS_OLE), null);
    assert.equal(detectDocumentType(ZIP_NOT_XLSX), null);
    assert.equal(detectDocumentType(new Uint8Array(Buffer.from("hello"))), null);
  });
});

describe("validateProcurementDocument", () => {
  it("accepts a PDF/image bill and an xlsx Excel", async () => {
    assert.equal(validateProcurementDocument({ kind: "bill", buffer: PDF, fileName: "b.pdf" }).mimeType, "application/pdf");
    assert.equal(validateProcurementDocument({ kind: "bill", buffer: JPG, fileName: "b.jpg" }).mimeType, "image/jpeg");
    const xlsx = await realXlsx();
    assert.equal(validateProcurementDocument({ kind: "excel", buffer: xlsx, fileName: "x.xlsx" }).extension, "xlsx");
  });
  it("rejects spoofed names, wrong kinds, empty and oversize files", async () => {
    const xlsx = await realXlsx();
    const code = (fn: () => unknown) => {
      try {
        fn();
        return "no-error";
      } catch (err) {
        return err instanceof ProcurementDocumentError ? err.code : "other";
      }
    };
    assert.equal(code(() => validateProcurementDocument({ kind: "bill", buffer: new Uint8Array(Buffer.from("MZ...")), fileName: "bill.pdf" })), "DOCUMENT_TYPE_INVALID");
    assert.equal(code(() => validateProcurementDocument({ kind: "bill", buffer: xlsx, fileName: "bill.pdf" })), "DOCUMENT_TYPE_INVALID");
    assert.equal(code(() => validateProcurementDocument({ kind: "excel", buffer: PDF, fileName: "x.xlsx" })), "DOCUMENT_TYPE_INVALID");
    assert.equal(code(() => validateProcurementDocument({ kind: "excel", buffer: XLS_OLE, fileName: "x.xls" })), "DOCUMENT_TYPE_INVALID");
    assert.equal(code(() => validateProcurementDocument({ kind: "bill", buffer: new Uint8Array(0), fileName: "b.pdf" })), "DOCUMENT_EMPTY");
    const big = new Uint8Array(MAX_PROCUREMENT_DOC_BYTES + 1);
    big.set(PDF);
    assert.equal(code(() => validateProcurementDocument({ kind: "bill", buffer: big, fileName: "b.pdf" })), "DOCUMENT_TOO_LARGE");
  });
  it("sanitises object-name stems", () => {
    assert.equal(safeDocumentStem("../../etc/passwd.pdf"), "etc_passwd");
    assert.equal(safeDocumentStem(""), "document");
  });
});

function fakeStorage(opts: { failOn?: string } = {}) {
  const stored = new Set<string>();
  const removed: string[] = [];
  const storage: DocumentStorage = {
    async upload(path) {
      if (opts.failOn && path.includes(opts.failOn)) throw new Error("bucket offline");
      stored.add(path);
    },
    async remove(paths) {
      for (const p of paths) {
        removed.push(p);
        stored.delete(p);
      }
    },
  };
  return { storage, stored, removed };
}

const docs = (): PreparedDocument[] => [
  { kind: "excel", buffer: new Uint8Array([1]), objectPath: "po/1/excel-a.xlsx", mimeType: "x", fileName: "a.xlsx" },
  { kind: "bill", buffer: new Uint8Array([1]), objectPath: "po/1/bill-a.pdf", mimeType: "application/pdf", fileName: "a.pdf" },
];

describe("persistDocumentsThenRecord — never silently skips storage", () => {
  it("writes the record only after every upload succeeded", async () => {
    const { storage, stored } = fakeStorage();
    let seen: string[] = [];
    const result = await persistDocumentsThenRecord({
      storage,
      documents: docs(),
      writeRecord: async (persisted) => {
        seen = persisted.map((p) => p.objectPath);
        return "receipt";
      },
    });
    assert.equal(result, "receipt");
    assert.deepEqual(seen, ["po/1/excel-a.xlsx", "po/1/bill-a.pdf"]);
    assert.equal(stored.size, 2);
  });

  it("upload failure → 503, no record, earlier uploads removed", async () => {
    const { storage, stored, removed } = fakeStorage({ failOn: "bill" });
    let wrote = false;
    await assert.rejects(
      persistDocumentsThenRecord({
        storage,
        documents: docs(),
        writeRecord: async () => {
          wrote = true;
          return 1;
        },
      }),
      (err: unknown) =>
        err instanceof ProcurementDocumentError &&
        err.status === 503 &&
        err.code === "DOCUMENT_STORAGE_UNAVAILABLE" &&
        /Nothing was saved/.test(err.message)
    );
    assert.equal(wrote, false);
    assert.deepEqual(removed, ["po/1/excel-a.xlsx"]);
    assert.equal(stored.size, 0);
  });

  it("propagates storage configuration errors unchanged", async () => {
    const storage: DocumentStorage = {
      async upload() {
        throw new ProcurementDocumentError("not configured", 503, "DOCUMENT_STORAGE_NOT_CONFIGURED");
      },
      async remove() {},
    };
    await assert.rejects(
      persistDocumentsThenRecord({ storage, documents: docs(), writeRecord: async () => 1 }),
      (err: unknown) => err instanceof ProcurementDocumentError && err.code === "DOCUMENT_STORAGE_NOT_CONFIGURED"
    );
  });

  it("DB write failure removes the uploaded objects (no orphans)", async () => {
    const { storage, stored, removed } = fakeStorage();
    await assert.rejects(
      persistDocumentsThenRecord({
        storage,
        documents: docs(),
        writeRecord: async () => {
          throw new Error("transaction aborted");
        },
      }),
      /transaction aborted/
    );
    assert.equal(removed.length, 2);
    assert.equal(stored.size, 0);
  });

  it("reports cleanup failures without masking the original error", async () => {
    const cleanupErrors: string[][] = [];
    const storage: DocumentStorage = {
      async upload() {},
      async remove() {
        throw new Error("remove failed");
      },
    };
    await assert.rejects(
      persistDocumentsThenRecord({
        storage,
        documents: docs(),
        writeRecord: async () => {
          throw new Error("db down");
        },
        onCleanupError: (_e, paths) => cleanupErrors.push(paths),
      }),
      /db down/
    );
    assert.equal(cleanupErrors.length, 1);
  });
});

describe("missingReceiptDocuments", () => {
  it("lists documents not persisted", () => {
    assert.deepEqual(missingReceiptDocuments({ billStoragePath: null, excelStoragePath: "x" }), ["bill"]);
    assert.deepEqual(missingReceiptDocuments({ billStoragePath: "b", excelStoragePath: null }), ["excel"]);
    assert.deepEqual(missingReceiptDocuments({ billStoragePath: "b", excelStoragePath: "x" }), []);
  });
});
