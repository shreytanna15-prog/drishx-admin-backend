"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { AdminOrderControlPanel } from "@/components/admin-order-control-panel";
import { AdminOrderRefundPanel } from "@/components/admin-order-refund-panel";
import { AdminAlternatePowerPanel } from "@/components/admin-alternate-power-panel";
import { Badge } from "@/components/ui/badge";
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
  type AdminOrder,
  formatCatalogSummary,
  formatDate,
  formatLensType,
  formatMoney,
  formatOrderDisplayId,
  formatPrescription,
  formatStatus,
  formatWholesaleLinePower,
  getOrderCatalogLens,
  isColorLensOrder,
  isRxOrder,
  resolveOrdersBackHref,
  statusBadgeClass,
} from "@/app/lib/admin-orders";
import {
  formatPlacedByAdminBadge,
  isAdminPanelOrder,
  placedByDisplayName,
} from "@/app/lib/order-attribution";
import { cn } from "@/lib/utils";
import { EntityTimeline } from "@/components/audit/entity-timeline";

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-(--brand-card-border) py-3 last:border-b-0 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm font-semibold text-(--brand-label)">{label}</dt>
      <dd className="text-sm text-(--brand-text)">{value || "—"}</dd>
    </div>
  );
}

function cleanNotes(notes: string | null | undefined) {
  if (!notes?.trim()) return "";
  return notes
    .replace(/^\[RX Order\]\s*/m, "")
    .replace(/^\[Color Lens\]\s*/m, "")
    .trim();
}

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<AdminPage title="Order details" subtitle="Order control & details"><DetailSkeleton cards={4} /></AdminPage>}>
      <OrderDetailPageContent />
    </Suspense>
  );
}

function OrderDetailPageContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params?.id;
  const backHref = useMemo(
    () => resolveOrdersBackHref(searchParams),
    [searchParams]
  );

  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadOrder() {
      setLoading(true);
      setError("");
      try {
        const data = await adminFetch<AdminOrder>(`/api/orders/${id}`);
        if (!cancelled) setOrder(data ?? null);
      } catch (err) {
        if (!cancelled) {
          setOrder(null);
          setError(
            err instanceof AdminApiError
              ? err.message
              : "Failed to load order details."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOrder();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (loading || !order) return;
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#create-return-on-behalf") return;
    const el = document.getElementById("create-return-on-behalf");
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [loading, order]);

  const displayId = order ? formatOrderDisplayId(order) : "Order details";
  const catalogLens = order ? getOrderCatalogLens(order) : null;
  const notesBody = cleanNotes(order?.notes);
  const wholesaleLines = order?.wholesaleLineItems ?? [];
  const lineLabel =
    order?.lineType === "WHOLESALE" ? "Wholesale" : "Retail";

  return (
    <AdminPage title={displayId} subtitle="Order control & details">
      <div className="mb-5">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--brand-link) hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to orders
        </Link>
      </div>

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <DetailSkeleton cards={4} />
      ) : !order ? (
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
          Order not found.
        </div>
      ) : (
        <div className="mx-auto grid max-w-4xl gap-4">
          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
                  {displayId}
                </h1>
                <p className="mt-1 text-sm text-(--brand-text-muted)">
                  {lineLabel} · {formatLensType(order.lensType)} · Placed{" "}
                  {formatDate(order.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-lg font-bold",
                    statusBadgeClass(order.status)
                  )}
                >
                  {formatStatus(order.status)}
                </Badge>
                {isRxOrder(order) ? (
                  <Badge
                    variant="outline"
                    className="rounded-lg border-(--brand-card-border) font-bold text-(--brand-text-muted)"
                  >
                    RX Order
                  </Badge>
                ) : null}
                {isColorLensOrder(order) ? (
                  <Badge
                    variant="outline"
                    className="rounded-lg border-(--brand-card-border) font-bold text-(--brand-text-muted)"
                  >
                    Color Lens
                  </Badge>
                ) : null}
                {isAdminPanelOrder(order) ? (
                  <Badge
                    variant="outline"
                    className="rounded-lg border-(--brand-primary)/40 font-bold text-(--brand-primary)"
                  >
                    {formatPlacedByAdminBadge(order) ?? "Placed by admin"}
                  </Badge>
                ) : null}
              </div>
            </div>
          </section>

          <AdminOrderControlPanel order={order} onUpdated={setOrder} />
          <AdminOrderRefundPanel orderId={order.id} />
          <AdminAlternatePowerPanel order={order} onUpdated={setOrder} />

          {isAdminPanelOrder(order) ? (
            <section className="rounded-2xl border border-(--brand-primary)/30 bg-(--brand-primary)/8 p-5 shadow-(--brand-card-shadow) sm:p-6">
              <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Placement attribution
              </h2>
              <dl>
                <DetailRow label="Source" value="Admin panel" />
                <DetailRow
                  label="Placed by"
                  value={placedByDisplayName(order) || "Administrator"}
                />
                <DetailRow
                  label="Placed at"
                  value={formatDate(order.createdAt)}
                />
                <DetailRow
                  label="Customer account"
                  value={
                    order.user?.businessName?.trim() ||
                    order.user?.name?.trim() ||
                    order.user?.email ||
                    "—"
                  }
                />
              </dl>
            </section>
          ) : null}

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Customer
            </h2>
            <dl>
              <DetailRow
                label="Name"
                value={order.user?.name?.trim() || "Unnamed customer"}
              />
              <DetailRow label="Email" value={order.user?.email || "—"} />
              <DetailRow
                label="Business"
                value={order.user?.businessName?.trim() || "—"}
              />
              {order.user?.id ? (
                <DetailRow
                  label="Profile"
                  value={
                    <Link
                      href={`/clients/${order.user.id}`}
                      className="font-semibold text-(--brand-link) hover:underline"
                    >
                      View client
                    </Link>
                  }
                />
              ) : null}
            </dl>
          </section>

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Product & prescription
            </h2>
            <dl>
              <DetailRow
                label="Lens type"
                value={formatLensType(order.lensType)}
              />
              <DetailRow
                label="Catalog"
                value={formatCatalogSummary(order)}
              />
              {catalogLens ? (
                <>
                  {catalogLens.brand ? (
                    <DetailRow label="Brand" value={catalogLens.brand} />
                  ) : null}
                  {catalogLens.category ? (
                    <DetailRow label="Category" value={catalogLens.category} />
                  ) : null}
                  {catalogLens.item ? (
                    <DetailRow label="Item" value={catalogLens.item} />
                  ) : null}
                  {catalogLens.coating ? (
                    <DetailRow label="Coating" value={catalogLens.coating} />
                  ) : null}
                  {catalogLens.index != null ? (
                    <DetailRow label="Index" value={String(catalogLens.index)} />
                  ) : null}
                </>
              ) : null}
              <DetailRow
                label="Prescription"
                value={formatPrescription(order)}
              />
              {order.orderImageUrl ? (
                <DetailRow
                  label="Image"
                  value={
                    <a
                      href={order.orderImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-(--brand-link) hover:underline"
                    >
                      View prescription image
                    </a>
                  }
                />
              ) : null}
            </dl>
          </section>

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Quantities & amount
            </h2>
            <dl>
              <DetailRow label="Ordered qty" value={order.quantity} />
              <DetailRow
                label="Reserved"
                value={
                  order.reservedQuantity != null ? order.reservedQuantity : "—"
                }
              />
              <DetailRow
                label="Picked"
                value={order.pickedQuantity != null ? order.pickedQuantity : "—"}
              />
              <DetailRow
                label="Price per pair"
                value={formatMoney(order.unitPrice)}
              />
              <DetailRow
                label="Total"
                value={
                  <span className="font-semibold">
                    {formatMoney(order.totalAmount)}
                  </span>
                }
              />
            </dl>
          </section>

          {wholesaleLines.length > 0 ? (
            <section className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
              <div className="border-b border-(--brand-card-border) px-5 py-4 sm:px-6">
                <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                  Wholesale line items
                </h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-(--brand-card-border) hover:bg-transparent">
                    <TableHead className="text-(--brand-label)">Power</TableHead>
                    <TableHead className="text-(--brand-label)">Qty</TableHead>
                    <TableHead className="text-(--brand-label)">Reserved</TableHead>
                    <TableHead className="text-(--brand-label)">Unit</TableHead>
                    <TableHead className="text-(--brand-label)">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wholesaleLines.map((line) => (
                    <TableRow
                      key={line.id}
                      className="border-(--brand-card-border)"
                    >
                      <TableCell className="text-(--brand-text)">
                        {formatWholesaleLinePower(line)}
                        {line.needsProcurement ? (
                          <div className="mt-0.5 text-xs text-[#60a5fa]">
                            Needs procurement
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-(--brand-text)">
                        {line.quantity}
                      </TableCell>
                      <TableCell className="text-(--brand-text)">
                        {line.reservedQuantity ?? "—"}
                      </TableCell>
                      <TableCell className="text-(--brand-text)">
                        {line.unitPrice != null
                          ? formatMoney(line.unitPrice)
                          : "—"}
                      </TableCell>
                      <TableCell className="font-semibold text-(--brand-text)">
                        {line.totalAmount != null
                          ? formatMoney(line.totalAmount)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ) : null}

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Assignment & shipping
            </h2>
            <dl>
              <DetailRow
                label="Assigned to"
                value={
                  order.assignedTo
                    ? order.assignedTo.name?.trim() || order.assignedTo.email
                    : "Unassigned"
                }
              />
              {order.assignedTo?.email ? (
                <DetailRow label="Assignee email" value={order.assignedTo.email} />
              ) : null}
              <DetailRow
                label="Assigned at"
                value={order.assignedAt ? formatDate(order.assignedAt) : "—"}
              />
              <DetailRow label="Courier" value={order.courierName || "—"} />
              <DetailRow
                label="Tracking #"
                value={order.trackingNumber || "—"}
              />
              <DetailRow
                label="Cancel reason"
                value={order.cancelReason || "—"}
              />
              <DetailRow
                label="Checkout batch"
                value={order.checkoutBatchId || "—"}
              />
              <DetailRow
                label="Updated"
                value={order.updatedAt ? formatDate(order.updatedAt) : "—"}
              />
              <DetailRow
                label="Order ID"
                value={
                  <span className="break-all font-mono text-xs">{order.id}</span>
                }
              />
            </dl>
          </section>

          {notesBody ? (
            <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
              <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Customer notes
              </h2>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-(--brand-text)">
                {notesBody}
              </pre>
            </section>
          ) : null}

          {order.internalNotes?.trim() ? (
            <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
              <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Internal notes
              </h2>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-(--brand-text)">
                {order.internalNotes}
              </pre>
            </section>
          ) : null}

          {id ? (
            <EntityTimeline entityType="Order" entityId={id} title="Audit timeline" />
          ) : null}
        </div>
      )}
    </AdminPage>
  );
}
