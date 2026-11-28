"use client";

import { useMemo } from "react";
import {
  buildCatalogMatrix,
  toCatalogMatrixVariants,
  type CatalogMatrixCell,
  type CatalogMatrixFamilyCaps,
  type CatalogMatrixSheet,
  type CatalogMatrixStubColumn,
} from "@/app/lib/catalog/catalog-matrix";
import { encodeStockLeafKey } from "@/app/lib/catalog/lens-product-stock-core";
import { cn } from "@/lib/utils";

const STUB_WIDTH: Record<CatalogMatrixStubColumn["key"], number> = {
  sph: 68,
  cyl: 68,
  axis: 56,
};

type VariantLike = {
  id: string;
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  axis: number | null;
  eye: string | null;
  addition?: { value: number | null } | null;
  addMin?: number | null;
};

export type PowerWiseLeafView = {
  onHand: number;
  reserved: number;
  available: number;
  blocked: number;
};

function stubLeft(sheet: CatalogMatrixSheet, index: number) {
  let left = 0;
  for (let i = 0; i < index; i++) {
    left += STUB_WIDTH[sheet.stubColumns[i]!.key];
  }
  return { left, width: STUB_WIDTH[sheet.stubColumns[index]!.key] };
}

export function PowerWiseMatrixPanel({
  variants,
  family,
  familyLabel,
  className,
  stockLeaves,
}: {
  variants: VariantLike[];
  family: CatalogMatrixFamilyCaps;
  familyLabel?: string | null;
  className?: string;
  stockLeaves?: Record<string, PowerWiseLeafView>;
}) {
  const model = useMemo(
    () =>
      buildCatalogMatrix(toCatalogMatrixVariants(variants), family, {
        familyLabel,
      }),
    [variants, family, familyLabel]
  );

  if (model.sheets.length === 0) {
    return (
      <div className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) px-6 py-10 text-center text-sm text-(--brand-text-muted)">
        No power matrix coverage for this variant.
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <p className="text-xs text-(--brand-text-muted)">
        Each cell shows On-hand / Reserved / Available / Blocked. Missing stock
        leaves show 0. Cross-gap cells stay ×.
      </p>
      {model.sheets.map((sheet) => (
        <PowerWiseSheet
          key={sheet.key}
          sheet={sheet}
          stockLeaves={stockLeaves}
        />
      ))}
    </div>
  );
}

function PowerWiseSheet({
  sheet,
  stockLeaves,
}: {
  sheet: CatalogMatrixSheet;
  stockLeaves?: Record<string, PowerWiseLeafView>;
}) {
  const dataWidth = 108;

  return (
    <div className="overflow-hidden rounded-xl border border-(--brand-card-border) bg-(--brand-card)">
      <div className="border-b border-(--brand-card-border) px-4 py-2.5">
        <h3 className="text-sm font-semibold text-(--brand-text)">
          {sheet.title}
        </h3>
        {sheet.subtitle ? (
          <p className="text-xs text-(--brand-text-muted)">{sheet.subtitle}</p>
        ) : null}
      </div>
      <div className="overflow-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-(--brand-input-bg)/40">
              {sheet.stubColumns.map((stub, index) => {
                const { left, width } = stubLeft(sheet, index);
                return (
                  <th
                    key={stub.key}
                    className="sticky top-0 z-20 border border-(--brand-card-border) bg-(--brand-card) px-2 py-1.5 text-left font-semibold text-(--brand-text)"
                    style={{ left, width, minWidth: width }}
                  >
                    {stub.label}
                  </th>
                );
              })}
              {sheet.dataColumns.map((column) => (
                <th
                  key={column.key}
                  className="sticky top-0 z-10 border border-(--brand-card-border) bg-(--brand-card) px-1 py-1.5 text-center font-semibold text-(--brand-text)"
                  style={{ minWidth: dataWidth }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row) => (
              <tr
                key={row.key}
                className="odd:bg-(--brand-input-bg)/20 hover:bg-(--brand-primary)/5"
              >
                {sheet.stubColumns.map((stub, index) => {
                  const { left, width } = stubLeft(sheet, index);
                  return (
                    <td
                      key={stub.key}
                      className="sticky z-10 border border-(--brand-card-border) bg-(--brand-card) px-2 py-1 font-semibold whitespace-nowrap text-(--brand-text)"
                      style={{ left, width, minWidth: width }}
                    >
                      {row.stub[stub.key] ?? "—"}
                    </td>
                  );
                })}
                {sheet.dataColumns.map((column) => (
                  <td
                    key={column.key}
                    className="border border-(--brand-card-border) p-1 align-middle"
                    style={{ minWidth: dataWidth }}
                  >
                    <PowerWiseCell
                      cell={row.cells[column.key]}
                      sheetKind={sheet.kind}
                      stockLeaves={stockLeaves}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PowerWiseCell({
  cell,
  sheetKind,
  stockLeaves,
}: {
  cell: CatalogMatrixCell | undefined;
  sheetKind: CatalogMatrixSheet["kind"];
  stockLeaves?: Record<string, PowerWiseLeafView>;
}) {
  if (!cell || !cell.allowed) {
    return (
      <div
        className="flex h-12 items-center justify-center rounded-md bg-(--brand-input-bg)/50 text-(--brand-text-muted)/40"
        title={
          sheetKind === "cross" || sheetKind === "sph-cyl"
            ? "Cross gap rule — not a stocked power"
            : "Not an allowed power combo"
        }
        aria-label="Disabled power cell"
      >
        <span className="text-sm font-bold" aria-hidden>
          ×
        </span>
      </div>
    );
  }

  if (!cell.present || !cell.variantId) {
    return (
      <div
        className="h-12 rounded-md"
        aria-label="No variant covers this power"
      />
    );
  }

  const leafKey = encodeStockLeafKey(
    cell.variantId,
    cell.cellKey.sph,
    cell.cellKey.cyl
  );
  const leaf = stockLeaves?.[leafKey] ?? {
    onHand: 0,
    reserved: 0,
    available: 0,
    blocked: 0,
  };
  const powerHint = [
    `SPH ${cell.cellKey.sph.toFixed(2)}`,
    `CYL ${cell.cellKey.cyl.toFixed(2)}`,
    `OH ${leaf.onHand}`,
    `R ${leaf.reserved}`,
    `Av ${leaf.available}`,
    `Bl ${leaf.blocked}`,
  ].join(" · ");

  return (
    <div
      className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-md border border-(--brand-card-border) bg-(--brand-bg)/40 px-1 py-0.5"
      title={powerHint}
    >
      <div className="flex items-center gap-1 tabular-nums">
        <span className="text-[11px] font-bold text-(--brand-text)">
          {leaf.onHand}
        </span>
        <span className="text-(--brand-text-muted)/40">/</span>
        <span className="text-[11px] font-semibold text-(--brand-text-muted)">
          {leaf.reserved}
        </span>
      </div>
      <div className="flex items-center gap-1 tabular-nums">
        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
          {leaf.available}
        </span>
        <span className="text-(--brand-text-muted)/40">/</span>
        <span className="text-[11px] font-semibold text-rose-700/80 dark:text-rose-400/80">
          {leaf.blocked}
        </span>
      </div>
    </div>
  );
}
