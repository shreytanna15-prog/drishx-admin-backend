import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { join, extname, basename } from "path";

/**
 * Upload local public/lense-images/* into Supabase Storage
 * under order-images/lens-catalog/.
 *
 *   npx tsx scripts/upload-lens-catalog-images.ts
 */

function loadEnvFile() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

loadEnvFile();

function normalizeSupabaseUrl(raw: string) {
  return raw.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

const IMAGE_DIR = join(process.cwd(), "public", "lense-images");
const BUCKET = process.env.SUPABASE_ORDER_IMAGES_BUCKET?.trim() || "order-images";

const FILES: { local: string; objectPath: string }[] = [
  { local: "singlevision.jpeg", objectPath: "lens-catalog/singlevision.jpeg" },
  { local: "progressive.jpeg", objectPath: "lens-catalog/progressive.jpeg" },
  { local: "kryptok.jpeg", objectPath: "lens-catalog/kryptok.jpeg" },
  { local: "rxorders.jpeg", objectPath: "lens-catalog/rxorders.jpeg" },
  { local: "colors.jpeg", objectPath: "lens-catalog/colors.jpeg" },
  { local: "glass.jpeg", objectPath: "lens-catalog/glass.jpeg" },
];

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(normalizeSupabaseUrl(url), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Uploading from ${IMAGE_DIR} → bucket ${BUCKET}`);
  console.log(
    "Local files:",
    readdirSync(IMAGE_DIR).join(", ")
  );

  for (const file of FILES) {
    const fullPath = join(IMAGE_DIR, file.local);
    const buffer = readFileSync(fullPath);
    const ext = extname(file.local).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";

    const { error } = await supabase.storage.from(BUCKET).upload(file.objectPath, buffer, {
      contentType,
      upsert: true,
    });

    if (error) {
      console.error(`FAIL ${file.local}:`, error.message);
      continue;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(file.objectPath);
    console.log(`OK  ${basename(file.local)} → ${data.publicUrl}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
