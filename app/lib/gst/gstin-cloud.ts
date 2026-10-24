/**
 * GSTIN.cloud client — stubbed until client account is approved (Maulik 23 Oct).
 * Set GSTIN_CLOUD_DEV_MODE=1 (default when OTP_DEV_MODE) to return mock results.
 */

export type GstinCloudResult = {
  gstin: string;
  status: "ACTIVE" | "INACTIVE" | "INVALID" | "ERROR";
  legalName?: string;
  tradeName?: string;
  state?: string;
  raw: unknown;
};

const GSTIN_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;

export function isValidGstinFormat(gstin: string): boolean {
  return GSTIN_REGEX.test(gstin.trim());
}

export function isGstinCloudDevMode(): boolean {
  const v = process.env.GSTIN_CLOUD_DEV_MODE?.trim().toLowerCase();
  if (v === "0" || v === "false") return false;
  if (v === "1" || v === "true" || v === "yes") return true;
  const otp = process.env.OTP_DEV_MODE?.trim().toLowerCase();
  return otp === "1" || otp === "true" || otp === "yes";
}

function mockVerify(gstin: string): GstinCloudResult {
  const normalized = gstin.trim().toUpperCase();
  if (!isValidGstinFormat(normalized)) {
    return {
      gstin: normalized,
      status: "INVALID",
      raw: { mock: true, reason: "format" },
    };
  }
  // Deterministic mock: GSTINs ending in "Z5" → ACTIVE, "Z1" → INACTIVE, else ACTIVE.
  const lastTwo = normalized.slice(-2);
  const status =
    lastTwo === "Z1" ? "INACTIVE" : lastTwo === "ZX" ? "ERROR" : "ACTIVE";
  return {
    gstin: normalized,
    status: status === "ERROR" ? "ERROR" : status,
    legalName: status === "ACTIVE" ? "MOCK LEGAL BUSINESS PVT LTD" : undefined,
    tradeName: status === "ACTIVE" ? "Mock Trade" : undefined,
    state: normalized.slice(0, 2),
    raw: { mock: true, provider: "GSTIN_CLOUD_DEV" },
  };
}

/**
 * On-demand GSTIN check. Never call from signup/OTP — Admin Verify button only.
 */
export async function verifyGstinCloud(gstin: string): Promise<GstinCloudResult> {
  const normalized = gstin.trim().toUpperCase();
  if (!isValidGstinFormat(normalized)) {
    return {
      gstin: normalized,
      status: "INVALID",
      raw: { reason: "invalid_format" },
    };
  }

  if (isGstinCloudDevMode()) {
    console.info(`[gstin:dev] verify ${normalized}`);
    return mockVerify(normalized);
  }

  const apiKey = process.env.GSTIN_CLOUD_API_KEY?.trim();
  const base =
    process.env.GSTIN_CLOUD_BASE_URL?.trim() || "https://gstin.cloud/api/v1";
  if (!apiKey) {
    return {
      gstin: normalized,
      status: "ERROR",
      raw: { error: "GSTIN_CLOUD_API_KEY not configured" },
    };
  }

  try {
    const res = await fetch(`${base}/verify/${encodeURIComponent(normalized)}`, {
      method: "GET",
      headers: { "X-API-Key": apiKey },
      cache: "no-store",
    });
    const body = (await res.json()) as {
      success?: boolean;
      data?: {
        gstin?: string;
        legal_name?: string;
        trade_name?: string;
        status?: string;
        state?: string;
      };
      error?: string;
    };

    if (!res.ok || !body.success || !body.data) {
      return {
        gstin: normalized,
        status: "ERROR",
        raw: body,
      };
    }

    const portalStatus = String(body.data.status ?? "").toLowerCase();
    let status: GstinCloudResult["status"] = "ACTIVE";
    if (portalStatus.includes("cancel") || portalStatus.includes("inactive")) {
      status = "INACTIVE";
    } else if (portalStatus.includes("invalid")) {
      status = "INVALID";
    }

    return {
      gstin: body.data.gstin ?? normalized,
      status,
      legalName: body.data.legal_name,
      tradeName: body.data.trade_name,
      state: body.data.state,
      raw: body,
    };
  } catch (error) {
    return {
      gstin: normalized,
      status: "ERROR",
      raw: {
        error: error instanceof Error ? error.message : "provider_error",
      },
    };
  }
}
