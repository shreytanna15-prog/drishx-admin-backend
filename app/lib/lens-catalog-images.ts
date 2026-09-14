import {
  getSignedOrderImageUrl,
  getStoragePublicUrl,
} from "./supabase-storage";

/** Catalog image keys matching files under public/lense-images/. */
export type LensCatalogImageKey =
  | "singlevision"
  | "progressive"
  | "kryptok"
  | "rx"
  | "color"
  | "white";

export type ApiLensType = "KRYPTOK" | "PROGRESSIVE" | "SINGLE_VISION";

const OBJECT_PATHS: Record<LensCatalogImageKey, string> = {
  singlevision: "lens-catalog/singlevision.jpeg",
  progressive: "lens-catalog/progressive.jpeg",
  kryptok: "lens-catalog/kryptok.jpeg",
  rx: "lens-catalog/rxorders.jpeg",
  color: "lens-catalog/colors.jpeg",
  white: "lens-catalog/glass.jpeg",
};

const LENS_TYPE_TO_KEY: Record<ApiLensType, LensCatalogImageKey> = {
  SINGLE_VISION: "singlevision",
  PROGRESSIVE: "progressive",
  KRYPTOK: "kryptok",
};

/** Home / dashboard category id → catalog image key. */
export const HOME_CATEGORY_IMAGE_KEYS: Record<string, LensCatalogImageKey> = {
  singlevision: "singlevision",
  progressive: "progressive",
  kryptok: "kryptok",
  rx: "rx",
  color: "color",
  white: "white",
};

/** Shop / wholesale category id (sv|kt|v2) → catalog image key. */
export const SHOP_CATEGORY_IMAGE_KEYS: Record<string, LensCatalogImageKey> = {
  sv: "singlevision",
  kt: "kryptok",
  v2: "progressive",
};

const SIGNED_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

type CacheEntry = { url: string; expiresAt: number };
const signedUrlCache = new Map<string, CacheEntry>();

export function getLensCatalogObjectPath(key: LensCatalogImageKey): string {
  return OBJECT_PATHS[key];
}

export function getLensCatalogPublicUrl(key: LensCatalogImageKey): string {
  return getStoragePublicUrl(OBJECT_PATHS[key]);
}

export async function resolveLensCatalogImageUrl(
  key: LensCatalogImageKey
): Promise<string> {
  const cached = signedUrlCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.url;
  }

  const publicUrl = getLensCatalogPublicUrl(key);
  const signed = await getSignedOrderImageUrl(publicUrl, SIGNED_TTL_SECONDS);
  signedUrlCache.set(key, {
    url: signed,
    expiresAt: now + SIGNED_TTL_SECONDS * 1000,
  });
  return signed;
}

export async function resolveLensTypeImageUrl(
  lensType: ApiLensType
): Promise<string> {
  return resolveLensCatalogImageUrl(LENS_TYPE_TO_KEY[lensType]);
}

export async function resolveAllCatalogImageUrls(): Promise<
  Record<LensCatalogImageKey, string>
> {
  const keys = Object.keys(OBJECT_PATHS) as LensCatalogImageKey[];
  const entries = await Promise.all(
    keys.map(async (key) => [key, await resolveLensCatalogImageUrl(key)] as const)
  );
  return Object.fromEntries(entries) as Record<LensCatalogImageKey, string>;
}

export async function attachLensTypeImageUrls<
  T extends { lensType: ApiLensType },
>(items: T[]): Promise<Array<T & { imageUrl: string }>> {
  const needed = new Set(items.map((item) => item.lensType));
  const urlByType = new Map<ApiLensType, string>();
  await Promise.all(
    [...needed].map(async (type) => {
      urlByType.set(type, await resolveLensTypeImageUrl(type));
    })
  );
  return items.map((item) => ({
    ...item,
    imageUrl: urlByType.get(item.lensType) ?? getLensCatalogPublicUrl(LENS_TYPE_TO_KEY[item.lensType]),
  }));
}
