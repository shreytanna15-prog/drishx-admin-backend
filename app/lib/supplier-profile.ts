/**
 * Supplier profile rules (RW-08 Phase C).
 *
 * PURE module — no Prisma / server imports — so the admin form and the API
 * share exactly the same validation and normalisation.
 *
 * Phone numbers (phone / alternatePhone)
 * --------------------------------------
 * Indian numbers only. Spaces, dashes, dots and parentheses are ignored.
 * Accepted prefixes: "+91", "0091", "91" (only when 12 digits in total) or a
 * single trunk "0". What remains must be the 10-digit national number, which
 * never starts with 0:
 *   - mobile:   starts with 6–9            e.g. 98765 43210
 *   - landline: STD code + subscriber      e.g. 022 2654 3210 / 079-26543210
 * Everything is stored as "+91" + 10 digits, e.g. "+919876543210".
 *
 * GSTIN
 * -----
 * 15 chars, `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`, with the
 * official mod-36 check character. The first two digits are the GST state
 * code; when a state/stateCode is also supplied they must agree, otherwise
 * state + stateCode are derived from the GSTIN. If PAN is also supplied it
 * must equal GSTIN characters 3–12.
 */

export const SUPPLIER_ENTITY_TYPES = [
  { value: "PROPRIETORSHIP", label: "Proprietorship" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "LLP", label: "Limited Liability Partnership (LLP)" },
  { value: "PRIVATE_LIMITED", label: "Private Limited" },
  { value: "PUBLIC_LIMITED", label: "Public Limited" },
  { value: "OTHER", label: "Other" },
] as const;

export type SupplierEntityType = (typeof SUPPLIER_ENTITY_TYPES)[number]["value"];

export function supplierEntityTypeLabel(value: string | null | undefined): string {
  if (!value) return "";
  return SUPPLIER_ENTITY_TYPES.find((t) => t.value === value)?.label ?? value;
}

export type IndianState = {
  /** 2-digit GST state code. */
  code: string;
  name: string;
  /** Older codes still seen on valid GSTINs that map to this state. */
  legacyCodes?: string[];
};

/** States and union territories with their GST state codes. */
export const INDIAN_STATES: readonly IndianState[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  {
    code: "26",
    name: "Dadra and Nagar Haveli and Daman and Diu",
    legacyCodes: ["25"],
  },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
];

function normKey(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

export function findStateByName(name: string | null | undefined): IndianState | null {
  if (!name) return null;
  const key = normKey(name);
  if (!key) return null;
  return INDIAN_STATES.find((s) => normKey(s.name) === key) ?? null;
}

export function findStateByCode(code: string | null | undefined): IndianState | null {
  if (!code) return null;
  const c = code.trim().padStart(2, "0");
  return (
    INDIAN_STATES.find((s) => s.code === c || s.legacyCodes?.includes(c)) ?? null
  );
}

// ---------------------------------------------------------------------------
// GSTIN / PAN
// ---------------------------------------------------------------------------

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Official GSTIN check character for the first 14 characters (mod-36,
 * alternating weights 1/2, carry folded back in).
 */
export function gstinCheckChar(first14: string): string {
  const input = first14.toUpperCase();
  if (input.length !== 14) {
    throw new Error("gstinCheckChar expects exactly 14 characters.");
  }
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARSET.indexOf(input[i]);
    if (value < 0) throw new Error(`Invalid GSTIN character "${input[i]}".`);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARSET[(36 - (sum % 36)) % 36];
}

export function normalizeGstin(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Returns an error message, or null when the (normalised) GSTIN is valid. */
export function gstinError(gstin: string): string | null {
  if (gstin.length !== 15) return "GSTIN must be exactly 15 characters.";
  if (!GSTIN_PATTERN.test(gstin)) {
    return "GSTIN format is invalid (e.g. 24ABCDE1234F1Z5).";
  }
  if (!findStateByCode(gstin.slice(0, 2))) {
    return `GSTIN starts with an unknown state code (${gstin.slice(0, 2)}).`;
  }
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) {
    return "GSTIN checksum does not match — please re-check the number.";
  }
  return null;
}

export function isValidGstin(raw: string): boolean {
  return gstinError(normalizeGstin(raw)) === null;
}

/** PAN embedded in a GSTIN (characters 3–12). */
export function panFromGstin(gstin: string): string {
  return gstin.slice(2, 12);
}

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------

/**
 * Normalises an Indian phone number to "+91XXXXXXXXXX".
 * Returns null when the input is not an acceptable Indian number.
 */
export function normalizeIndianPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\+?[0-9\s\-().]+$/.test(trimmed)) return null;
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/[^0-9]/g, "");

  if (hasPlus) {
    if (!digits.startsWith("91")) return null;
    digits = digits.slice(2);
  } else if (digits.startsWith("0091") && digits.length === 14) {
    digits = digits.slice(4);
  } else if (digits.startsWith("91") && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }

  if (!/^[1-9][0-9]{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

export function isIndianMobile(normalized: string): boolean {
  return /^\+91[6-9][0-9]{9}$/.test(normalized);
}

/** "+919876543210" → "+91 98765 43210"; other values returned unchanged. */
export function formatIndianPhone(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^\+91([0-9]{5})([0-9]{5})$/.exec(value);
  return m ? `+91 ${m[1]} ${m[2]}` : value;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

export const SUPPLIER_TEXT_FIELDS = [
  "tradeName",
  "businessEntityType",
  "gstin",
  "pan",
  "state",
  "stateCode",
  "contactPerson",
  "phone",
  "alternatePhone",
  "email",
  "address",
  "city",
  "pincode",
  "dispatchAddress",
  "notes",
] as const;

export type SupplierTextField = (typeof SUPPLIER_TEXT_FIELDS)[number];

/** All profile fields that are written/audited (excluding id/timestamps). */
export const SUPPLIER_PROFILE_FIELDS = [
  "name",
  ...SUPPLIER_TEXT_FIELDS,
  "isActive",
] as const;

export type SupplierProfileField = (typeof SUPPLIER_PROFILE_FIELDS)[number];

export type NormalizedSupplierInput = {
  name?: string;
  isActive?: boolean;
} & { [K in SupplierTextField]?: string | null };

export type SupplierFieldErrors = Partial<Record<SupplierProfileField | "_form", string>>;

export type SupplierValidationResult =
  | { ok: true; data: NormalizedSupplierInput }
  | { ok: false; errors: Record<string, string> };

const MAX_LEN: Record<string, number> = {
  name: 120,
  tradeName: 120,
  contactPerson: 120,
  city: 80,
  address: 500,
  dispatchAddress: 500,
  notes: 1000,
};

const FIELD_LABEL: Record<string, string> = {
  name: "Supplier name",
  tradeName: "Trade name",
  contactPerson: "Contact person",
  city: "City",
  address: "Registered address",
  dispatchAddress: "Dispatch address",
  notes: "Notes",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

/**
 * Validates and normalises supplier input.
 *
 * - create: `name` is required; every other field is optional.
 * - update: only keys present in `raw` are validated/returned. `undefined`
 *   (key absent) leaves the column untouched; `null` or `""` clears it —
 *   except `name`, which can never be cleared.
 *
 * Empty strings become `null`. Unknown keys are ignored.
 */
export function validateSupplierInput(
  raw: unknown,
  mode: "create" | "update"
): SupplierValidationResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: { _form: "Invalid supplier payload." } };
  }
  const src = raw as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const data: NormalizedSupplierInput = {};
  const has = (key: string) =>
    Object.prototype.hasOwnProperty.call(src, key) && src[key] !== undefined;

  /** Reads a text field: undefined = absent, null = cleared, string = trimmed value. */
  const readText = (key: string): string | null | undefined => {
    if (!has(key)) return undefined;
    const value = src[key];
    if (value === null) return null;
    if (typeof value === "number") return String(value);
    if (typeof value !== "string") {
      errors[key] = "Must be text.";
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  };

  // --- name ---------------------------------------------------------------
  if (mode === "create" || has("name")) {
    const name = readText("name");
    if (!errors.name) {
      if (name == null) {
        errors.name = "Supplier name is required.";
      } else {
        const collapsed = name.replace(/\s+/g, " ");
        if (collapsed.length < 2) {
          errors.name = "Supplier name must be at least 2 characters.";
        } else if (collapsed.length > MAX_LEN.name) {
          errors.name = `Supplier name must be at most ${MAX_LEN.name} characters.`;
        } else {
          data.name = collapsed;
        }
      }
    }
  }

  // --- simple length-limited text ----------------------------------------
  for (const key of [
    "tradeName",
    "contactPerson",
    "city",
    "address",
    "dispatchAddress",
    "notes",
  ] as const) {
    const value = readText(key);
    if (value === undefined || errors[key]) continue;
    if (value !== null && value.length > MAX_LEN[key]) {
      errors[key] = `${FIELD_LABEL[key]} must be at most ${MAX_LEN[key]} characters.`;
      continue;
    }
    data[key] = value;
  }

  // --- business entity ---------------------------------------------------
  {
    const value = readText("businessEntityType");
    if (value !== undefined && !errors.businessEntityType) {
      if (value === null) {
        data.businessEntityType = null;
      } else {
        const upper = value.toUpperCase();
        if (SUPPLIER_ENTITY_TYPES.some((t) => t.value === upper)) {
          data.businessEntityType = upper;
        } else {
          errors.businessEntityType = "Choose a valid business entity type.";
        }
      }
    }
  }

  // --- email ---------------------------------------------------------------
  {
    const value = readText("email");
    if (value !== undefined && !errors.email) {
      if (value === null) {
        data.email = null;
      } else if (value.length > 254 || !EMAIL_PATTERN.test(value)) {
        errors.email = "Enter a valid email address.";
      } else {
        data.email = value.toLowerCase();
      }
    }
  }

  // --- phones -------------------------------------------------------------
  for (const key of ["phone", "alternatePhone"] as const) {
    const value = readText(key);
    if (value === undefined || errors[key]) continue;
    if (value === null) {
      data[key] = null;
      continue;
    }
    const normalized = normalizeIndianPhone(value);
    if (!normalized) {
      errors[key] =
        "Enter a valid Indian phone number (10-digit mobile or landline with STD code).";
    } else {
      data[key] = normalized;
    }
  }
  if (
    data.phone &&
    data.alternatePhone &&
    data.phone === data.alternatePhone &&
    !errors.alternatePhone
  ) {
    errors.alternatePhone = "Alternate phone must differ from the primary phone.";
  }

  // --- pincode -------------------------------------------------------------
  {
    const value = readText("pincode");
    if (value !== undefined && !errors.pincode) {
      if (value === null) {
        data.pincode = null;
      } else {
        const compact = value.replace(/\s+/g, "");
        if (PINCODE_PATTERN.test(compact)) data.pincode = compact;
        else errors.pincode = "PIN code must be 6 digits and cannot start with 0.";
      }
    }
  }

  // --- state / stateCode -------------------------------------------------
  let stateFromName: IndianState | null | undefined = undefined;
  let stateFromCode: IndianState | null | undefined = undefined;
  {
    const stateRaw = readText("state");
    if (stateRaw !== undefined && !errors.state) {
      if (stateRaw === null) {
        stateFromName = null;
      } else {
        const match = findStateByName(stateRaw);
        if (!match) errors.state = "Choose a valid Indian state or union territory.";
        else stateFromName = match;
      }
    }
    const codeRaw = readText("stateCode");
    if (codeRaw !== undefined && !errors.stateCode) {
      if (codeRaw === null) {
        stateFromCode = null;
      } else if (!/^[0-9]{1,2}$/.test(codeRaw) || !findStateByCode(codeRaw)) {
        errors.stateCode = "Unknown GST state code.";
      } else {
        stateFromCode = findStateByCode(codeRaw);
      }
    }
    if (
      stateFromName &&
      stateFromCode &&
      stateFromName.code !== stateFromCode.code &&
      !errors.state
    ) {
      errors.stateCode = `State code does not match ${stateFromName.name} (${stateFromName.code}).`;
    }
  }
  const selectedState = stateFromName ?? stateFromCode ?? null;
  const stateTouched = stateFromName !== undefined || stateFromCode !== undefined;
  if (stateTouched && !errors.state && !errors.stateCode) {
    data.state = selectedState ? selectedState.name : null;
    data.stateCode = selectedState ? selectedState.code : null;
  }

  // --- GSTIN -----------------------------------------------------------------
  {
    const value = readText("gstin");
    if (value !== undefined && !errors.gstin) {
      if (value === null) {
        data.gstin = null;
      } else {
        const gstin = normalizeGstin(value);
        const err = gstinError(gstin);
        if (err) {
          errors.gstin = err;
        } else {
          data.gstin = gstin;
          const gstState = findStateByCode(gstin.slice(0, 2))!;
          if (selectedState) {
            if (selectedState.code !== gstState.code && !errors.state) {
              errors.gstin = `GSTIN is registered in ${gstState.name} (${gstin.slice(0, 2)}) but the selected state is ${selectedState.name} (${selectedState.code}).`;
            }
          } else if (!errors.state && !errors.stateCode) {
            data.state = gstState.name;
            data.stateCode = gstState.code;
          }
        }
      }
    }
  }

  // --- PAN -------------------------------------------------------------------
  {
    const value = readText("pan");
    if (value !== undefined && !errors.pan) {
      if (value === null) {
        data.pan = null;
      } else {
        const pan = value.replace(/\s+/g, "").toUpperCase();
        if (!PAN_PATTERN.test(pan)) {
          errors.pan = "PAN format is invalid (e.g. ABCDE1234F).";
        } else if (data.gstin && panFromGstin(data.gstin) !== pan) {
          errors.pan = `PAN must match the GSTIN (expected ${panFromGstin(data.gstin)}).`;
        } else {
          data.pan = pan;
        }
      }
    }
  }

  // --- isActive (update only) -----------------------------------------------
  if (mode === "update" && has("isActive")) {
    if (typeof src.isActive === "boolean") data.isActive = src.isActive;
    else errors.isActive = "isActive must be true or false.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data };
}

/**
 * Cross-field consistency on the merged (stored + incoming) record. Used on
 * update so that, e.g., changing only the state is still checked against the
 * stored GSTIN. Returns field errors keyed by the field the user should fix.
 */
export function checkSupplierConsistency(merged: {
  gstin?: string | null;
  pan?: string | null;
  stateCode?: string | null;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const gstin = merged.gstin ? normalizeGstin(merged.gstin) : null;
  if (!gstin || gstinError(gstin)) return errors;
  const gstState = findStateByCode(gstin.slice(0, 2));
  const selected = findStateByCode(merged.stateCode);
  if (gstState && selected && gstState.code !== selected.code) {
    errors.state = `Selected state does not match the GSTIN state (${gstState.name}).`;
  }
  if (merged.pan && merged.pan.toUpperCase() !== panFromGstin(gstin)) {
    errors.pan = `PAN must match the GSTIN (expected ${panFromGstin(gstin)}).`;
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

type AddressLike = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
};

/** Registered address as display lines (empty array when nothing stored). */
export function formatSupplierAddress(s: AddressLike): string[] {
  const lines = (s.address ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const cityState = [s.city?.trim(), s.state?.trim()].filter(Boolean).join(", ");
  const last = [cityState, s.pincode?.trim()].filter(Boolean).join(" – ");
  if (last) lines.push(last);
  return lines;
}

/** "Trade name (Legal name)" when both exist and differ, else the legal name. */
export function supplierDisplayName(s: {
  name: string;
  tradeName?: string | null;
}): string {
  const trade = s.tradeName?.trim();
  if (trade && trade.toLowerCase() !== s.name.trim().toLowerCase()) {
    return `${trade} (${s.name})`;
  }
  return s.name;
}
