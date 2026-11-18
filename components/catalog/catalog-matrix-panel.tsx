"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  buildCatalogMatrix,
  toCatalogMatrixVariants,
  type CatalogMatrixFamilyCaps,
  type CatalogMatrixSheet,
  type CatalogMatrixStubColumn,
} from "@/app/lib/catalog/catalog-matrix";
import { cn } from "@/lib/utils";

const PLACEHOLDER = "_ / _ / _";

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

function sheetMatchesAxis(sheet: CatalogMatrixSheet, axis: number): boolean {
  return sheet.rows.some((row) => {
    const raw = row.stub.axis;
    if (raw == null || raw === "—") return false;
    const n = Number(raw);
    return Number.isFinite(n) && Math.abs(n - axis) < 1e-9;
  });
}

export function CatalogMatrixPanel({
  variants,
  family,
  familyLabel,
  highlightAxis,
  className,
}: {
  variants: VariantLike[];
  family: CatalogMatrixFamilyCaps;
  familyLabel?: string | null;
  /** From list deep-link `?axis=` — scroll/highlight matching sheets. */
  highlightAxis?: number | null;
  className?: string;
}) {
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const model = useMemo(
    () =>
      buildCatalogMatrix(
        toCatalogMatrixVariants(variants),
        {
          supportsAdd: family.supportsAdd,
          supportsAxis: family.supportsAxis,
          supportsEye: family.supportsEye,
        },
        { familyLabel }
      ),
    [
      variants,
      family.supportsAdd,
      family.supportsAxis,
      family.supportsEye,
      familyLabel,
    ]
  );

  const sheets = useMemo(() => {
    if (highlightAxis == null) return model.sheets;
    // Selected axis first so deep-link doesn't open on a different axis sheet.
    const matched: CatalogMatrixSheet[] = [];
    const rest: CatalogMatrixSheet[] = [];
    for (const sheet of model.sheets) {
      if (sheetMatchesAxis(sheet, highlightAxis)) matched.push(sheet);
      else rest.push(sheet);
    }
    return [...matched, ...rest];
  }, [model.sheets, highlightAxis]);

  const panelRef = useRef<HTMLElement | null>(null);
  const firstHighlightKey = useMemo(() => {
    if (highlightAxis == null) return null;
    return (
      sheets.find((sheet) => sheetMatchesAxis(sheet, highlightAxis))?.key ??
      null
    );
  }, [sheets, highlightAxis]);

  useEffect(() => {
    if (highlightAxis == null) return;
    // Land flush on the selected-axis sheet so Attributes above is fully
    // scrolled off-screen (no partial "Digital" peek under the chrome).
    const timer = window.setTimeout(() => {
      const target =
        highlightRef.current ??
        panelRef.current ??
        document.getElementById("matrix");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [highlightAxis, firstHighlightKey, sheets.length]);

  if (sheets.length === 0) {
    return (
      <section
        id="matrix"
        ref={panelRef}
        className={cn(
          "rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5",
          className
        )}
      >
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
          Power matrix
        </h2>
        <p className="text-sm text-(--brand-text-muted)">
          Add variants to see the family power matrix.
        </p>
      </section>
    );
  }

  return (
    <section
      id="matrix"
      ref={panelRef}
        className={cn(
          "rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5",
          className
        )}
    >
      <div className="mb-4">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
          Power matrix
        </h2>
        <p className="mt-1 text-xs text-(--brand-text-muted)">
          Cells: Current / Threshold / Target — placeholders until stock is
          live.
        </p>
        {highlightAxis != null ? (
          <div className="mt-3 rounded-xl border-2 border-(--brand-primary) bg-(--brand-primary)/20 px-3 py-2 text-sm font-bold text-(--brand-text)">
            Axis {highlightAxis}°
          </div>
        ) : null}
      </div>

      <div className="space-y-6">
        {sheets.map((sheet) => {
          const match =
            highlightAxis != null && sheetMatchesAxis(sheet, highlightAxis);
          const dimOthers = highlightAxis != null && !match;
          const isScrollTarget = sheet.key === firstHighlightKey;
          return (
            <div
              key={sheet.key}
              ref={isScrollTarget ? highlightRef : undefined}
              className={cn(
                "rounded-xl transition-opacity",
                isScrollTarget && "scroll-mt-28",
                match &&
                  "border-2 border-(--brand-primary) bg-(--brand-primary)/10 p-1 shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand-primary)_35%,transparent)]",
                dimOthers && "opacity-40"
              )}
            >
              <CatalogMatrixTable sheet={sheet} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function stubLeft(
  sheet: CatalogMatrixSheet,
  index: number
): { left: number; width: number } {
  let left = 0;
  for (let i = 0; i < index; i += 1) {
    left += STUB_WIDTH[sheet.stubColumns[i]!.key];
  }
  return { left, width: STUB_WIDTH[sheet.stubColumns[index]!.key] };
}

function CatalogMatrixTable({ sheet }: { sheet: CatalogMatrixSheet }) {
  if (sheet.rows.length === 0 || sheet.dataColumns.length === 0) {
    return (
      <div className="rounded-xl border border-(--brand-card-border) p-4">
        <h3 className="text-xs font-extrabold uppercase tracking-[0.12em] text-(--brand-primary)">
          {sheet.title}
        </h3>
        <p className="mt-1 text-xs text-(--brand-text-muted)">
          No powers to display for this sheet.
        </p>
      </div>
    );
  }

  const dataWidth = sheet.dataAxis === "cyl" ? 56 : 92;

  return (
    <div className="overflow-hidden rounded-xl border border-(--brand-card-border)">
      <div className="border-b border-(--brand-card-border) bg-(--brand-input-bg)/40 px-3 py-2">
        <h3 className="text-xs font-extrabold uppercase tracking-[0.12em] text-(--brand-primary)">
          {sheet.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-(--brand-text-muted)">
          {sheet.subtitle}
        </p>
      </div>

      <div className="max-h-[70vh] overflow-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20">
            <tr>
              {sheet.stubColumns.map((stub, index) => {
                const { left, width } = stubLeft(sheet, index);
                return (
                  <th
                    key={stub.key}
                    scope="col"
                    className="sticky z-30 border border-(--brand-card-border) bg-(--brand-input-bg) px-2 py-1.5 text-left font-bold whitespace-nowrap text-(--brand-label)"
                    style={{ left, top: 0, width, minWidth: width }}
                  >
                    {stub.label}
                  </th>
                );
              })}
              {sheet.dataColumns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="border border-(--brand-card-border) bg-(--brand-input-bg) px-2 py-1.5 font-bold whitespace-nowrap text-(--brand-label)"
                  style={{ top: 0, minWidth: dataWidth }}
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
                {sheet.dataColumns.map((column) => {
                  const cell = row.cells[column.key];
                  const present = Boolean(cell?.present);
                  return (
                    <td
                      key={column.key}
                      className={cn(
                        "border border-(--brand-card-border) px-2 py-1 text-center tabular-nums",
                        present
                          ? "text-(--brand-text-muted)"
                          : "text-(--brand-text-muted)/30"
                      )}
                      style={{ minWidth: dataWidth }}
                      title={
                        present && cell?.variantId
                          ? `Variant ${cell.variantId}`
                          : undefined
                      }
                    >
                      {present ? PLACEHOLDER : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
