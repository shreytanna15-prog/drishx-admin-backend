"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminApiError, adminFetch } from "@/app/lib/admin-api";
import {
  type AdminOrder,
  formatCatalogSummary,
  formatOrderDisplayId,
  formatPrescription,
  formatStatus,
} from "@/app/lib/admin-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const selectClass =
  "h-10 w-full rounded-lg border border-(--brand-card-border) bg-(--brand-input-bg,#0b0f14) px-3 text-sm text-(--brand-text) [color-scheme:dark]";
const optionStyle = { backgroundColor: "#0f1620", color: "#eaf0fa" } as const;
const labelClass = "mb-1 block text-xs font-semibold text-(--brand-label)";
const textareaClass =
  "min-h-20 w-full rounded-lg border border-(--brand-card-border) bg-(--brand-input-bg,#0b0f14) px-3 py-2 text-sm text-(--brand-text)";

const RETURN_REASONS = [
  "WRONG_POWER",
  "MANUFACTURING_DEFECT",
  "COATING_ISSUE",
  "BROKEN_IN_TRANSPORT",
  "WRONG_PRODUCT",
  "EXCESS_STOCK_RETURN",
  "OTHER",
] as const;

type ReturnReason = (typeof RETURN_REASONS)[number];

type ItemState = {
  selected: boolean;
  quantity: string;
  eye: string;
  reason: ReturnReason;
  itemRemarks: string;
  requestedSph: string;
  requestedCyl: string;
  requestedAxis: string;
  requestedAdd: string;
};

function emptyItemState(order: AdminOrder): ItemState {
  return {
    selected: true,
    quantity: String(Math.max(0.01, Number(order.quantity) || 1)),
    eye: order.eye ?? "",
    reason: "WRONG_POWER",
    itemRemarks: "",
    requestedSph: order.sph != null ? String(order.sph) : "",
    requestedCyl: order.cyl != null ? String(order.cyl) : "",
    requestedAxis: order.axis != null ? String(order.axis) : "",
    requestedAdd: order.add != null ? String(order.add) : "",
  };
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function lineLabel(order: AdminOrder) {
  return `${formatOrderDisplayId(order)} · ${formatCatalogSummary(order)}`;
}

type AdminCreateReturnPanelProps = {
  /** When set, form is scoped to this order (and batch siblings if any). */
  seedOrder?: AdminOrder | null;
  /** Compact embedded layout for the order detail panel. */
  compact?: boolean;
  onCreated?: (returnId: string) => void;
  className?: string;
};

export function AdminCreateReturnPanel({
  seedOrder = null,
  compact = false,
  onCreated,
  className,
}: AdminCreateReturnPanelProps) {
  const router = useRouter();
  const [requestType, setRequestType] = useState<"RETURN" | "REPLACEMENT">("RETURN");
  const [customerRemarks, setCustomerRemarks] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [lineOrders, setLineOrders] = useState<AdminOrder[]>(
    seedOrder ? [seedOrder] : []
  );
  const [itemState, setItemState] = useState<Record<string, ItemState>>(
    seedOrder ? { [seedOrder.id]: emptyItemState(seedOrder) } : {}
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AdminOrder[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isReplacement = requestType === "REPLACEMENT";
  const customer = lineOrders[0]?.user;
  const customerLabel =
    customer?.businessName || customer?.name || customer?.email || "Customer";

  useEffect(() => {
    if (!seedOrder) return;

    let cancelled = false;
    const seed = seedOrder;
    async function loadBatch() {
      setLoadingLines(true);
      setError("");
      try {
        let lines: AdminOrder[] = [seed];
        const batchId = seed.checkoutBatchId?.trim();
        if (batchId) {
          const batch = await adminFetch<AdminOrder[]>(
            `/api/orders?batchId=${encodeURIComponent(batchId)}`
          );
          if (Array.isArray(batch) && batch.length > 0) {
            lines = batch;
          }
        }
        if (cancelled) return;
        setLineOrders(lines);
        setItemState(
          Object.fromEntries(
            lines.map((order) => [
              order.id,
              {
                ...emptyItemState(order),
                selected: order.id === seed.id,
              },
            ])
          )
        );
      } catch (err) {
        if (!cancelled) {
          setLineOrders([seed]);
          setItemState({ [seed.id]: emptyItemState(seed) });
          setError(
            err instanceof AdminApiError
              ? err.message
              : "Could not load related order lines; using this line only."
          );
        }
      } finally {
        if (!cancelled) setLoadingLines(false);
      }
    }

    void loadBatch();
    return () => {
      cancelled = true;
    };
  }, [seedOrder?.id]);

  async function runSearch() {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) {
      setError("Enter at least 2 characters to search orders.");
      return;
    }
    setSearching(true);
    setError("");
    setMessage("");
    try {
      const all = await adminFetch<AdminOrder[]>("/api/orders");
      const list = Array.isArray(all) ? all : [];
      const matches = list
        .filter((order) => {
          const hay = [
            order.id,
            order.orderNumber != null ? String(order.orderNumber) : "",
            order.user?.name ?? "",
            order.user?.email ?? "",
            order.user?.businessName ?? "",
            order.lensType,
            formatCatalogSummary(order),
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
        .slice(0, 25);
      setSearchResults(matches);
      if (matches.length === 0) {
        setMessage("No matching orders found.");
      }
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Search failed.");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function selectOrderFromSearch(order: AdminOrder) {
    setMessage("");
    setError("");
    setLoadingLines(true);
    try {
      let lines: AdminOrder[] = [order];
      const batchId = order.checkoutBatchId?.trim();
      if (batchId) {
        const batch = await adminFetch<AdminOrder[]>(
          `/api/orders?batchId=${encodeURIComponent(batchId)}`
        );
        if (Array.isArray(batch) && batch.length > 0) lines = batch;
      }
      setLineOrders(lines);
      setItemState(
        Object.fromEntries(
          lines.map((line) => [
            line.id,
            {
              ...emptyItemState(line),
              selected: line.id === order.id,
            },
          ])
        )
      );
      setSearchResults([]);
      setSearchQuery(
        order.user?.businessName ||
          order.user?.name ||
          order.user?.email ||
          formatOrderDisplayId(order)
      );
    } catch (err) {
      setLineOrders([order]);
      setItemState({ [order.id]: emptyItemState(order) });
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Loaded selected order only."
      );
    } finally {
      setLoadingLines(false);
    }
  }

  function updateItem(orderId: string, patch: Partial<ItemState>) {
    setItemState((current) => ({
      ...current,
      [orderId]: { ...current[orderId]!, ...patch },
    }));
  }

  async function handleSubmit() {
    setError("");
    setMessage("");

    if (lineOrders.length === 0) {
      setError("Select a customer order first.");
      return;
    }

    const items = lineOrders
      .filter((order) => itemState[order.id]?.selected)
      .map((order) => {
        const state = itemState[order.id]!;
        const quantity = Number(state.quantity);
        const base = {
          orderId: order.id,
          quantity,
          eye: state.eye.trim() || null,
          reason: state.reason,
          itemRemarks: state.itemRemarks.trim() || undefined,
        };
        if (!isReplacement) return base;
        return {
          ...base,
          requestedSph: parseOptionalNumber(state.requestedSph),
          requestedCyl: parseOptionalNumber(state.requestedCyl),
          requestedAxis: parseOptionalNumber(state.requestedAxis),
          requestedAdd: parseOptionalNumber(state.requestedAdd),
        };
      });

    if (items.length === 0) {
      setError("Select at least one order line.");
      return;
    }

    for (const item of items) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        setError("Each selected line needs a valid quantity.");
        return;
      }
    }

    if (isReplacement) {
      const missingSph = items.some(
        (item) =>
          "requestedSph" in item &&
          (item.requestedSph === null || item.requestedSph === undefined)
      );
      if (missingSph) {
        setError("For replacement, enter at least SPH for each selected line.");
        return;
      }
    }

    const remarks =
      customerRemarks.trim() ||
      `Created by admin on behalf of ${customerLabel}.`;

    setSubmitting(true);
    try {
      const created = await adminFetch<{ id: string; requestNumber?: string }>(
        "/api/returns",
        {
          method: "POST",
          body: JSON.stringify({
            requestType,
            customerRemarks: remarks,
            items,
          }),
        }
      );

      if (files.length > 0) {
        const { getToken } = await import("@/app/lib/client-auth");
        const token = getToken();
        for (const file of files) {
          const formData = new FormData();
          formData.set("photo", file);
          const res = await fetch(`/api/returns/${created.id}/images`, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(
              typeof data?.error === "string"
                ? data.error
                : "Return created but photo upload failed."
            );
          }
        }
      }

      setMessage(
        `Return ${created.requestNumber ?? created.id} created on behalf of ${customerLabel}.`
      );
      if (onCreated) {
        onCreated(created.id);
      } else {
        router.push(`/returns/${created.id}`);
      }
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to create return request."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const selectedCount = useMemo(
    () => Object.values(itemState).filter((s) => s.selected).length,
    [itemState]
  );

  return (
    <div
      className={cn(
        "rounded-2xl border border-(--brand-card-border) bg-(--brand-card)",
        compact ? "p-4" : "p-5",
        className
      )}
    >
      <div className="mb-4">
        <h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-(--brand-primary)">
          Create return on behalf of customer
        </h3>
        <p className="mt-1 text-sm text-(--brand-text-muted)">
          Submits into the admin review queue ({selectedCount} line
          {selectedCount === 1 ? "" : "s"} selected). Customer will see the request
          under Returns; assign an employee when you approve.
        </p>
      </div>

      {error ? (
        <div className="mb-3 rounded-xl border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mb-3 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}

      {!seedOrder ? (
        <div className="mb-4 space-y-3">
          <label className="block">
            <span className={labelClass}>Find customer order</span>
            <div className="flex flex-wrap gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by customer, email, order #…"
                className="min-w-[220px] flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runSearch();
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={searching}
                onClick={() => void runSearch()}
              >
                {searching ? "Searching…" : "Search"}
              </Button>
            </div>
          </label>
          {searchResults.length > 0 ? (
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-(--brand-card-border) p-2">
              {searchResults.map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => void selectOrderFromSearch(order)}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-(--brand-primary)/10"
                  >
                    <span className="font-semibold text-(--brand-text)">
                      {formatOrderDisplayId(order)}
                    </span>
                    <span className="mt-0.5 block text-xs text-(--brand-text-muted)">
                      {order.user?.businessName ||
                        order.user?.name ||
                        order.user?.email}{" "}
                      · {formatCatalogSummary(order)} · {formatStatus(order.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {loadingLines ? (
        <p className="text-sm text-(--brand-text-muted)">Loading order lines…</p>
      ) : lineOrders.length > 0 ? (
        <>
          <div className="mb-4 rounded-xl border border-(--brand-card-border) bg-(--brand-input-bg,#0b0f14) px-3 py-3 text-sm">
            <p className="font-semibold text-(--brand-text)">{customerLabel}</p>
            {customer?.email ? (
              <p className="text-xs text-(--brand-text-muted)">{customer.email}</p>
            ) : null}
            <p className="mt-1 text-xs text-(--brand-text-muted)">
              {lineOrders.length} line{lineOrders.length === 1 ? "" : "s"} in selection
              {lineOrders[0]?.checkoutBatchId
                ? " (checkout batch loaded)"
                : ""}
            </p>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Request type</span>
              <select
                className={selectClass}
                value={requestType}
                onChange={(e) =>
                  setRequestType(e.target.value as "RETURN" | "REPLACEMENT")
                }
              >
                <option value="RETURN" style={optionStyle}>
                  Return (credit path)
                </option>
                <option value="REPLACEMENT" style={optionStyle}>
                  Replacement
                </option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Notes for customer / internal</span>
              <textarea
                className={textareaClass}
                rows={compact ? 2 : 3}
                value={customerRemarks}
                onChange={(e) => setCustomerRemarks(e.target.value)}
                placeholder={`Optional. Default: Created by admin on behalf of ${customerLabel}.`}
              />
            </label>
          </div>

          <div className="mb-4 space-y-3">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-(--brand-label)">
              Select items
            </p>
            {lineOrders.map((order) => {
              const state = itemState[order.id] ?? emptyItemState(order);
              return (
                <div
                  key={order.id}
                  className={cn(
                    "rounded-xl border p-3",
                    state.selected
                      ? "border-(--brand-primary)/45 bg-(--brand-primary)/5"
                      : "border-(--brand-card-border)"
                  )}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={state.selected}
                      onChange={(e) =>
                        updateItem(order.id, { selected: e.target.checked })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-(--brand-text)">
                        {lineLabel(order)}
                      </p>
                      <p className="mt-0.5 text-xs text-(--brand-text-muted)">
                        Ordered qty: {order.quantity}
                        {order.eye ? ` · ${order.eye}` : ""} ·{" "}
                        {formatPrescription(order)}
                      </p>
                    </div>
                  </label>

                  {state.selected ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className={labelClass}>Quantity</span>
                        <Input
                          type="number"
                          min={0.01}
                          step="any"
                          max={Number(order.quantity)}
                          value={state.quantity}
                          onChange={(e) =>
                            updateItem(order.id, { quantity: e.target.value })
                          }
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Eye</span>
                        <Input
                          value={state.eye}
                          onChange={(e) =>
                            updateItem(order.id, { eye: e.target.value })
                          }
                          placeholder="LEFT / RIGHT"
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className={labelClass}>Reason</span>
                        <select
                          className={selectClass}
                          value={state.reason}
                          onChange={(e) =>
                            updateItem(order.id, {
                              reason: e.target.value as ReturnReason,
                            })
                          }
                        >
                          {RETURN_REASONS.map((reason) => (
                            <option key={reason} value={reason} style={optionStyle}>
                              {formatStatus(reason)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {isReplacement ? (
                        <>
                          <label className="block">
                            <span className={labelClass}>New SPH</span>
                            <Input
                              value={state.requestedSph}
                              onChange={(e) =>
                                updateItem(order.id, {
                                  requestedSph: e.target.value,
                                })
                              }
                              placeholder="e.g. -1.25"
                            />
                          </label>
                          <label className="block">
                            <span className={labelClass}>New CYL</span>
                            <Input
                              value={state.requestedCyl}
                              onChange={(e) =>
                                updateItem(order.id, {
                                  requestedCyl: e.target.value,
                                })
                              }
                              placeholder="e.g. -0.50"
                            />
                          </label>
                          <label className="block">
                            <span className={labelClass}>New AXIS</span>
                            <Input
                              value={state.requestedAxis}
                              onChange={(e) =>
                                updateItem(order.id, {
                                  requestedAxis: e.target.value,
                                })
                              }
                              placeholder="e.g. 180"
                            />
                          </label>
                          <label className="block">
                            <span className={labelClass}>New ADD</span>
                            <Input
                              value={state.requestedAdd}
                              onChange={(e) =>
                                updateItem(order.id, {
                                  requestedAdd: e.target.value,
                                })
                              }
                              placeholder="optional"
                            />
                          </label>
                        </>
                      ) : null}
                      <label className="block sm:col-span-2">
                        <span className={labelClass}>Item remarks</span>
                        <Input
                          value={state.itemRemarks}
                          onChange={(e) =>
                            updateItem(order.id, {
                              itemRemarks: e.target.value,
                            })
                          }
                          placeholder="Optional per-line notes"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <label className="mb-4 block">
            <span className={labelClass}>Photos (optional)</span>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) =>
                setFiles(Array.from(e.target.files ?? []).slice(0, 6))
              }
            />
            {files.length > 0 ? (
              <p className="mt-1 text-xs text-(--brand-text-muted)">
                {files.length} file{files.length === 1 ? "" : "s"} selected
              </p>
            ) : null}
          </label>

          <Button
            type="button"
            disabled={submitting || selectedCount === 0}
            onClick={() => void handleSubmit()}
          >
            {submitting
              ? "Creating…"
              : `Create ${requestType === "REPLACEMENT" ? "replacement" : "return"} for ${customerLabel}`}
          </Button>
        </>
      ) : seedOrder ? null : (
        <p className="text-sm text-(--brand-text-muted)">
          Search and select an order to create a return or replacement on behalf of
          that customer.
        </p>
      )}
    </div>
  );
}
