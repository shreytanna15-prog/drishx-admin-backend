export type ParsedLensSearch = {
  /** e.g. -6/-2 or 0/-0.25 */
  sphCylPair: { sph: number; cyl: number | null } | null;
  /** Whole query is one number (price, sph, cyl, add, axis). */
  singleNumber: number | null;
  /** Text to match on brand, item, coating, etc. */
  remainingText: string;
};

export function toSearchNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parse shop search: combined SPH/CYL, a single number, or free text. */
export function parseLensSearchTerm(raw: string): ParsedLensSearch {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { sphCylPair: null, singleNumber: null, remainingText: "" };
  }

  if (trimmed.includes("/")) {
    const segments = trimmed.split("/").map((part) => part.trim());
    if (segments.length === 2) {
      const [sphPart, cylPart] = segments;
      const sph = toSearchNumber(sphPart);
      const cylMissing =
        cylPart === "" || cylPart === "—" || cylPart === "-" || cylPart.toLowerCase() === "null";
      const cyl = cylMissing ? null : toSearchNumber(cylPart);
      if (sph !== null && (cyl !== null || cylMissing)) {
        return { sphCylPair: { sph, cyl }, singleNumber: null, remainingText: "" };
      }
    }
  }

  const singleNumber = toSearchNumber(trimmed);
  return {
    sphCylPair: null,
    singleNumber,
    remainingText: trimmed,
  };
}

type NumericFieldFlags = {
  sph?: boolean;
  cyl?: boolean;
  crossPower?: boolean;
  add?: boolean;
  price?: boolean;
  axis?: boolean;
};

/** Build Prisma OR fragments for prescription / price numeric search. */
export function buildNumericSearchClauses<T extends Record<string, unknown>>(
  parsed: ParsedLensSearch,
  fields: NumericFieldFlags
): T[] {
  const clauses: T[] = [];

  if (parsed.sphCylPair) {
    const prescription: Record<string, unknown> = { sph: parsed.sphCylPair.sph };
    if (parsed.sphCylPair.cyl !== null) {
      prescription.cyl = parsed.sphCylPair.cyl;
    } else {
      prescription.cyl = null;
    }
    clauses.push(prescription as unknown as T);
  }

  if (parsed.singleNumber !== null) {
    const n = parsed.singleNumber;
    if (fields.sph) clauses.push({ sph: n } as unknown as T);
    if (fields.cyl) clauses.push({ cyl: n } as unknown as T);
    if (fields.crossPower) clauses.push({ crossPower: n } as unknown as T);
    if (fields.add) clauses.push({ add: n } as unknown as T);
    if (fields.price) clauses.push({ price: n } as unknown as T);
    if (fields.axis) clauses.push({ axis: Math.trunc(n) } as unknown as T);
  }

  return clauses;
}
