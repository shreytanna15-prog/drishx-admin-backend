/**
 * Procurement document validation + persistence orchestration (RW-08).
 * Pure / dependency-injected so it can be unit-tested without storage or DB.
 *
 * Contract: a document is only ever reported as attached after the storage
 * upload succeeded AND the database record referencing it was written. If
 * either step fails, already-uploaded objects are removed (best effort) and a
 * clear error is raised — nothing is silently skipped.
 */

export const MAX_PROCUREMENT_DOC_BYTES = 12 * 1024 * 1024;

export type ProcurementDocKind = "bill" | "excel";

export type DetectedDocType = {
  mimeType: string;
  extension: "pdf" | "png" | "jpg" | "webp" | "xlsx";
};

export class ProcurementDocumentError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "DOCUMENT_INVALID") {
    super(message);
    this.name = "ProcurementDocumentError";
    this.status = status;
    this.code = code;
  }
}

function startsWith(buffer: Uint8Array, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
}

function containsAscii(buffer: Uint8Array, needle: string): boolean {
  return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength).includes(
    Buffer.from(needle, "latin1")
  );
}

/** Identify a document by its content (magic bytes), never by the client MIME. */
export function detectDocumentType(buffer: Uint8Array): DetectedDocType | null {
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { mimeType: "application/pdf", extension: "pdf" };
  }
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { mimeType: "image/webp", extension: "webp" };
  }
  // XLSX = ZIP container holding an Office Open XML workbook.
  if (
    startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) &&
    containsAscii(buffer, "[Content_Types].xml") &&
    containsAscii(buffer, "xl/workbook")
  ) {
    return {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
    };
  }
  return null;
}

const BILL_TYPES = new Set(["pdf", "png", "jpg", "webp"]);

/** Validate size + real content type for a procurement upload. */
export function validateProcurementDocument(input: {
  kind: ProcurementDocKind;
  buffer: Uint8Array;
  fileName?: string | null;
}): DetectedDocType {
  const label = input.kind === "bill" ? "Supplier bill" : "Power-wise Excel";
  if (input.buffer.byteLength <= 0) {
    throw new ProcurementDocumentError(`${label} is empty.`, 400, "DOCUMENT_EMPTY");
  }
  if (input.buffer.byteLength > MAX_PROCUREMENT_DOC_BYTES) {
    throw new ProcurementDocumentError(
      `${label} is larger than 12 MB.`,
      400,
      "DOCUMENT_TOO_LARGE"
    );
  }
  const detected = detectDocumentType(input.buffer);
  if (input.kind === "excel") {
    if (detected?.extension !== "xlsx") {
      throw new ProcurementDocumentError(
        "Power-wise Excel must be a valid .xlsx workbook (older .xls and CSV are not supported).",
        400,
        "DOCUMENT_TYPE_INVALID"
      );
    }
    return detected;
  }
  if (!detected || !BILL_TYPES.has(detected.extension)) {
    throw new ProcurementDocumentError(
      "Supplier bill must be a PDF, JPEG, PNG or WebP file.",
      400,
      "DOCUMENT_TYPE_INVALID"
    );
  }
  return detected;
}

/** Safe object-name stem from a user file name. */
export function safeDocumentStem(fileName: string | null | undefined): string {
  const base = (fileName ?? "")
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 60);
  return base || "document";
}

/** Display name shown to users (original name, trimmed, no path parts). */
export function displayDocumentName(fileName: string | null | undefined, ext: string): string {
  const raw = (fileName ?? "").split(/[\\/]/).pop()?.trim() ?? "";
  const cleaned = raw.replace(/[\u0000-\u001f]/g, "").slice(0, 120);
  return cleaned || `document.${ext}`;
}

export type DocumentStorage = {
  upload(objectPath: string, buffer: Uint8Array, mimeType: string): Promise<void>;
  remove(objectPaths: string[]): Promise<void>;
};

export type PreparedDocument = {
  kind: ProcurementDocKind;
  buffer: Uint8Array;
  objectPath: string;
  mimeType: string;
  fileName: string;
};

export type PersistedDocument = {
  kind: ProcurementDocKind;
  objectPath: string;
  mimeType: string;
  fileName: string;
};

/**
 * Upload every document, then write the DB record. Any failure removes the
 * objects uploaded so far (no orphans) and rethrows. Returns the record only
 * when everything was persisted.
 */
export async function persistDocumentsThenRecord<T>(input: {
  storage: DocumentStorage;
  documents: PreparedDocument[];
  writeRecord: (persisted: PersistedDocument[]) => Promise<T>;
  onCleanupError?: (error: unknown, paths: string[]) => void;
}): Promise<T> {
  const uploaded: PersistedDocument[] = [];
  const cleanup = async () => {
    if (!uploaded.length) return;
    const paths = uploaded.map((doc) => doc.objectPath);
    try {
      await input.storage.remove(paths);
    } catch (error) {
      input.onCleanupError?.(error, paths);
    }
  };

  for (const doc of input.documents) {
    try {
      await input.storage.upload(doc.objectPath, doc.buffer, doc.mimeType);
    } catch (error) {
      await cleanup();
      if (error instanceof ProcurementDocumentError) throw error;
      throw new ProcurementDocumentError(
        `Could not store the ${doc.kind === "bill" ? "supplier bill" : "power-wise Excel"}: ${
          error instanceof Error ? error.message : "storage error"
        }. Nothing was saved — try again once document storage is available.`,
        503,
        "DOCUMENT_STORAGE_UNAVAILABLE"
      );
    }
    uploaded.push({
      kind: doc.kind,
      objectPath: doc.objectPath,
      mimeType: doc.mimeType,
      fileName: doc.fileName,
    });
  }

  try {
    return await input.writeRecord(uploaded);
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Both documents must be persisted before a receipt may post stock. */
export function missingReceiptDocuments(receipt: {
  billStoragePath: string | null;
  excelStoragePath: string | null;
}): ProcurementDocKind[] {
  const missing: ProcurementDocKind[] = [];
  if (!receipt.billStoragePath) missing.push("bill");
  if (!receipt.excelStoragePath) missing.push("excel");
  return missing;
}
