/** Supplier address formatting for PO documents — pure, client-safe. */

export type SupplierAddressInput = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
  pincode?: string | null;
};

export function formatSupplierAddressLines(supplier: SupplierAddressInput): string[] {
  const lines: string[] = [];
  for (const part of (supplier.address ?? "").split(/\r?\n/)) {
    const trimmed = part.trim();
    if (trimmed) lines.push(trimmed);
  }
  const cityLine = [supplier.city?.trim(), supplier.pincode?.trim()]
    .filter(Boolean)
    .join(" - ");
  if (cityLine) lines.push(cityLine);
  const state = supplier.state?.trim();
  if (state) {
    lines.push(supplier.stateCode?.trim() ? `${state} (${supplier.stateCode.trim()})` : state);
  }
  return lines;
}
