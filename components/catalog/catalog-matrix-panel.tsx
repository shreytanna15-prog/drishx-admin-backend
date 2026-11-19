"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  buildCatalogMatrix,
  toCatalogMatrixVariants,
  type CatalogMatrixCell,
  type CatalogMatrixFamilyCaps,
  type CatalogMatrixSheet,
  type CatalogMatrixStubColumn,
} from "@/app/lib/catalog/catalog-matrix";
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
  /** When true, Threshold/Target inputs are enabled (stock phase). */
  editable = false,
}: {
  variants: VariantLike[];
  family: CatalogMatrixFamilyCaps;
  familyLabel?: string | null;
  /** From list deep-link `?axis=` — scroll/highlight matching sheets. */
  highlightAxis?: number | null;
  className?: string;
  editable?: boolean;
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
          Cells: Current / Threshold / Target
          {editable
            ? ". Threshold and Target are editable; Current is read-only."
            : ". Triad boxes are ready; Threshold/Target save with stock leaf."}
          {" "}
          Cross sheet keeps the full +SPH/−CYL grid — gap-fail cells are disabled.
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
              <CatalogMatrixTable sheet={sheet} editable={editable} />
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

function CatalogMatrixTable({
  sheet,
  editable,
}: {
  sheet: CatalogMatrixSheet;
  editable: boolean;
}) {
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

  const dataWidth = sheet.dataAxis === "cyl" ? 108 : 118;

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

      <div className="thin-scrollbar max-h-[70vh] overflow-auto">
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
                  return (
                    <td
                      key={column.key}
                      className="border border-(--brand-card-border) p-1 align-middle"
                      style={{ minWidth: dataWidth }}
                    >
                      <MatrixTriadCell
                        cell={cell}
                        editable={editable}
                        sheetKind={sheet.kind}
                      />
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

function MatrixTriadCell({
  cell,
  editable,
  sheetKind,
}: {
  cell: CatalogMatrixCell | undefined;
  editable: boolean;
  sheetKind: CatalogMatrixSheet["kind"];
}) {
  if (!cell || !cell.allowed) {
    return (
      <div
        className="flex h-9 items-center justify-center rounded-md bg-(--brand-input-bg)/50 text-(--brand-text-muted)/40"
        title={
          sheetKind === "cross" || sheetKind === "sph-cyl"
            ? "Cross gap rule: |CYL| − SPH must be ≥ 0.25 — not editable"
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

  if (!cell.present) {
    return (
      <div
        className="h-9 rounded-md"
        aria-label="No variant covers this power"
      />
    );
  }

  const canEditThreshold = editable;
  const powerHint = [
    `SPH ${cell.cellKey.sph.toFixed(2)}`,
    `CYL ${cell.cellKey.cyl.toFixed(2)}`,
    cell.variantId ? `Variant ${cell.variantId}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="flex h-9 items-center justify-center gap-0.5 rounded-md border border-dashed border-(--brand-card-border) px-1"
      title={powerHint}
    >
      <span
        className="min-w-6 rounded bg-(--brand-input-bg) px-1 py-0.5 text-center text-[11px] font-semibold tabular-nums text-(--brand-text-muted)"
        aria-label="Current stock (read-only)"
      >
        –
      </span>
      <span className="text-(--brand-text-muted)/50">/</span>
      <input
        inputMode="numeric"
        defaultValue=""
        placeholder="–"
        disabled={!canEditThreshold}
        readOnly={!canEditThreshold}
        aria-label={`Threshold for ${powerHint}`}
        className={cn(
          "h-6 w-8 rounded border border-(--brand-card-border) bg-(--brand-card) px-0.5 text-center text-[11px] tabular-nums text-(--brand-text)",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
          "disabled:cursor-not-allowed disabled:opacity-60"
        )}
      />
      <span className="text-(--brand-text-muted)/50">/</span>
      <input
        inputMode="numeric"
        defaultValue=""
        placeholder="–"
        disabled={!canEditThreshold}
        readOnly={!canEditThreshold}
        aria-label={`Target for ${powerHint}`}
        className={cn(
          "h-6 w-8 rounded border border-(--brand-card-border) bg-(--brand-card) px-0.5 text-center text-[11px] tabular-nums text-(--brand-text)",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
          "disabled:cursor-not-allowed disabled:opacity-60"
        )}
      />
    </div>
  );
}
