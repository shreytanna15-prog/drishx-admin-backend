"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";
import { AdminTable } from "@/components/admin-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  formatPowerValue,
  LENS_TYPE_LABELS,
  PRIORITY_BADGE_CLASS,
  PROCUREMENT_PRIORITIES,
  PROCUREMENT_SOURCES,
  PROCUREMENT_STATUSES,
  sourceLabel,
  STATUS_BADGE_CLASS,
  listProcurementRequests,
  procurementRequestAction,
  type ProcurementRequestRow,
  type ProcurementRequestsResponse,
} from "@/app/lib/admin-procurement";
import {
  procurementRequestsEmptyMessage,
  shouldCommitListResult,
} from "@/app/lib/procurement-request-filters";
import { cn } from "@/lib/utils";

const LENS_TYPE_FILTERS = [
  { value: "", label: "All lenses" },
  { value: "SINGLE_VISION", label: "Single Vision" },
  { value: "KRYPTOK", label: "Kryptok" },
  { value: "PROGRESSIVE", label: "Progressive" },
] as const;

export default function ProcurementRequestsPage() {
  const [data, setData] = useState<ProcurementRequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [lensType, setLensType] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++loadSeqRef.current;
    try {
      const params = new URLSearchParams();
      if (source) params.set("source", source);
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (lensType) params.set("lensType", lensType);
      if (openOnly) params.set("openOnly", "true");
      params.set("limit", "300");

      const res = await listProcurementRequests(params, {
        signal: controller.signal,
      });
      if (!shouldCommitListResult(seq, loadSeqRef.current)) return;
      setData(res);
    } catch (err) {
      if (!shouldCommitListResult(seq, loadSeqRef.current)) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to load procurement requests."
      );
    } finally {
      if (shouldCommitListResult(seq, loadSeqRef.current)) {
        setLoading(false);
      }
    }
  }, [source, status, priority, lensType, openOnly]);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  // Filter changes are user events, so the loading flag is set from the
  // handler rather than from inside the effect.
  function changeFilter(setter: (value: string) => void) {
    return (value: string) => {
      setLoading(true);
      setError("");
      setter(value);
    };
  }

  const changeOpenOnly = (value: boolean) => {
    setLoading(true);
    setOpenOnly(value);
  };

  const rows = useMemo(() => {
    const list = data?.requests ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (row) =>
        (row.lensLabel ?? "").toLowerCase().includes(q) ||
        row.publicId.toLowerCase().includes(q) ||
        (row.order?.orderNumber ?? "").toLowerCase().includes(q)
    );
  }, [data, query]);

  async function act(row: ProcurementRequestRow, action: "approve" | "cancel") {
    setBusyId(row.id);
    setError("");
    setNotice("");
    try {
      await procurementRequestAction(
        row.id,
        action,
        action === "cancel" ? { reason: "Cancelled from admin console" } : undefined
      );
      setNotice(
        action === "approve"
          ? `${row.publicId} approved. It is now ready to purchase.`
          : `${row.publicId} cancelled.`
      );
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Action failed.");
    } finally {
      setBusyId("");
    }
  }

  const summary = data?.summary;

  return (
    <AdminPage title="Procurement" subtitle="Purchase Management">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
            Procurement Requests
          </h1>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            Everything DrishX needs to buy. Approving a request authorises the
            purchase — no money moves until a human approves.
          </p>
        </div>
        {summary ? (
          <div className="flex flex-wrap gap-2">
            <StatPill label="Open" value={summary.open} tone="amber" />
            <StatPill label="Under review" value={summary.underReview} tone="sky" />
            <StatPill label="Approved" value={summary.approved} tone="indigo" />
            <StatPill label="Critical" value={summary.critical} tone="red" />
          </div>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AdminSelect
          value={source}
          onValueChange={changeFilter(setSource)}
          options={[...PROCUREMENT_SOURCES]}
          size="sm"
          triggerClassName="h-10 w-auto min-w-[10rem]"
        />
        <AdminSelect
          value={status}
          onValueChange={changeFilter(setStatus)}
          options={[...PROCUREMENT_STATUSES]}
          size="sm"
          triggerClassName="h-10 w-auto min-w-[10rem]"
        />
        <AdminSelect
          value={priority}
          onValueChange={changeFilter(setPriority)}
          options={[...PROCUREMENT_PRIORITIES]}
          size="sm"
          triggerClassName="h-10 w-auto min-w-[10rem]"
        />
        <AdminSelect
          value={lensType}
          onValueChange={changeFilter(setLensType)}
          options={[...LENS_TYPE_FILTERS]}
          size="sm"
          triggerClassName="h-10 w-auto min-w-[10rem]"
        />
        <label className="flex items-center gap-2 text-sm text-(--brand-text-muted)">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => changeOpenOnly(e.target.checked)}
            className="size-4"
          />
          Unresolved only
        </label>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--brand-placeholder)" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search PR, lens, order…"
            className="h-10 border-(--brand-input-border) bg-(--brand-input-bg) pl-9 text-(--brand-text) placeholder:text-(--brand-placeholder)"
          />
        </div>
      </div>

      {notice ? (
        <div className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <TableSkeleton compact columns={8} rows={8} />
      ) : (
        <AdminTable className="overflow-x-auto">
          <Table className="min-w-[64rem]">
            <TableHeader>
              <TableRow className="border-(--brand-card-border) hover:bg-transparent">
                <TableHead className="whitespace-nowrap text-(--brand-label)">
                  Request
                </TableHead>
                <TableHead className="min-w-[10rem] text-(--brand-label)">
                  Lens
                </TableHead>
                <TableHead className="whitespace-nowrap text-(--brand-label)">
                  Power
                </TableHead>
                <TableHead className="w-[14rem] min-w-[12rem] max-w-[16rem] text-(--brand-label)">
                  Source
                </TableHead>
                <TableHead className="whitespace-nowrap text-right text-(--brand-label)">
                  Required
                </TableHead>
                <TableHead className="whitespace-nowrap text-right text-(--brand-label)">
                  Received
                </TableHead>
                <TableHead className="whitespace-nowrap text-(--brand-label)">
                  Status
                </TableHead>
                <TableHead className="whitespace-nowrap text-(--brand-label)">
                  Priority
                </TableHead>
                <TableHead className="whitespace-nowrap text-(--brand-label)" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="h-28 text-center text-(--brand-text-muted)"
                  >
                    {procurementRequestsEmptyMessage(
                      Boolean(
                        query.trim() || source || status || priority || lensType
                      )
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <RequestRow
                    key={row.id}
                    row={row}
                    busy={busyId === row.id}
                    onApprove={() => void act(row, "approve")}
                    onCancel={() => void act(row, "cancel")}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </AdminTable>
      )}
    </AdminPage>
  );
}

function RequestRow({
  row,
  busy,
  onApprove,
  onCancel,
}: {
  row: ProcurementRequestRow;
  busy: boolean;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const canApprove = row.status === "OPEN" || row.status === "UNDER_REVIEW";
  const canCancel = canApprove || row.status === "APPROVED";
  const fullyReceived = row.receivedQuantity >= row.requestedQuantity;

  return (
    <TableRow className="border-(--brand-card-border) align-top">
      <TableCell className="whitespace-nowrap">
        <p className="font-semibold text-(--brand-text)">{row.publicId}</p>
        <p className="text-xs text-(--brand-text-muted)">
          {new Date(row.createdAt).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
          })}
        </p>
        {row.order ? (
          <p className="text-xs text-(--brand-text-muted)">
            Order {row.order.orderNumber}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="max-w-[14rem] whitespace-normal text-(--brand-text)">
        <p className="truncate font-medium" title={row.lensLabel ?? undefined}>
          {row.lensLabel ?? "—"}
        </p>
        <p className="text-xs text-(--brand-text-muted)">
          {LENS_TYPE_LABELS[row.lensType] ?? row.lensType}
        </p>
      </TableCell>
      <TableCell className="whitespace-nowrap text-(--brand-text-muted)">
        {formatPowerValue(row.power)}
      </TableCell>
      <TableCell className="max-w-[16rem] min-w-[12rem] whitespace-normal align-top text-(--brand-text-muted)">
        <p className="font-medium text-(--brand-text)">{sourceLabel(row.source)}</p>
        {row.source === "MINIMUM_STOCK_THRESHOLD" && row.availableAtTrigger !== null ? (
          <p className="text-xs whitespace-nowrap">
            avail {row.availableAtTrigger} / min {row.minStockAtTrigger} / target{" "}
            {row.targetStockAtTrigger}
          </p>
        ) : null}
        {row.triggerReason ? (
          <p
            className="mt-0.5 line-clamp-2 break-words text-xs opacity-80"
            title={row.triggerReason}
          >
            {row.triggerReason}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right tabular-nums text-(--brand-text)">
        {row.requestedQuantity}
        {row.requestedQuantity !== row.requiredQuantity ? (
          <p className="text-xs text-(--brand-text-muted)">
            needed {row.requiredQuantity}
          </p>
        ) : null}
      </TableCell>
      <TableCell
        className={cn(
          "whitespace-nowrap text-right tabular-nums",
          fullyReceived ? "text-emerald-700" : "text-(--brand-text-muted)"
        )}
      >
        {row.receivedQuantity}
        {!fullyReceived && row.outstandingQuantity > 0 ? (
          <p className="text-xs text-(--brand-text-muted)">
            {row.outstandingQuantity} left
          </p>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Badge className={STATUS_BADGE_CLASS[row.status] ?? STATUS_BADGE_CLASS.CANCELLED}>
          {row.status.replace(/_/g, " ").toLowerCase()}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Badge className={PRIORITY_BADGE_CLASS[row.priority] ?? PRIORITY_BADGE_CLASS.NORMAL}>
          {row.priority.toLowerCase()}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right">
        {busy ? (
          <Loader2 className="ml-auto size-4 animate-spin text-(--brand-text-muted)" />
        ) : canApprove ? (
          <Button size="sm" onClick={onApprove}>
            <Check className="mr-1.5 size-4" />
            Approve
          </Button>
        ) : canCancel ? (
          <Button size="sm" variant="outline" onClick={onCancel}>
            <X className="mr-1.5 size-4" />
            Cancel
          </Button>
        ) : (
          <span className="text-xs text-(--brand-text-muted)">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "sky" | "indigo" | "red";
}) {
  const toneClass: Record<string, string> = {
    amber: "border-amber-300 bg-amber-50 text-amber-900",
    sky: "border-sky-300 bg-sky-50 text-sky-900",
    indigo: "border-indigo-300 bg-indigo-50 text-indigo-900",
    red: "border-red-300 bg-red-50 text-red-900",
  };
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 text-center",
        value > 0 ? toneClass[tone] : "border-(--brand-card-border) bg-(--brand-card) text-(--brand-text-muted)"
      )}
    >
      <p className="text-lg font-extrabold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-xs">{label}</p>
    </div>
  );
}
