import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { getEnv } from "./env";

function normalizeSupabaseUrl(raw: string) {
  return raw.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

export function getSupabaseAdmin() {
  const env = getEnv();
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(normalizeSupabaseUrl(url), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getOrderImagesBucket(): string {
  return getEnv().SUPABASE_ORDER_IMAGES_BUCKET || "order-images";
}

/** Build a public object URL for a path inside the order-images bucket. */
export function getStoragePublicUrl(objectPath: string): string {
  const supabase = getSupabaseAdmin();
  const bucket = getOrderImagesBucket();
  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}

function resolveImageExtension(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  return "jpg";
}

async function uploadImageToBucket(
  objectPath: string,
  file: File
): Promise<string> {
  const mime = (file.type || "image/jpeg").toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  const supabase = getSupabaseAdmin();
  const bucket = getOrderImagesBucket();

  const { error } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    contentType: mime,
    upsert: false,
  });

  if (error) {
    throw new Error(error.message || "Failed to upload image to storage.");
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}

export async function uploadOrderImage(
  userId: string,
  file: File
): Promise<string> {
  const mime = (file.type || "image/jpeg").toLowerCase();
  const ext = resolveImageExtension(mime);
  const objectPath = `orders/${userId}/${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
  return uploadImageToBucket(objectPath, file);
}

export async function uploadColorReferenceImage(
  userId: string,
  file: File
): Promise<string> {
  const mime = (file.type || "image/jpeg").toLowerCase();
  const ext = resolveImageExtension(mime);
  const objectPath = `color-references/${userId}/${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
  return uploadImageToBucket(objectPath, file);
}

export async function uploadReturnRequestImage(
  returnRequestId: string,
  file: File
): Promise<string> {
  const mime = (file.type || "image/jpeg").toLowerCase();
  const ext = resolveImageExtension(mime);
  const objectPath = `return-requests/${returnRequestId}/${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
  return uploadImageToBucket(objectPath, file);
}

/** Extract storage object path from a Supabase public/authenticated object URL. */
export function extractObjectPathFromOrderImageUrl(
  imageUrl: string,
  bucket = getOrderImagesBucket()
): string | null {
  try {
    const url = new URL(imageUrl);
    const prefixes = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
    ];

    for (const prefix of prefixes) {
      const idx = url.pathname.indexOf(prefix);
      if (idx >= 0) {
        return decodeURIComponent(url.pathname.slice(idx + prefix.length));
      }
    }

    const match = url.pathname.match(
      new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/(.+)$`)
    );
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/** Return a time-limited URL clients can load (works for private buckets). */
export async function getSignedOrderImageUrl(
  storedUrl: string,
  expiresInSeconds = 60 * 60
): Promise<string> {
  const bucket = getOrderImagesBucket();
  const objectPath = extractObjectPathFromOrderImageUrl(storedUrl, bucket);
  if (!objectPath) {
    return storedUrl;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.warn("getSignedOrderImageUrl failed:", error?.message);
    return storedUrl;
  }

  return data.signedUrl;
}
