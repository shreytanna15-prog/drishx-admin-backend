/**
 * Pure Storefront Catalog helpers (no Prisma / env).
 */

/** Shop/API family aliases → LensFamily.code */
const FAMILY_CODE_ALIASES: Record<string, string> = {
  sv: "SV",
  "single-vision": "SV",
  singlevision: "SV",
  kt: "KT",
  kryptok: "KT",
  v2: "V2",
  progressive: "V2",
};

export function normalizeFamilyCode(raw: string | null | undefined): string | null {
  const key = (raw ?? "").trim().toLowerCase();
  if (!key) return null;
  if (FAMILY_CODE_ALIASES[key]) return FAMILY_CODE_ALIASES[key]!;
  const upper = (raw ?? "").trim().toUpperCase();
  if (upper === "SV" || upper === "KT" || upper === "V2") return upper;
  return null;
}

export class StorefrontCatalogError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "STOREFRONT_ERROR") {
    super(message);
    this.name = "StorefrontCatalogError";
    this.status = status;
    this.code = code;
  }
}
