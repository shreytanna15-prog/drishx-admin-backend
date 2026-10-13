import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "./supabase-storage";
import {
  ProcurementDocumentError,
  safeDocumentStem,
  type DocumentStorage,
  type ProcurementDocKind,
} from "./procurement-documents";

/**
 * Supabase-backed private storage for procurement documents (RW-08).
 * Uses the existing Supabase service client; objects live in a PRIVATE bucket
 * and are only ever served through short-lived signed URLs after an
 * authenticated, permission-checked API call.
 */

export function getProcurementBucket(): string {
  return process.env.SUPABASE_PROCUREMENT_BUCKET?.trim() || "procurement-documents";
}

let verifiedBucket: string | null = null;

function adminClientOrThrow() {
  try {
    return getSupabaseAdmin();
  } catch {
    throw new ProcurementDocumentError(
      "Document storage is not configured on this server (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). Supplier documents cannot be saved, so the receipt was not created.",
      503,
      "DOCUMENT_STORAGE_NOT_CONFIGURED"
    );
  }
}

/** Ensure the procurement bucket exists and is private; refuse public buckets. */
async function ensurePrivateBucket() {
  const bucket = getProcurementBucket();
  if (verifiedBucket === bucket) return bucket;
  const supabase = adminClientOrThrow();
  const { data, error } = await supabase.storage.getBucket(bucket);
  if (error || !data) {
    const created = await supabase.storage.createBucket(bucket, { public: false });
    if (created.error) {
      throw new ProcurementDocumentError(
        `Document storage bucket "${bucket}" is unavailable (${created.error.message}). Nothing was saved.`,
        503,
        "DOCUMENT_STORAGE_UNAVAILABLE"
      );
    }
  } else if (data.public) {
    throw new ProcurementDocumentError(
      `Storage bucket "${bucket}" is public. Supplier documents must be stored privately — make the bucket private or set SUPABASE_PROCUREMENT_BUCKET to a private bucket.`,
      503,
      "DOCUMENT_STORAGE_NOT_PRIVATE"
    );
  }
  verifiedBucket = bucket;
  return bucket;
}

export function buildProcurementObjectPath(input: {
  scope: "purchase-orders" | "purchase-bills";
  ownerId: string;
  kind: ProcurementDocKind | "bill-manual";
  fileName: string | null | undefined;
  extension: string;
}): string {
  const owner = input.ownerId.replace(/[^A-Za-z0-9_-]+/g, "");
  return `${input.scope}/${owner}/${input.kind}-${Date.now()}-${randomBytes(6).toString("hex")}-${safeDocumentStem(input.fileName)}.${input.extension}`;
}

export const supabaseProcurementStorage: DocumentStorage = {
  async upload(objectPath, buffer, mimeType) {
    const bucket = await ensurePrivateBucket();
    const supabase = adminClientOrThrow();
    const { error } = await supabase.storage
      .from(bucket)
      .upload(objectPath, Buffer.from(buffer), { contentType: mimeType, upsert: false });
    if (error) throw new Error(error.message || "upload failed");
  },
  async remove(objectPaths) {
    if (!objectPaths.length) return;
    const supabase = adminClientOrThrow();
    const { error } = await supabase.storage.from(getProcurementBucket()).remove(objectPaths);
    if (error) throw new Error(error.message || "remove failed");
  },
};

/** Short-lived signed URL for an authorized viewer. */
export async function signProcurementDocumentUrl(
  objectPath: string,
  downloadName: string,
  expiresInSeconds = 300
): Promise<string> {
  if (!objectPath || objectPath.includes("..") || objectPath.startsWith("/")) {
    throw new ProcurementDocumentError("Invalid document reference.", 400, "DOCUMENT_INVALID");
  }
  const supabase = adminClientOrThrow();
  const { data, error } = await supabase.storage
    .from(getProcurementBucket())
    .createSignedUrl(objectPath, expiresInSeconds, { download: downloadName });
  if (error || !data?.signedUrl) {
    throw new ProcurementDocumentError(
      "The stored document could not be retrieved from storage.",
      502,
      "DOCUMENT_UNAVAILABLE"
    );
  }
  return data.signedUrl;
}
