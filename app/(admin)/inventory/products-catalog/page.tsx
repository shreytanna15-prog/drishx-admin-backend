"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  PauseCircle,
  Plus,
  PlayCircle,
  Search,
} from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  createCatalogProductRequest,
  familyLabel,
  fetchCatalogProduct,
  fetchCatalogProducts,
  previewOrAddCatalogRangeRequest,
  setCatalogProductStatusRequest,
  statusTone,
  type CatalogLensFamily,
  type CatalogMatrixPreview,
  type CatalogProduct,
  type CatalogProductStatus,
  type CatalogRange,
} from "@/app/lib/admin-catalog";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const labelClass =
  "text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)";
const inputClass =
  "h-10 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)";
const selectClass =
  "h-10 w-full rounded-xl border border-(--brand-input-border) bg-(--brand-input-bg) px-3 text-sm text-(--brand-text) outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const sectionClass =
  "space-y-3 rounded-2xl border border-(--brand-card-border) bg-(--brand-input-bg)/40 p-4";
const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";
const successBannerClass =
  "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100";

type CreateForm = {
  lensFamily: CatalogLensFamily;
  category: string;
  brand: string;
  item: string;
  index: string;
  coating: string;
  progressiveType: string;
  defaultPrice: string;
  defaultCostPrice: string;
  notes: string;
};

const EMPTY_CREATE: CreateForm = {
  lensFamily: "SINGLE_VISION",
  category: "",
  brand: "",
  item: "",
  index: "1.56",
  coating: "",
  progressiveType: "",
  defaultPrice: "",
  defaultCostPrice: "",
  notes: "",
};

type RangeForm = {
  sphStart: string;
  sphEnd: string;
  cylStart: string;
  cylEnd: string;
  add: string;
  axis: string;
  eye: string;
  price: string;
  label: string;
};

const EMPTY_RANGE: RangeForm = {
  sphStart: "0",
  sphEnd: "-6",
  cylStart: "0",
  cylEnd: "-2",
  add: "",
  axis: "",
  eye: "LEFT",
  price: "",
  label: "",
};

function errorMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

function productTitle(p: CatalogProduct) {
  const parts = [p.brand, p.item, p.coating].filter(Boolean);
  return parts.join(" · ") || p.identityKey;
}

export default function ProductsCatalogPage() {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [lensFamily, setLensFamily] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CatalogProduct | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  const [rangeForm, setRangeForm] = useState<RangeForm>(EMPTY_RANGE);
  const [preview, setPreview] = useState<CatalogMatrixPreview | null>(null);
  const [rangeBusy, setRangeBusy] = useState(false);
  const [rangeError, setRangeError] = useState("");
  const [rangeSuccess, setRangeSuccess] = useState("");
  const [overlapHint, setOverlapHint] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const res = await fetchCatalogProducts({
        q: qDebounced || undefined,
        lensFamily: lensFamily || undefined,
        status: status || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setProducts(res.products);
      setTotal(res.total);
    } catch (err) {
      setListError(errorMessage(err, "Failed to load catalog products."));
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [qDebounced, lensFamily, status, page]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    setPage(1);
  }, [qDebounced, lensFamily, status]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError("");
    try {
      const res = await fetchCatalogProduct(id);
      setDetail(res.product);
      setRangeForm({
        ...EMPTY_RANGE,
        price: String(res.product.defaultPrice),
      });
      setPreview(null);
      setRangeError("");
      setRangeSuccess("");
      setOverlapHint(null);
    } catch (err) {
      setDetailError(errorMessage(err, "Failed to load product."));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function handleCreate() {
    setCreateBusy(true);
    setCreateError("");
    try {
      const price = Number(createForm.defaultPrice);
      if (!(price > 0)) {
        setCreateError("Default selling price must be a positive number.");
        return;
      }
      const indexNum =
        createForm.index.trim() === "" ? null : Number(createForm.index);
      if (
        (createForm.lensFamily === "SINGLE_VISION" ||
          createForm.lensFamily === "PROGRESSIVE") &&
        (indexNum == null || !Number.isFinite(indexNum))
      ) {
        setCreateError("Index is required for this lens family.");
        return;
      }
      const res = await createCatalogProductRequest({
        lensFamily: createForm.lensFamily,
        category: createForm.category.trim() || null,
        brand: createForm.brand.trim(),
        item: createForm.item.trim() || null,
        index: indexNum,
        coating: createForm.coating.trim(),
        progressiveType: createForm.progressiveType.trim() || null,
        defaultPrice: price,
        defaultCostPrice:
          createForm.defaultCostPrice.trim() === ""
            ? null
            : Number(createForm.defaultCostPrice),
        notes: createForm.notes.trim() || null,
      });
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE);
      setSelectedId(res.product.id);
      await loadList();
    } catch (err) {
      if (
        err instanceof AdminApiError &&
        err.code === "LEGACY_IDENTITY_EXISTS"
      ) {
        const link = window.confirm(
          `${errorMessage(err, "Legacy inventory exists for this identity.")}\n\nLink existing legacy bands into a catalog facade without changing stock? (Does not split band quantities.)`
        );
        if (link) {
          try {
            const res = await createCatalogProductRequest({
              lensFamily: createForm.lensFamily,
              category: createForm.category.trim() || null,
              brand: createForm.brand.trim(),
              item: createForm.item.trim() || null,
              index:
                createForm.index.trim() === ""
                  ? null
                  : Number(createForm.index),
              coating: createForm.coating.trim(),
              progressiveType: createForm.progressiveType.trim() || null,
              defaultPrice: Number(createForm.defaultPrice),
              defaultCostPrice:
                createForm.defaultCostPrice.trim() === ""
                  ? null
                  : Number(createForm.defaultCostPrice),
              notes: createForm.notes.trim() || null,
              linkLegacy: true,
            });
            setCreateOpen(false);
            setCreateForm(EMPTY_CREATE);
            setSelectedId(res.product.id);
            await loadList();
            return;
          } catch (linkErr) {
            setCreateError(
              errorMessage(linkErr, "Could not link legacy product.")
            );
            return;
          }
        }
      }
      setCreateError(errorMessage(err, "Could not create product."));
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleStatus(next: CatalogProductStatus) {
    if (!detail) return;
    const verb =
      next === "HELD"
        ? "hold"
        : next === "ARCHIVED"
          ? "archive"
          : next === "ACTIVE" && detail.status === "HELD"
            ? "unhold"
            : "unarchive";
    if (
      !window.confirm(
        `Confirm ${verb} for “${productTitle(detail)}”? Customer catalog and wholesale will update accordingly.`
      )
    ) {
      return;
    }
    setStatusBusy(true);
    setDetailError("");
    try {
      const res = await setCatalogProductStatusRequest(detail.id, next);
      setDetail(res.product);
      await loadList();
    } catch (err) {
      setDetailError(errorMessage(err, "Status update failed."));
    } finally {
      setStatusBusy(false);
    }
  }

  function parseRangePayload(previewOnly: boolean) {
    const sphStart = Number(rangeForm.sphStart);
    const sphEnd = Number(rangeForm.sphEnd);
    const cylStart =
      rangeForm.cylStart.trim() === "" ? null : Number(rangeForm.cylStart);
    const cylEnd =
      rangeForm.cylEnd.trim() === "" ? null : Number(rangeForm.cylEnd);
    return {
      sphStart,
      sphEnd,
      cylStart,
      cylEnd,
      add: rangeForm.add.trim() === "" ? null : Number(rangeForm.add),
      axis: rangeForm.axis.trim() === "" ? null : Number(rangeForm.axis),
      eye: rangeForm.eye || null,
      price: rangeForm.price.trim() === "" ? null : Number(rangeForm.price),
      label: rangeForm.label.trim() || null,
      previewOnly,
    };
  }

  async function handlePreviewRange() {
    if (!detail) return;
    setRangeBusy(true);
    setRangeError("");
    setRangeSuccess("");
    setOverlapHint(null);
    setPreview(null);
    try {
      const res = await previewOrAddCatalogRangeRequest(
        detail.id,
        parseRangePayload(true)
      );
      if (res.preview) setPreview(res.preview);
    } catch (err) {
      const msg = errorMessage(err, "Preview failed.");
      setRangeError(msg);
      if (err instanceof AdminApiError && err.code === "RANGE_OVERLAP") {
        const nested = err.details.details as
          | { suggestedSphStart?: number }
          | undefined;
        if (nested?.suggestedSphStart != null) {
          setOverlapHint(
            `Suggested non-overlapping SPH start: ${nested.suggestedSphStart}. Apply only if you approve.`
          );
        }
      }
    } finally {
      setRangeBusy(false);
    }
  }

  async function handleConfirmRange() {
    if (!detail) return;
    if (!preview) {
      setRangeError("Preview the matrix before generating.");
      return;
    }
    if (
      !window.confirm(
        `Generate range “${preview.label}” with ${preview.powerCount} independent power SKUs? Each SPH×CYL cell gets its own inventory row (stock starts at 0).`
      )
    ) {
      return;
    }
    setRangeBusy(true);
    setRangeError("");
    setRangeSuccess("");
    try {
      const res = await previewOrAddCatalogRangeRequest(
        detail.id,
        parseRangePayload(false)
      );
      if (res.range) {
        const n = res.powerCount ?? res.range.powerCount;
        setRangeSuccess(
          `Range ${res.range.label} created — ${n} power-wise inventory SKU(s).`
        );
        setPreview(null);
        await loadDetail(detail.id);
        await loadList();
      }
    } catch (err) {
      setRangeError(errorMessage(err, "Range generation failed."));
    } finally {
      setRangeBusy(false);
    }
  }

  // Detail view
  if (selectedId) {
    return (
      <AdminPage title="Product detail" subtitle="Products & catalog">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => setSelectedId(null)}
          >
            <ArrowLeft className="size-4" />
            Back to list
          </Button>
          {detail ? (
            <Link
              href="/inventory/stock-overview"
              className="text-sm text-(--brand-primary) underline-offset-2 hover:underline"
            >
              Stock Overview
            </Link>
          ) : null}
          {detail ? (
            <Link
              href="/inventory/power-wise-stock"
              className="text-sm text-(--brand-primary) underline-offset-2 hover:underline"
            >
              Power-wise Stock
            </Link>
          ) : null}
        </div>

        {detailLoading ? (
          <TableSkeleton rows={6} />
        ) : detailError && !detail ? (
          <p className={errorBannerClass}>{detailError}</p>
        ) : detail ? (
          <div className="space-y-6">
            {detailError ? <p className={errorBannerClass}>{detailError}</p> : null}

            <div className={sectionClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-(--brand-text-muted)">
                    {familyLabel(detail.lensFamily)}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-(--brand-text)">
                    {productTitle(detail)}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-(--brand-text-muted)">
                    {detail.identityKey}
                  </p>
                </div>
                <Badge variant={statusTone(detail.status)}>{detail.status}</Badge>
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className={labelClass}>Index</dt>
                  <dd>{detail.index ?? "—"}</dd>
                </div>
                <div>
                  <dt className={labelClass}>Category</dt>
                  <dd>{detail.category || "—"}</dd>
                </div>
                <div>
                  <dt className={labelClass}>Default price</dt>
                  <dd>₹{detail.defaultPrice}</dd>
                </div>
                <div>
                  <dt className={labelClass}>Power SKUs</dt>
                  <dd>{detail.powerCount}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {detail.status === "ACTIVE" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={statusBusy}
                    onClick={() => void handleStatus("HELD")}
                  >
                    <PauseCircle className="size-4" />
                    Hold
                  </Button>
                ) : null}
                {detail.status === "HELD" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={statusBusy}
                    onClick={() => void handleStatus("ACTIVE")}
                  >
                    <PlayCircle className="size-4" />
                    Unhold
                  </Button>
                ) : null}
                {detail.status !== "ARCHIVED" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={statusBusy}
                    onClick={() => void handleStatus("ARCHIVED")}
                  >
                    <Archive className="size-4" />
                    Archive
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={statusBusy}
                    onClick={() => void handleStatus("ACTIVE")}
                  >
                    <PlayCircle className="size-4" />
                    Unarchive
                  </Button>
                )}
              </div>
            </div>

            <div className={sectionClass}>
              <h3 className="text-sm font-semibold text-(--brand-text)">
                Ranges ({detail.ranges?.length ?? 0})
              </h3>
              {!detail.ranges?.length ? (
                <p className="text-sm text-(--brand-text-muted)">
                  No ranges yet. Add a power band below.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>SPH</TableHead>
                      <TableHead>CYL</TableHead>
                      <TableHead>Storage</TableHead>
                      <TableHead>Extras</TableHead>
                      <TableHead className="text-right">SKUs</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.ranges.map((r: CatalogRange) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.label}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.sphStart}…{r.sphEnd}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.cylStart != null && r.cylEnd != null
                            ? `${r.cylStart}…${r.cylEnd}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.leafStorage === "LEGACY_BAND"
                            ? "Legacy band"
                            : "Power-wise"}
                        </TableCell>
                        <TableCell className="text-xs text-(--brand-text-muted)">
                          {[
                            r.add != null ? `ADD ${r.add}` : null,
                            r.axis != null ? `Axis ${r.axis}` : null,
                            r.eye,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.leafCount ?? r.powerCount}
                        </TableCell>
                        <TableCell className="text-right">₹{r.price}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {detail.status !== "ARCHIVED" ? (
              <div className={sectionClass}>
                <h3 className="text-sm font-semibold text-(--brand-text)">
                  Add range
                </h3>
                <p className="text-sm text-(--brand-text-muted)">
                  Define SPH/CYL bounds (0.25 D steps). Preview the matrix, then
                  confirm to create one independent inventory SKU per power cell
                  (quantity 0). Overlap with existing catalog or legacy bands is
                  rejected.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className={labelClass}>SPH start</label>
                    <Input
                      className={inputClass}
                      value={rangeForm.sphStart}
                      onChange={(e) =>
                        setRangeForm((f) => ({ ...f, sphStart: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>SPH end</label>
                    <Input
                      className={inputClass}
                      value={rangeForm.sphEnd}
                      onChange={(e) =>
                        setRangeForm((f) => ({ ...f, sphEnd: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>CYL start</label>
                    <Input
                      className={inputClass}
                      value={rangeForm.cylStart}
                      onChange={(e) =>
                        setRangeForm((f) => ({ ...f, cylStart: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>CYL end</label>
                    <Input
                      className={inputClass}
                      value={rangeForm.cylEnd}
                      onChange={(e) =>
                        setRangeForm((f) => ({ ...f, cylEnd: e.target.value }))
                      }
                    />
                  </div>
                  {(detail.lensFamily === "KRYPTOK" ||
                    detail.lensFamily === "PROGRESSIVE") && (
                    <>
                      <div>
                        <label className={labelClass}>ADD</label>
                        <Input
                          className={inputClass}
                          value={rangeForm.add}
                          onChange={(e) =>
                            setRangeForm((f) => ({ ...f, add: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Axis (optional)</label>
                        <Input
                          className={inputClass}
                          value={rangeForm.axis}
                          onChange={(e) =>
                            setRangeForm((f) => ({ ...f, axis: e.target.value }))
                          }
                        />
                      </div>
                    </>
                  )}
                  {detail.lensFamily === "PROGRESSIVE" ? (
                    <div>
                      <label className={labelClass}>Eye</label>
                      <select
                        className={selectClass}
                        value={rangeForm.eye}
                        onChange={(e) =>
                          setRangeForm((f) => ({ ...f, eye: e.target.value }))
                        }
                      >
                        <option value="LEFT">LEFT</option>
                        <option value="RIGHT">RIGHT</option>
                      </select>
                    </div>
                  ) : null}
                  <div>
                    <label className={labelClass}>Price (optional)</label>
                    <Input
                      className={inputClass}
                      value={rangeForm.price}
                      onChange={(e) =>
                        setRangeForm((f) => ({ ...f, price: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Label (optional)</label>
                    <Input
                      className={inputClass}
                      placeholder="e.g. -6×2"
                      value={rangeForm.label}
                      onChange={(e) =>
                        setRangeForm((f) => ({ ...f, label: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {rangeError ? <p className={errorBannerClass}>{rangeError}</p> : null}
                {overlapHint ? (
                  <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                    {overlapHint}
                  </p>
                ) : null}
                {rangeSuccess ? (
                  <p className={successBannerClass}>{rangeSuccess}</p>
                ) : null}

                {preview ? (
                  <div className="rounded-xl border border-(--brand-card-border) p-3 text-sm">
                    <p className="font-medium text-(--brand-text)">
                      Preview: {preview.label} · {preview.powerCount} powers
                    </p>
                    <p className="mt-1 text-(--brand-text-muted)">
                      SPH steps: {preview.sphOptions.length}
                      {preview.cylOptions.length
                        ? ` · CYL steps: ${preview.cylOptions.length}`
                        : ""}
                    </p>
                    <p className="mt-2 font-mono text-xs text-(--brand-text-muted)">
                      Sample:{" "}
                      {preview.sampleCells
                        .slice(0, 6)
                        .map((c) =>
                          c.cyl == null ? `${c.sph}` : `${c.sph}/${c.cyl}`
                        )
                        .join(", ")}
                      {preview.sampleCells.length > 6 ? "…" : ""}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    disabled={rangeBusy}
                    onClick={() => void handlePreviewRange()}
                  >
                    {rangeBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                    Preview matrix
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl"
                    disabled={rangeBusy || !preview}
                    onClick={() => void handleConfirmRange()}
                  >
                    {rangeBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Generate range
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </AdminPage>
    );
  }

  // List view
  return (
    <AdminPage title="Products & catalog" subtitle="Inventory">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-(--brand-text-muted)" />
            <Input
              className={cn(inputClass, "pl-9")}
              placeholder="Search brand, coating, item…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className={cn(selectClass, "sm:w-44")}
            value={lensFamily}
            onChange={(e) => setLensFamily(e.target.value)}
          >
            <option value="">All lens types</option>
            <option value="SINGLE_VISION">Single Vision</option>
            <option value="KRYPTOK">Kryptok</option>
            <option value="PROGRESSIVE">Progressive</option>
          </select>
          <select
            className={cn(selectClass, "sm:w-40")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="HELD">Held</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        <Button
          type="button"
          className="rounded-xl"
          onClick={() => {
            setCreateForm(EMPTY_CREATE);
            setCreateError("");
            setCreateOpen(true);
          }}
        >
          <Plus className="size-4" />
          Create product
        </Button>
      </div>

      {listError ? <p className={cn(errorBannerClass, "mb-3")}>{listError}</p> : null}

      {loading ? (
        <TableSkeleton rows={8} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Index</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ranges</TableHead>
                <TableHead className="text-right">Powers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-(--brand-text-muted)"
                  >
                    No catalog products yet. Create one to define ranges and
                    generate power bands.
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(p.id)}
                  >
                    <TableCell>
                      <div className="font-medium text-(--brand-text)">
                        {productTitle(p)}
                      </div>
                      <div className="font-mono text-[11px] text-(--brand-text-muted)">
                        {p.identityKey}
                      </div>
                    </TableCell>
                    <TableCell>{familyLabel(p.lensFamily)}</TableCell>
                    <TableCell>{p.index ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusTone(p.status)}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{p.rangeCount}</TableCell>
                    <TableCell className="text-right">{p.powerCount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="text-sm text-(--brand-text-muted)">
              {total} product{total === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-sm text-(--brand-text)">
                {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="flex w-full flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Create product</SheetTitle>
            <SheetDescription>
              Define product identity first. Ranges and power bands are added on
              the detail screen.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto px-1 py-4">
            {createError ? <p className={errorBannerClass}>{createError}</p> : null}
            <div>
              <label className={labelClass}>Lens type</label>
              <select
                className={selectClass}
                value={createForm.lensFamily}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    lensFamily: e.target.value as CatalogLensFamily,
                  }))
                }
              >
                <option value="SINGLE_VISION">Single Vision</option>
                <option value="KRYPTOK">Kryptok</option>
                <option value="PROGRESSIVE">Progressive</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Brand</label>
              <Input
                className={inputClass}
                value={createForm.brand}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, brand: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={labelClass}>Coating</label>
              <Input
                className={inputClass}
                value={createForm.coating}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, coating: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={labelClass}>Item / product line</label>
              <Input
                className={inputClass}
                value={createForm.item}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, item: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={labelClass}>Category / kind</label>
              <Input
                className={inputClass}
                value={createForm.category}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, category: e.target.value }))
                }
              />
            </div>
            {(createForm.lensFamily === "SINGLE_VISION" ||
              createForm.lensFamily === "PROGRESSIVE") && (
              <div>
                <label className={labelClass}>Index</label>
                <Input
                  className={inputClass}
                  value={createForm.index}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, index: e.target.value }))
                  }
                />
              </div>
            )}
            {createForm.lensFamily === "PROGRESSIVE" ? (
              <div>
                <label className={labelClass}>Progressive type</label>
                <Input
                  className={inputClass}
                  value={createForm.progressiveType}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      progressiveType: e.target.value,
                    }))
                  }
                />
              </div>
            ) : null}
            <div>
              <label className={labelClass}>Default selling price</label>
              <Input
                className={inputClass}
                type="number"
                min={0}
                step="0.01"
                value={createForm.defaultPrice}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, defaultPrice: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={labelClass}>Cost price (optional)</label>
              <Input
                className={inputClass}
                type="number"
                min={0}
                step="0.01"
                value={createForm.defaultCostPrice}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    defaultCostPrice: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className={labelClass}>Notes</label>
              <Input
                className={inputClass}
                value={createForm.notes}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <SheetFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={createBusy}
              onClick={() => void handleCreate()}
            >
              {createBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Create
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </AdminPage>
  );
}
