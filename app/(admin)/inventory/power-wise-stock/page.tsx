"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Play, Search } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import {
  formatLensName,
  formatPowerValue,
  LENS_TYPE_LABELS,
  type ProcurementLensInfo,
  type ReorderRuleRow,
  type ReorderRulesResponse,
  type ReorderCheckResponse,
  type StockPositionInfo,
} from "@/app/lib/admin-procurement";
import { cn } from "@/lib/utils";

type Draft = {
  minStock: string;
  targetStock: string;
  autoProcure: boolean;
  preferredSupplierId: string;
  moq: string;
};

type EditableRow = {
  key: string;
  lensType: string;
  lensId: string;
  lens: ProcurementLensInfo | null;
  position: StockPositionInfo;
  draft: Draft;
  /** Saved values, used to detect unsaved edits. */
  original: Draft;
  isNew: boolean;
};

const LENS_TYPE_TABS = [
  { value: "", label: "All" },
  { value: "SINGLE_VISION", label: "Single Vision" },
  { value: "KRYPTOK", label: "Kryptok" },
  { value: "PROGRESSIVE", label: "Progressive" },
] as const;

function toDraft(rule: ReorderRuleRow | null, position: StockPositionInfo): Draft {
  return {
    minStock: rule ? String(rule.minStock) : "0",
    targetStock: rule ? String(rule.targetStock) : String(Math.max(position.available * 2, 20)),
    autoProcure: rule?.autoProcure ?? false,
    preferredSupplierId: rule?.preferredSupplierId ?? "",
    moq: rule?.moq !== null && rule?.moq !== undefined ? String(rule.moq) : "",
  };
}

export default function PowerWiseStockPage() {
  const [data, setData] = useState<ReorderRulesResponse | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [lensType, setLensType] = useState("");
  const [onlyBelowMin, setOnlyBelowMin] = useState(false);
  const [query, setQuery] = useState("");
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const canEdit = data?.canEdit ?? false;

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (lensType) params.set("lensType", lensType);
      if (onlyBelowMin) params.set("belowMin", "true");
      params.set("includeUnconfigured", "true");

      const res = await adminFetch<ReorderRulesResponse>(
        `/api/inventory/reorder-rules?${params.toString()}`
      );
      setData(res);

      const configured: EditableRow[] = res.rules.map((rule) => {
        const draft = toDraft(rule, rule.position);
        return {
          key: `${rule.lensType}:${rule.lensId}`,
          lensType: rule.lensType,
          lensId: rule.lensId,
          lens: rule.lens,
          position: rule.position,
          draft,
          original: { ...draft },
          isNew: false,
        };
      });

      // Surface SKUs that have stock but no threshold yet, so an admin can
      // configure the catalogue without hunting through a lens picker.
      const unconfigured: EditableRow[] = (res.unconfigured ?? []).map((entry) => {
        const draft = toDraft(null, entry.position);
        return {
          key: `${entry.lensType}:${entry.lensId}`,
          lensType: entry.lensType,
          lensId: entry.lensId,
          lens: entry.lens,
          position: entry.position,
          draft,
          original: { ...draft },
          isNew: true,
        };
      });

      setRows([...configured, ...unconfigured]);
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to load reorder rules."
      );
    } finally {
      setLoading(false);
    }
  }, [lensType, onlyBelowMin]);

  useEffect(() => {
    void load();
  }, [load]);

  // Filter changes are user events, so the loading flag is set from the
  // handler rather than from inside the effect.
  function changeLensType(value: string) {
    setLoading(true);
    setLensType(value);
  }

  function changeBelowMin(value: boolean) {
    setLoading(true);
    setOnlyBelowMin(value);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const name = formatLensName(row.lens).toLowerCase();
      const power = formatPowerValue(
        row.lens
          ? {
              sph: row.lens.sph,
              cyl: row.lens.cyl,
              crossPower: row.lens.crossPower,
              add: row.lens.add,
              eye: row.lens.eye,
            }
          : null
      ).toLowerCase();
      return name.includes(q) || power.includes(q);
    });
  }, [rows, query]);

  const dirtyRows = useMemo(
    () => rows.filter((row) => !row.isNew && hasChanges(row)),
    [rows]
  );

  const newRows = useMemo(() => rows.filter((row) => row.isNew), [rows]);

  function updateDraft(key: string, patch: Partial<Draft>) {
    setRows((prev) =>
      prev.map((row) =>
        row.key === key ? { ...row, draft: { ...row.draft, ...patch } } : row
      )
    );
  }

  function discardNewRow(key: string) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  async function save(rowsToSave: EditableRow[]) {
    if (rowsToSave.length === 0) return;
    setSaving(true);
    setError("");
    try {
      await adminFetch("/api/inventory/reorder-rules/bulk", {
        method: "POST",
        body: JSON.stringify({
          items: rowsToSave.map((row) => ({
            lensType: row.lensType,
            lensId: row.lensId,
            minStock: Number(row.draft.minStock || 0),
            targetStock: Number(row.draft.targetStock || 0),
            autoProcure: row.draft.autoProcure,
            preferredSupplierId: row.draft.preferredSupplierId || null,
            moq: row.draft.moq === "" ? null : Number(row.draft.moq),
          })),
        }),
      });
      setNotice(`Saved ${rowsToSave.length} reorder rule${rowsToSave.length === 1 ? "" : "s"}.`);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to save rules.");
    } finally {
      setSaving(false);
    }
  }

  async function runCheck() {
    setRunning(true);
    setError("");
    setNotice("");
    try {
      const res = await adminFetch<ReorderCheckResponse>("/api/inventory/reorder-check", {
        method: "POST",
      });
      setLastCheck(new Date().toISOString());
      setNotice(
        `Checked ${res.scanned} SKU${res.scanned === 1 ? "" : "s"} — ` +
          `${res.created} new request${res.created === 1 ? "" : "s"}, ` +
          `${res.suppressed} already covered, ${res.notNeeded} healthy.`
      );
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Reorder check failed.");
    } finally {
      setRunning(false);
    }
  }

  const belowMinCount = useMemo(
    () => rows.filter((row) => !row.isNew && row.position.available <= toInt(row.draft.minStock)).length,
    [rows]
  );

  return (
    <AdminPage title="Reorder Rules" subtitle="Inventory">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
            Reorder Rules
          </h1>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            Set a minimum and target stock per SKU and power. When available
            stock (on-hand minus reserved) falls to the minimum, DrishX raises a
            procurement request for an admin to approve.
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void runCheck()}
              disabled={running}
            >
              {running ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
              Run check now
            </Button>
            <Button
              onClick={() => void save([...dirtyRows, ...newRows])}
              disabled={saving || (dirtyRows.length === 0 && newRows.length === 0)}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
              Save{dirtyRows.length + newRows.length > 0
                ? ` (${dirtyRows.length + newRows.length})`
                : ""}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {LENS_TYPE_TABS.map((tab) => (
          <button
            key={tab.value || "all"}
            type="button"
            onClick={() => changeLensType(tab.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition",
              lensType === tab.value
                ? "border-(--brand-text) bg-(--brand-text) text-(--brand-card)"
                : "border-(--brand-card-border) bg-(--brand-card) text-(--brand-text-muted) hover:text-(--brand-text)"
            )}
          >
            {tab.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-(--brand-text-muted)">
          <input
            type="checkbox"
            checked={onlyBelowMin}
            onChange={(e) => changeBelowMin(e.target.checked)}
            className="size-4"
          />
          Only below minimum
        </label>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--brand-placeholder)" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brand or power…"
            className="h-10 border-(--brand-input-border) bg-(--brand-input-bg) pl-9 text-(--brand-text) placeholder:text-(--brand-placeholder)"
          />
        </div>
      </div>

      {belowMinCount > 0 ? (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>{belowMinCount}</strong> SKU{belowMinCount === 1 ? "" : "s"} at or
            below the minimum. Run the check to raise procurement requests.
          </span>
        </div>
      ) : null}

      {notice ? (
        <div className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          {notice}
          {lastCheck ? (
            <span className="ml-2 text-xs text-emerald-700">
              Last run {new Date(lastCheck).toLocaleTimeString("en-IN")}
            </span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      {!canEdit ? (
        <div className="mb-4 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4 text-sm text-(--brand-text-muted)">
          Read-only. Only admins can change reorder thresholds.
        </div>
      ) : null}

      {loading ? (
        <TableSkeleton compact columns={9} rows={8} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
          <Table>
            <TableHeader>
              <TableRow className="border-(--brand-card-border) hover:bg-transparent">
                <TableHead className="text-(--brand-label)">Lens</TableHead>
                <TableHead className="text-(--brand-label)">Power</TableHead>
                <TableHead className="text-right text-(--brand-label)">On-hand</TableHead>
                <TableHead className="text-right text-(--brand-label)">Reserved</TableHead>
                <TableHead className="text-right text-(--brand-label)">Available</TableHead>
                <TableHead className="text-right text-(--brand-label)">Incoming</TableHead>
                <TableHead className="text-right text-(--brand-label)">Min</TableHead>
                <TableHead className="text-right text-(--brand-label)">Target</TableHead>
                <TableHead className="text-(--brand-label)">Auto</TableHead>
                <TableHead className="text-(--brand-label)">Supplier</TableHead>
                <TableHead className="text-right text-(--brand-label)">MOQ</TableHead>
                <TableHead className="text-(--brand-label)"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={12}
                    className="h-28 text-center text-(--brand-text-muted)"
                  >
                    {query.trim() || onlyBelowMin
                      ? "No SKUs match the current filters."
                      : "No reorder rules yet. Search above to configure a SKU."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <RuleRow
                    key={row.key}
                    row={row}
                    canEdit={canEdit}
                    suppliers={data?.suppliers ?? []}
                    onChange={(patch) => updateDraft(row.key, patch)}
                    onSave={() => void save([row])}
                    onDiscard={() => discardNewRow(row.key)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminPage>
  );
}

function RuleRow({
  row,
  canEdit,
  suppliers,
  onChange,
  onSave,
  onDiscard,
}: {
  row: EditableRow;
  canEdit: boolean;
  suppliers: { id: string; name: string }[];
  onChange: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const min = toInt(row.draft.minStock);
  const target = toInt(row.draft.targetStock);
  const available = row.position.available;
  const belowMin = !row.isNew && available <= min;
  const outOfStock = !row.isNew && available <= 0;
  const invalid = row.draft.minStock !== "" && target <= min;

  return (
    <TableRow className="border-(--brand-card-border)">
      <TableCell className="font-medium text-(--brand-text)">
        <div className="flex flex-wrap items-center gap-2">
          <span>{formatLensName(row.lens)}</span>
          {row.isNew ? (
            <Badge className="border-(--brand-card-border) bg-(--brand-muted) text-(--brand-text-muted)">
              New
            </Badge>
          ) : null}
          {outOfStock ? (
            <Badge className="border-red-300 bg-red-50 text-red-700">Out of stock</Badge>
          ) : belowMin ? (
            <Badge className="border-amber-300 bg-amber-50 text-amber-800">Below min</Badge>
          ) : null}
        </div>
        <p className="text-xs text-(--brand-text-muted)">
          {LENS_TYPE_LABELS[row.lensType] ?? row.lensType}
        </p>
      </TableCell>
      <TableCell className="whitespace-nowrap text-(--brand-text-muted)">
        {formatPowerValue(
          row.lens
            ? {
                sph: row.lens.sph,
                cyl: row.lens.cyl,
                crossPower: row.lens.crossPower,
                add: row.lens.add,
                eye: row.lens.eye,
              }
            : null
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums text-(--brand-text)">
        {row.position.onHand}
      </TableCell>
      <TableCell className="text-right tabular-nums text-(--brand-text-muted)">
        {row.position.committed}
      </TableCell>
      <TableCell
        className={cn(
          "text-right font-semibold tabular-nums",
          outOfStock
            ? "text-red-700"
            : belowMin
              ? "text-amber-700"
              : "text-(--brand-text)"
        )}
      >
        {available}
      </TableCell>
      <TableCell className="text-right tabular-nums text-(--brand-text-muted)">
        {row.position.incoming}
      </TableCell>
      <TableCell>
        <NumInput
          value={row.draft.minStock}
          onChange={(v) => onChange({ minStock: v })}
          disabled={!canEdit}
        />
      </TableCell>
      <TableCell>
        <NumInput
          value={row.draft.targetStock}
          onChange={(v) => onChange({ targetStock: v })}
          disabled={!canEdit}
          invalid={invalid}
        />
      </TableCell>
      <TableCell>
        <label className="inline-flex items-center gap-2 text-xs text-(--brand-text-muted)">
          <input
            type="checkbox"
            checked={row.draft.autoProcure}
            onChange={(e) => onChange({ autoProcure: e.target.checked })}
            disabled={!canEdit}
            className="size-4"
          />
          {row.draft.autoProcure ? "ON" : "OFF"}
        </label>
      </TableCell>
      <TableCell>
        <select
          value={row.draft.preferredSupplierId}
          onChange={(e) => onChange({ preferredSupplierId: e.target.value })}
          disabled={!canEdit}
          className="h-9 rounded-lg border border-(--brand-input-border) bg-(--brand-input-bg) px-2 text-sm text-(--brand-text)"
        >
          <option value="">—</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <NumInput
          value={row.draft.moq}
          onChange={(v) => onChange({ moq: v })}
          disabled={!canEdit}
          placeholder="—"
        />
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {row.isNew ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={onSave} disabled={invalid}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={onDiscard}>
              Discard
            </Button>
          </div>
        ) : canEdit && hasChanges(row) ? (
          <Button size="sm" onClick={onSave} disabled={invalid}>
            Save
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function NumInput({
  value,
  onChange,
  disabled,
  invalid,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 w-20 rounded-lg border bg-(--brand-input-bg) px-2 text-right text-sm tabular-nums text-(--brand-text) disabled:opacity-60",
        invalid
          ? "border-red-400"
          : "border-(--brand-input-border)"
      )}
    />
  );
}

function toInt(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function hasChanges(row: EditableRow): boolean {
  if (row.isNew) return false;
  return (
    row.draft.minStock !== row.original.minStock ||
    row.draft.targetStock !== row.original.targetStock ||
    row.draft.autoProcure !== row.original.autoProcure ||
    row.draft.preferredSupplierId !== row.original.preferredSupplierId ||
    row.draft.moq !== row.original.moq
  );
}
