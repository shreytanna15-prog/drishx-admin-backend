"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildCatalogMatrix,
  toCatalogMatrixVariants,
  type CatalogMatrixCell,
  type CatalogMatrixFamilyCaps,
  type CatalogMatrixSheet,
  type CatalogMatrixStubColumn,
} from "@/app/lib/catalog/catalog-matrix";
import {
  encodeStockLeafKey,
  validateCatalogStockQuantities,
} from "@/app/lib/catalog/lens-product-stock-core";
import { Button } from "@/components/ui/button";
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

export type CatalogMatrixStockLeafView = {
  current: number;
  minStock: number;
  targetStock: number;
};

export type CatalogMatrixRuleSaveEdit = {
  variantId: string;
  sph: number;
  cyl: number;
  minStock: number;
  targetStock: number;
};

type Draft = { min: string; target: string };

function sheetMatchesAxis(sheet: CatalogMatrixSheet, axis: number): boolean {
  return sheet.rows.some((row) => {
    const raw = row.stub.axis;
    if (raw == null || raw === "—") return false;
    const n = Number(raw);
    return Number.isFinite(n) && Math.abs(n - axis) < 1e-9;
  });
}

function baselineDraft(
  leaf: CatalogMatrixStockLeafView | undefined
): Draft {
  return {
    min: leaf && leaf.minStock > 0 ? String(leaf.minStock) : leaf ? String(leaf.minStock) : "",
    target:
      leaf && leaf.targetStock > 0
        ? String(leaf.targetStock)
        : leaf
          ? String(leaf.targetStock)
          : "",
  };
}

function draftEqualsBaseline(
  draft: Draft,
  leaf: CatalogMatrixStockLeafView | undefined
): boolean {
  const base = baselineDraft(leaf);
  const min = draft.min.trim() === "" ? "0" : draft.min.trim();
  const target = draft.target.trim() === "" ? "0" : draft.target.trim();
  const baseMin = base.min.trim() === "" ? "0" : base.min.trim();
  const baseTarget = base.target.trim() === "" ? "0" : base.target.trim();
  return min === baseMin && target === baseTarget;
}

export function CatalogMatrixPanel({
  variants,
  family,
  familyLabel,
  highlightAxis,
  className,
  /** When true, Threshold/Target inputs are enabled (stock phase). */
  editable = false,
  /** Live leaf values keyed by encodeStockLeafKey(variantId, sph, cyl). */
  stockLeaves,
  onSaveRules,
  saving = false,
}: {
  variants: VariantLike[];
  family: CatalogMatrixFamilyCaps;
  familyLabel?: string | null;
  /** From list deep-link `?axis=` — scroll/highlight matching sheets. */
  highlightAxis?: number | null;
  className?: string;
  editable?: boolean;
  stockLeaves?: Record<string, CatalogMatrixStockLeafView>;
  onSaveRules?: (edits: CatalogMatrixRuleSaveEdit[]) => Promise<void> | void;
  saving?: boolean;
}) {
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

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
    const timer = window.setTimeout(() => {
      const target =
        highlightRef.current ??
        panelRef.current ??
        document.getElementById("matrix");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [highlightAxis, firstHighlightKey, sheets.length]);

  // Drop drafts that match baseline after stockLeaves refresh.
  useEffect(() => {
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [key, draft] of Object.entries(prev)) {
        if (draftEqualsBaseline(draft, stockLeaves?.[key])) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [stockLeaves]);

  const dirtyKeys = useMemo(() => {
    return Object.keys(drafts).filter(
      (key) => !draftEqualsBaseline(drafts[key]!, stockLeaves?.[key])
    );
  }, [drafts, stockLeaves]);

  function setDraftField(key: string, field: "min" | "target", value: string) {
    setSaveError(null);
    setDrafts((prev) => {
      const leaf = stockLeaves?.[key];
      const current = prev[key] ?? baselineDraft(leaf);
      const nextDraft = { ...current, [field]: value };
      if (draftEqualsBaseline(nextDraft, leaf)) {
        if (!(key in prev)) return prev;
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: nextDraft };
    });
  }

  async function handleSave() {
    if (!onSaveRules || dirtyKeys.length === 0) return;
    setSaveError(null);
    const edits: CatalogMatrixRuleSaveEdit[] = [];
    for (const key of dirtyKeys) {
      const draft = drafts[key]!;
      const parts = key.split(":");
      if (parts.length !== 3) {
        setSaveError(`Invalid leaf key: ${key}`);
        return;
      }
      const variantId = parts[0]!;
      const sph = Number(parts[1]);
      const cyl = Number(parts[2]);
      const minRaw = draft.min.trim() === "" ? "0" : draft.min.trim();
      const targetRaw = draft.target.trim() === "" ? "0" : draft.target.trim();
      if (!/^\d+$/.test(minRaw) || !/^\d+$/.test(targetRaw)) {
        setSaveError("Threshold and target must be whole numbers ≥ 0.");
        return;
      }
      const minStock = Number(minRaw);
      const targetStock = Number(targetRaw);
      const qtyError = validateCatalogStockQuantities(minStock, targetStock);
      if (qtyError) {
        setSaveError(qtyError);
        return;
      }
      edits.push({ variantId, sph, cyl, minStock, targetStock });
    }
    try {
      await onSaveRules(edits);
      setDrafts({});
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save rules.");
    }
  }

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
            Power matrix
          </h2>
          <p className="mt-1 text-xs text-(--brand-text-muted)">
            Cells: Current / Threshold / Target
            {editable
              ? ". Threshold and Target are editable; Current is read-only."
              : ". Triad boxes are ready; Threshold/Target save with stock leaf."}{" "}
            Cross sheet keeps the full +SPH/−CYL grid — gap-fail cells are
            disabled.
          </p>
          {highlightAxis != null ? (
            <div className="mt-3 rounded-xl border-2 border-(--brand-primary) bg-(--brand-primary)/20 px-3 py-2 text-sm font-bold text-(--brand-text)">
              Axis {highlightAxis}°
            </div>
          ) : null}
        </div>
        {editable && onSaveRules ? (
          <div className="flex shrink-0 items-center gap-2">
            {dirtyKeys.length > 0 ? (
              <span className="mr-1 text-xs font-semibold whitespace-nowrap text-amber-700 dark:text-amber-300">
                {dirtyKeys.length} unsaved
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={dirtyKeys.length === 0 || saving}
              onClick={() => {
                setDrafts({});
                setSaveError(null);
              }}
              className="h-9 rounded-xl border-(--brand-card-border) bg-(--brand-card) px-4 text-sm font-semibold text-(--brand-text) hover:bg-(--brand-primary)/10"
            >
              Discard
            </Button>
            <Button
              type="button"
              disabled={dirtyKeys.length === 0 || saving}
              onClick={() => void handleSave()}
              className="h-9 rounded-xl bg-(--brand-primary) px-4 text-sm font-extrabold text-(--brand-primary-text) hover:opacity-95"
            >
              {saving ? "Saving…" : "Save thresholds"}
            </Button>
          </div>
        ) : null}
      </div>

      {saveError ? (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {saveError}
        </div>
      ) : null}

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
              <CatalogMatrixTable
                sheet={sheet}
                editable={editable}
                stockLeaves={stockLeaves}
                drafts={drafts}
                onDraftChange={setDraftField}
              />
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
  stockLeaves,
  drafts,
  onDraftChange,
}: {
  sheet: CatalogMatrixSheet;
  editable: boolean;
  stockLeaves?: Record<string, CatalogMatrixStockLeafView>;
  drafts: Record<string, Draft>;
  onDraftChange: (key: string, field: "min" | "target", value: string) => void;
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
                        stockLeaves={stockLeaves}
                        drafts={drafts}
                        onDraftChange={onDraftChange}
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
  stockLeaves,
  drafts,
  onDraftChange,
}: {
  cell: CatalogMatrixCell | undefined;
  editable: boolean;
  sheetKind: CatalogMatrixSheet["kind"];
  stockLeaves?: Record<string, CatalogMatrixStockLeafView>;
  drafts: Record<string, Draft>;
  onDraftChange: (key: string, field: "min" | "target", value: string) => void;
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

  if (!cell.present || !cell.variantId) {
    return (
      <div
        className="h-9 rounded-md"
        aria-label="No variant covers this power"
      />
    );
  }

  const leafKey = encodeStockLeafKey(
    cell.variantId,
    cell.cellKey.sph,
    cell.cellKey.cyl
  );
  const leaf = stockLeaves?.[leafKey];
  const draft = drafts[leafKey] ?? baselineDraft(leaf);
  const dirty = !draftEqualsBaseline(draft, leaf);
  const current = leaf?.current ?? 0;

  const powerHint = [
    `SPH ${cell.cellKey.sph.toFixed(2)}`,
    `CYL ${cell.cellKey.cyl.toFixed(2)}`,
    `Variant ${cell.variantId}`,
  ].join(" · ");

  return (
    <div
      className={cn(
        "flex h-9 items-center justify-center gap-0.5 rounded-md border border-dashed border-(--brand-card-border) px-1",
        dirty && "ring-2 ring-amber-400"
      )}
      title={powerHint}
    >
      <span
        className="min-w-6 rounded bg-(--brand-input-bg) px-1 py-0.5 text-center text-[11px] font-semibold tabular-nums text-(--brand-text-muted)"
        aria-label="Current stock (read-only)"
      >
        {current}
      </span>
      <span className="text-(--brand-text-muted)/50">/</span>
      <input
        inputMode="numeric"
        value={draft.min}
        placeholder="–"
        disabled={!editable}
        readOnly={!editable}
        onChange={(e) => onDraftChange(leafKey, "min", e.target.value)}
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
        value={draft.target}
        placeholder="–"
        disabled={!editable}
        readOnly={!editable}
        onChange={(e) => onDraftChange(leafKey, "target", e.target.value)}
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
