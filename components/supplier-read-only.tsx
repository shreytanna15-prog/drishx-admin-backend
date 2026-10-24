import type { ReactNode } from "react";
import type { AdminSupplier } from "@/app/lib/admin-suppliers";
import {
  formatIndianPhone,
  formatSupplierAddress,
  supplierEntityTypeLabel,
} from "@/app/lib/supplier-profile";
import { cardClass, labelClass } from "@/components/supplier-ui";

export function SupplierReadOnly({ supplier }: { supplier: AdminSupplier }) {
  const address = formatSupplierAddress(supplier);
  const rows: { label: string; value: ReactNode }[] = [
    { label: "Legal name", value: supplier.name },
    { label: "Trade name", value: supplier.tradeName },
    { label: "Business entity", value: supplierEntityTypeLabel(supplier.businessEntityType) },
    { label: "Status", value: supplier.isActive ? "Active" : "Inactive" },
    { label: "GSTIN", value: supplier.gstin },
    { label: "PAN", value: supplier.pan },
    {
      label: "State",
      value: supplier.state
        ? `${supplier.state}${supplier.stateCode ? ` (${supplier.stateCode})` : ""}`
        : null,
    },
    { label: "Contact person", value: supplier.contactPerson },
    { label: "Phone", value: supplier.phone ? formatIndianPhone(supplier.phone) : null },
    {
      label: "Alternate phone",
      value: supplier.alternatePhone ? formatIndianPhone(supplier.alternatePhone) : null,
    },
    { label: "Email", value: supplier.email },
    {
      label: "Registered address",
      value: address.length ? (
        <span className="whitespace-pre-line">{address.join("\n")}</span>
      ) : null,
    },
    {
      label: "Dispatch address",
      value: supplier.dispatchAddress ? (
        <span className="whitespace-pre-line">{supplier.dispatchAddress}</span>
      ) : null,
    },
    { label: "Open purchase orders", value: supplier.openPoCount ?? null },
    {
      label: "Notes",
      value: supplier.notes ? (
        <span className="whitespace-pre-line">{supplier.notes}</span>
      ) : null,
    },
  ];
  return (
    <dl
      className={`${cardClass} mx-auto max-w-3xl divide-y divide-(--brand-card-border) overflow-hidden`}
    >
      {rows.map((row) => (
        <div key={row.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
          <dt className={labelClass}>{row.label}</dt>
          <dd className="text-sm break-words text-(--brand-text)">
            {row.value === null || row.value === undefined || row.value === "" ? (
              <span className="text-(--brand-text-muted)">—</span>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
