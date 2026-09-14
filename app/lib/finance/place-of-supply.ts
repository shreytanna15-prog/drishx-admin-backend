/** Place of supply → CGST+SGST (intra) vs IGST (inter). */

const STATE_CODES: Record<string, string> = {
  "andaman and nicobar islands": "35",
  "andhra pradesh": "37",
  "arunachal pradesh": "12",
  assam: "18",
  bihar: "10",
  chandigarh: "04",
  chhattisgarh: "22",
  delhi: "07",
  goa: "30",
  gujarat: "24",
  haryana: "06",
  "himachal pradesh": "02",
  "jammu and kashmir": "01",
  jharkhand: "20",
  karnataka: "29",
  kerala: "32",
  ladakh: "38",
  lakshadweep: "31",
  "madhya pradesh": "23",
  maharashtra: "27",
  manipur: "14",
  meghalaya: "17",
  mizoram: "15",
  nagaland: "13",
  odisha: "21",
  puducherry: "34",
  punjab: "03",
  rajasthan: "08",
  sikkim: "11",
  "tamil nadu": "33",
  telangana: "36",
  tripura: "16",
  "uttar pradesh": "09",
  uttarakhand: "05",
  "west bengal": "19",
};

export function normalizeStateName(state: string | null | undefined): string {
  return (state ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function stateCodeFromName(state: string | null | undefined): string | null {
  const key = normalizeStateName(state);
  if (!key) return null;
  return STATE_CODES[key] ?? null;
}

export type PlaceOfSupplyResult = {
  placeOfSupplyState: string;
  placeOfSupplyCode: string;
  isInterState: boolean;
};

export function resolvePlaceOfSupply(input: {
  companyState: string;
  companyStateCode?: string | null;
  customerBillingState?: string | null;
  customerBillingGstState?: string | null;
  customerGstRegistrationState?: string | null;
}): PlaceOfSupplyResult {
  const posState =
    input.customerBillingState?.trim() ||
    input.customerBillingGstState?.trim() ||
    input.customerGstRegistrationState?.trim() ||
    input.companyState;

  const companyCode =
    input.companyStateCode?.trim() ||
    stateCodeFromName(input.companyState) ||
    "";
  const posCode = stateCodeFromName(posState) || companyCode;

  const isInterState =
    Boolean(companyCode) &&
    Boolean(posCode) &&
    companyCode !== posCode;

  return {
    placeOfSupplyState: posState,
    placeOfSupplyCode: posCode,
    isInterState,
  };
}
