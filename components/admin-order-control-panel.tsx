"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminCreateReturnPanel } from "@/components/admin-create-return-panel";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { invalidateListCache } from "@/app/lib/admin-cache";
import {
  type AdminOrder,
  formatDate,
  formatMoney,
  formatStatus,
  getStaffStatusOptions,
  isAdminHeldWarehouseOrder,
  isEditableOrderStatus,
  isPrescriptionLabOrder,
} from "@/app/lib/admin-orders";
import type { AdminEmployee } from "@/app/lib/admin-employees";

const selectClass =
  "h-10 w-full rounded-lg border border-(--brand-card-border) bg-(--brand-card) px-3 text-sm text-(--brand-text) [&>option]:bg-(--brand-card) [&>option]:text-(--brand-text)";
const labelClass = "mb-1 block text-xs font-semibold text-(--brand-label)";
const textareaClass =
  "min-h-20 w-full rounded-lg border border-(--brand-card-border) bg-transparent px-3 py-2 text-sm text-(--brand-text)";

type AdminOrderControlPanelProps = {
  order: AdminOrder;
  onUpdated: (order: AdminOrder) => void;
};

export function AdminOrderControlPanel({
  order,
  onUpdated,
}: AdminOrderControlPanelProps) {
  const router = useRouter();
  const statusOptions = useMemo(
    () => getStaffStatusOptions(order.status),
    [order.status]
  );

  const [nextStatus, setNextStatus] = useState(statusOptions[0] ?? "");
  const [pickedQuantity, setPickedQuantity] = useState(
    String(order.pickedQuantity ?? 0)
  );
  const [cancelReason, setCancelReason] = useState(order.cancelReason ?? "");
  const [internalNotes, setInternalNotes] = useState(order.internalNotes ?? "");
  const [courierName, setCourierName] = useState(order.courierName ?? "");
  const [trackingNumber, setTrackingNumber] = useState(
    order.trackingNumber ?? ""
  );
  const [assigneeId, setAssigneeId] = useState(order.assignedToId ?? "");
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // Delivery module
  const [deliveryServices, setDeliveryServices] = useState<
    Array<{ id: string; serviceName: string; customerRate: number; etaText?: string | null }>
  >([]);
  const [deliveryServiceId, setDeliveryServiceId] = useState(order.deliveryServiceId ?? "");
  const [packWeight, setPackWeight] = useState(
    order.delivery?.actualWeight != null ? String(order.delivery.actualWeight) : ""
  );
  const [weightReason, setWeightReason] = useState("");

  const [editQty, setEditQty] = useState(String(order.quantity));
  const [editUnitPrice, setEditUnitPrice] = useState(String(order.unitPrice));
  const [editSph, setEditSph] = useState(order.sph != null ? String(order.sph) : "");
  const [editCyl, setEditCyl] = useState(order.cyl != null ? String(order.cyl) : "");
  const [editAxis, setEditAxis] = useState(
    order.axis != null ? String(order.axis) : ""
  );
  const [editAdd, setEditAdd] = useState(order.add != null ? String(order.add) : "");
  const [editNotes, setEditNotes] = useState(
    (order.notes ?? "").replace(/^\[RX Order\]\s*/m, "").replace(/^\[Color Lens\]\s*/m, "")
  );

  /* eslint-disable react-hooks/set-state-in-effect -- standard prop-to-state sync for admin form panel */
  useEffect(() => {
    setNextStatus(getStaffStatusOptions(order.status)[0] ?? "");
    setPickedQuantity(String(order.pickedQuantity ?? 0));
    setCancelReason(order.cancelReason ?? "");
    setInternalNotes(order.internalNotes ?? "");
    setCourierName(order.courierName ?? "");
    setTrackingNumber(order.trackingNumber ?? "");
    setAssigneeId(order.assignedToId ?? "");
    setDeliveryServiceId(order.deliveryServiceId ?? "");
    setPackWeight(order.delivery?.actualWeight != null ? String(order.delivery.actualWeight) : "");
    setWeightReason("");
    setEditQty(String(order.quantity));
    setEditUnitPrice(String(order.unitPrice));
    setEditSph(order.sph != null ? String(order.sph) : "");
    setEditCyl(order.cyl != null ? String(order.cyl) : "");
    setEditAxis(order.axis != null ? String(order.axis) : "");
    setEditAdd(order.add != null ? String(order.add) : "");
    setEditNotes(
      (order.notes ?? "")
        .replace(/^\[RX Order\]\s*/m, "")
        .replace(/^\[Color Lens\]\s*/m, "")
    );
  }, [order]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    let cancelled = false;
    async function loadEmployees() {
      try {
        const data = await adminFetch<{ employees: AdminEmployee[] }>(
          "/api/users/employees"
        );
        if (!cancelled) setEmployees(Array.isArray(data.employees) ? data.employees : []);
      } catch {
        if (!cancelled) setEmployees([]);
      }
    }
    async function loadDeliveryServices() {
      try {
        const data = await adminFetch<
          Array<{ id: string; serviceName: string; customerRate: number; etaText?: string | null }>
        >("/api/delivery-services?all=1");
        if (!cancelled) setDeliveryServices(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setDeliveryServices([]);
      }
    }
    void loadEmployees();
    void loadDeliveryServices();
    return () => {
      cancelled = true;
    };
  }, []);

  async function putOrder(body: Record<string, unknown>, actionKey: string) {
    setBusy(actionKey);
    setError("");
    setMessage("");
    try {
      const updated = await adminFetch<AdminOrder>(`/api/orders/${order.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      invalidateListCache("orders");
      onUpdated(updated);
      setMessage("Order updated.");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Update failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleStatusSave() {
    if (!nextStatus) return;
    // Dispatching must go through the dedicated dispatch API so courier +
    // tracking are validated (no silent dispatch without them).
    if (nextStatus === "DISPATCHED") {
      await dispatchToCourier();
      return;
    }
    const body: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === "CANCELLED") {
      body.cancelReason = cancelReason.trim() || null;
    }
    await putOrder(body, "status");
  }

  async function handlePickSave() {
    const qty = Math.max(0, Math.floor(Number(pickedQuantity)));
    await putOrder(
      { status: order.status, pickedQuantity: qty },
      "pick"
    );
  }

  async function handleReassign() {
    await putOrder(
      {
        status: order.status,
        assignedToId: assigneeId || null,
      },
      "assign"
    );
  }

  async function handleWarehouseRelease() {
    setBusy("release");
    setError("");
    setMessage("");
    try {
      const res = await adminFetch<{ order: AdminOrder; message?: string }>(
        `/api/orders/${order.id}/warehouse-release`,
        { method: "POST", body: "{}" }
      );
      invalidateListCache("orders");
      onUpdated(res.order);
      setMessage(
        res.message ||
          "Order released to warehouse. Assigned staff can now see it."
      );
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Warehouse release failed."
      );
    } finally {
      setBusy("");
    }
  }

  async function handleNotesSave() {
    await putOrder(
      { status: order.status, internalNotes: internalNotes.trim() || null },
      "notes"
    );
  }

  async function handleShippingSave() {
    // Once the parcel is packed, saving shipping means handing it to the
    // courier — route through the dedicated dispatch API for validation.
    if (order.status === "PACKED") {
      await dispatchToCourier();
      return;
    }
    // Other statuses: just record courier/tracking for later dispatch.
    await putOrder(
      {
        status: order.status,
        courierName: courierName.trim() || null,
        trackingNumber: trackingNumber.trim() || null,
      },
      "ship"
    );
  }

  async function dispatchToCourier() {
    const name = courierName.trim();
    const tracking = trackingNumber.trim();
    if (!name || !tracking) {
      setError("Courier name and tracking number are required to dispatch.");
      return;
    }
    setBusy("ship");
    setError("");
    setMessage("");
    try {
      const res = await adminFetch<{
        order: AdminOrder;
        duplicateWarning?: string | null;
      }>(`/api/orders/${order.id}/dispatch`, {
        method: "POST",
        body: JSON.stringify({
          courierName: name,
          trackingNumber: tracking,
        }),
      });
      invalidateListCache("orders");
      onUpdated(res.order);
      setMessage(res.duplicateWarning || "Order dispatched to courier.");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Dispatch failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleDeliveryServiceSave() {
    await putOrder(
      { status: order.status, deliveryServiceId: deliveryServiceId || null },
      "delivery-service"
    );
  }

  async function handlePackWithWeight() {
    const w = Number(packWeight);
    if (!Number.isFinite(w) || w <= 0) {
      setError("Enter the packed weight (kg) greater than 0.");
      return;
    }
    // Status machine requires PENDING → PICKING → PACKED. Walk through
    // PICKING automatically so staff can pack in one click.
    setBusy("pack");
    setError("");
    setMessage("");
    try {
      let current: AdminOrder = order;
      if (current.status !== "PICKING" && current.status !== "PACKED") {
        current = await adminFetch<AdminOrder>(`/api/orders/${order.id}`, {
          method: "PUT",
          body: JSON.stringify({ status: "PICKING" }),
        });
        onUpdated(current);
      }
      const body: Record<string, unknown> = {
        status: "PACKED",
        deliveryServiceId: deliveryServiceId || undefined,
        actualWeight: w,
      };
      if (current.delivery && weightReason.trim()) body.weightReason = weightReason.trim();
      const updated = await adminFetch<AdminOrder>(`/api/orders/${order.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      invalidateListCache("orders");
      onUpdated(updated);
      setMessage("Order packed with delivery charge.");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Pack failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleWeightCorrection() {
    const w = Number(packWeight);
    if (!Number.isFinite(w) || w <= 0) {
      setError("Enter the packed weight (kg) greater than 0.");
      return;
    }
    if (!weightReason.trim()) {
      setError("A reason is required to change the packed weight.");
      return;
    }
    // Include the selected service so switching Land → Air recalculates the charge.
    await putOrder(
      {
        status: order.status,
        deliveryServiceId: deliveryServiceId || undefined,
        actualWeight: w,
        weightReason: weightReason.trim(),
      },
      "weight"
    );
  }

  async function handleEditSave() {
    setBusy("edit");
    setError("");
    setMessage("");
    try {
      const isRetail = order.lineType === "RETAIL";
      const body: Record<string, unknown> = {
        quantity: Number(editQty),
        unitPrice: Number(editUnitPrice),
        notes: editNotes,
      };
      if (!isRetail) {
        body.sph = editSph === "" ? null : Number(editSph);
        body.cyl = editCyl === "" ? null : Number(editCyl);
        body.axis = editAxis === "" ? null : Number(editAxis);
        body.add = editAdd === "" ? null : Number(editAdd);
      }
      const updated = await adminFetch<AdminOrder>(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      invalidateListCache("orders");
      onUpdated(updated);
      setMessage("Order details saved.");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Edit failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Hard-delete this order? Prefer Cancel for normal ops. This cannot be undone."
      )
    ) {
      return;
    }
    setBusy("delete");
    setError("");
    try {
      await adminFetch(`/api/orders/${order.id}`, { method: "DELETE" });
      invalidateListCache("orders");
      router.push("/orders");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Delete failed.");
      setBusy("");
    }
  }

  const terminal = order.status === "COMPLETED" || order.status === "CANCELLED";

  return (
    <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
      <h2 className="mb-4 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
        Order control
      </h2>

      {error ? (
        <div className="auth-alert-error mb-3" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mb-3 rounded-lg border border-(--brand-success-border) bg-(--brand-success-bg) px-3 py-2 text-sm text-(--brand-success)">
          {message}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        {order.user?.id ? (
          <Link
            href={`/clients/${order.user.id}`}
            className="font-semibold text-(--brand-link) hover:underline"
          >
            Client
          </Link>
        ) : null}
        {order.invoice?.id ? (
          <Link
            href="/finance/invoices"
            className="font-semibold text-(--brand-link) hover:underline"
          >
            Invoice {order.invoice.invoiceNumber}
          </Link>
        ) : (
          <Link
            href="/finance/invoices"
            className="font-semibold text-(--brand-link) hover:underline"
          >
            Invoices
          </Link>
        )}
        <Link
          href="/returns"
          className="font-semibold text-(--brand-link) hover:underline"
        >
          Returns
        </Link>
        {order.status === "AWAITING_PROCUREMENT" ? (
          <Link
            href="/orders/procurement"
            className="font-semibold text-(--brand-link) hover:underline"
          >
            Procurement
          </Link>
        ) : null}
        {order.orderImageUrl ? (
          <a
            href={order.orderImageUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-(--brand-link) hover:underline"
          >
            Rx image
          </a>
        ) : null}
      </div>

      {!terminal ? (
        <div className="mb-5 grid gap-3 border-b border-(--brand-card-border) pb-5 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Change status</label>
            <select
              className={selectClass}
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value)}
              disabled={!statusOptions.length}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {formatStatus(s)}
                </option>
              ))}
            </select>
          </div>
          {nextStatus === "CANCELLED" ? (
            <div>
              <label className={labelClass}>Cancel reason</label>
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation"
                className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
              />
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Button
              type="button"
              onClick={() => void handleStatusSave()}
              disabled={!nextStatus || busy === "status"}
            >
              {busy === "status" ? "Saving…" : "Update status"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mb-5 text-sm text-(--brand-text-muted)">
          Status is terminal ({formatStatus(order.status)}). Further status changes
          are blocked. Use a return/replacement for post-fulfillment corrections.
        </p>
      )}

      <div className="mb-5 grid gap-3 border-b border-(--brand-card-border) pb-5 sm:grid-cols-[1fr_auto]">
        <div>
          <label className={labelClass}>Picked quantity</label>
          <Input
            type="number"
            min={0}
            value={pickedQuantity}
            onChange={(e) => setPickedQuantity(e.target.value)}
            className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
            disabled={order.status === "CANCELLED"}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handlePickSave()}
            disabled={busy === "pick" || order.status === "CANCELLED"}
          >
            {busy === "pick" ? "Saving…" : "Save pick qty"}
          </Button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 border-b border-(--brand-card-border) pb-5 sm:grid-cols-[1fr_auto]">
        <div>
          <label className={labelClass}>Reassign employee</label>
          <select
            className={selectClass}
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name?.trim() || emp.email}
                {!emp.isActive ? " (inactive)" : ""}
              </option>
            ))}
          </select>
          {isAdminHeldWarehouseOrder(order) ? (
            <p className="mt-1.5 text-xs text-(--brand-text-muted)">
              Assignment alone does not show this RX/photo order to warehouse
              staff. Release to warehouse when ready.
            </p>
          ) : null}
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleReassign()}
            disabled={busy === "assign"}
          >
            {busy === "assign" ? "Saving…" : "Reassign"}
          </Button>
        </div>
      </div>

      {isPrescriptionLabOrder(order) ? (
        <div className="mb-5 rounded-lg border border-(--brand-card-border) bg-(--brand-muted)/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-(--brand-text)">
                Warehouse visibility
              </p>
              <p className="mt-1 text-sm text-(--brand-text-muted)">
                {isAdminHeldWarehouseOrder(order)
                  ? "Admin hold — employees cannot see or process this order yet."
                  : order.warehouseReleasedAt
                    ? `Released ${formatDate(order.warehouseReleasedAt)}. Assigned staff can work it.`
                    : "Not on warehouse hold."}
              </p>
            </div>
            {isAdminHeldWarehouseOrder(order) ? (
              <Button
                type="button"
                onClick={() => void handleWarehouseRelease()}
                disabled={Boolean(busy)}
              >
                {busy === "release" ? "Releasing…" : "Mark available at warehouse"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 border-b border-(--brand-card-border) pb-5">
        <div>
          <label className={labelClass}>Internal notes (staff only)</label>
          <textarea
            className={textareaClass}
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder="Ops notes — not visible to customers"
          />
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleNotesSave()}
            disabled={busy === "notes"}
          >
            {busy === "notes" ? "Saving…" : "Save internal notes"}
          </Button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 border-b border-(--brand-card-border) pb-5 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Courier</label>
          <Input
            value={courierName}
            onChange={(e) => setCourierName(e.target.value)}
            className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
            placeholder="Courier name"
          />
        </div>
        <div>
          <label className={labelClass}>Tracking number</label>
          <Input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
            placeholder="AWB / tracking #"
          />
        </div>
        <div className="sm:col-span-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleShippingSave()}
            disabled={busy === "ship"}
          >
            {busy === "ship"
              ? "Saving…"
              : order.status === "PACKED"
                ? "Dispatch order"
                : "Save shipping"}
          </Button>
          {order.status === "PACKED" ? (
            <p className="mt-1 text-xs text-(--brand-text-muted)">
              Packed orders are dispatched with courier + tracking.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mb-5 grid gap-3 border-b border-(--brand-card-border) pb-5">
        <div>
          <label className={labelClass}>Delivery service</label>
          <select
            className={selectClass}
            value={deliveryServiceId}
            onChange={(e) => setDeliveryServiceId(e.target.value)}
          >
            <option value="">No service selected</option>
            {deliveryServices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.serviceName} — ₹{s.customerRate}/kg{s.etaText ? ` · ${s.etaText}` : ""}
              </option>
            ))}
          </select>
        </div>
        {order.delivery ? (
          <p className="text-sm text-(--brand-text)">
            Packed: {String(order.delivery.actualWeight)} kg actual →{" "}
            {String(order.delivery.chargeableWeight)} kg chargeable · Delivery{" "}
            {formatMoney(order.delivery.customerCharge)} · Cost{" "}
            {formatMoney(order.delivery.internalCost ?? 0)} · Margin{" "}
            {formatMoney(order.delivery.margin ?? 0)}
          </p>
        ) : (
          <p className="text-sm text-(--brand-text-muted)">
            Delivery charge is calculated after packing from the actual packed weight.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Packed weight (kg)</label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={packWeight}
              onChange={(e) => setPackWeight(e.target.value)}
              className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
              placeholder="e.g. 2.40"
            />
          </div>
          <div>
            <label className={labelClass}>Reason (required to change weight later)</label>
            <Input
              value={weightReason}
              onChange={(e) => setWeightReason(e.target.value)}
              className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
              placeholder="e.g. re-weighed parcel"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleDeliveryServiceSave()}
            disabled={busy === "delivery-service"}
          >
            {busy === "delivery-service" ? "Saving…" : "Save delivery service"}
          </Button>
          {order.status !== "PACKED" ? (
            <Button
              type="button"
              onClick={() => void handlePackWithWeight()}
              disabled={busy === "pack"}
            >
              {busy === "pack" ? "Saving…" : "Mark packed with weight"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleWeightCorrection()}
              disabled={busy === "weight"}
            >
              {busy === "weight" ? "Saving…" : "Correct weight"}
            </Button>
          )}
        </div>
      </div>

      {isEditableOrderStatus(order.status) ? (
        <div className="mb-5 grid gap-3 border-b border-(--brand-card-border) pb-5 sm:grid-cols-2">
          <h3 className="sm:col-span-2 text-xs font-extrabold uppercase tracking-[0.12em] text-(--brand-label)">
            Edit before fulfillment
          </h3>
          <div>
            <label className={labelClass}>Quantity</label>
            <Input
              type="number"
              min={0.01}
              step="any"
              value={editQty}
              onChange={(e) => setEditQty(e.target.value)}
              className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
            />
          </div>
          <div>
            <label className={labelClass}>Price per pair</label>
            <Input
              type="number"
              min={0}
              step="any"
              value={editUnitPrice}
              onChange={(e) => setEditUnitPrice(e.target.value)}
              className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
            />
          </div>
          {order.lineType === "RETAIL" ? (
            <div className="sm:col-span-2 rounded-lg border border-(--brand-card-border) bg-(--brand-muted-bg,transparent) px-3 py-2 text-sm text-(--brand-muted)">
              Retail power is locked. Use Smart Alternate Power below to mark not
              available and let the customer accept an alternate (original power is
              preserved in version history).
              <div className="mt-1 font-semibold text-(--brand-text)">
                Current: SPH {order.sph ?? "—"} / CYL {order.cyl ?? "—"}
              </div>
            </div>
          ) : (
            <>
          <div>
            <label className={labelClass}>SPH</label>
            <Input
              value={editSph}
              onChange={(e) => setEditSph(e.target.value)}
              className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
            />
          </div>
          <div>
            <label className={labelClass}>CYL</label>
            <Input
              value={editCyl}
              onChange={(e) => setEditCyl(e.target.value)}
              className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
            />
          </div>
          <div>
            <label className={labelClass}>AXIS</label>
            <Input
              value={editAxis}
              onChange={(e) => setEditAxis(e.target.value)}
              className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
            />
          </div>
          <div>
            <label className={labelClass}>ADD</label>
            <Input
              value={editAdd}
              onChange={(e) => setEditAdd(e.target.value)}
              className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
            />
          </div>
            </>
          )}
          <div className="sm:col-span-2">
            <label className={labelClass}>Customer notes</label>
            <textarea
              className={textareaClass}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleEditSave()}
              disabled={busy === "edit"}
            >
              {busy === "edit" ? "Saving…" : "Save edits"}
            </Button>
          </div>
        </div>
      ) : null}

      <div
        id="create-return-on-behalf"
        className="mb-5 scroll-mt-24 border-b border-(--brand-card-border) pb-5"
      >
        <AdminCreateReturnPanel
          seedOrder={order}
          compact
          onCreated={(id) => router.push(`/returns/${id}`)}
        />
      </div>

      {order.invoice ? (
        <div className="mb-5 rounded-lg border border-(--brand-card-border) px-3 py-3 text-sm text-(--brand-text)">
          <div className="font-semibold">
            Invoice {order.invoice.invoiceNumber}
          </div>
          <div className="mt-1 text-(--brand-text-muted)">
            {formatMoney(order.invoice.amount)} · {formatStatus(order.invoice.status)}
            {order.invoice.issuedAt
              ? ` · Issued ${formatDate(order.invoice.issuedAt)}`
              : ""}
          </div>
          <p className="mt-2 text-xs text-(--brand-text-muted)">
            Completing an order marks the invoice Paid; other statuses keep it Unpaid.
          </p>
        </div>
      ) : null}

      {(order.returnRequests?.length ?? 0) > 0 ? (
        <div className="mb-5">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-(--brand-label)">
            Linked returns
          </h3>
          <ul className="space-y-1 text-sm">
            {order.returnRequests!.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/returns/${r.id}`}
                  className="font-semibold text-(--brand-link) hover:underline"
                >
                  {r.requestNumber}
                </Link>
                <span className="text-(--brand-text-muted)">
                  {" "}
                  · {formatStatus(r.status)} · {formatDate(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(order.activityLogs?.length ?? 0) > 0 ? (
        <div className="mb-5">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-(--brand-label)">
            Activity log
          </h3>
          <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
            {order.activityLogs!.map((log) => (
              <li
                key={log.id}
                className="border-b border-(--brand-card-border) pb-2 last:border-0"
              >
                <div className="text-(--brand-text)">{log.message}</div>
                <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                  {log.actor?.name?.trim() || log.actor?.email || "System"} ·{" "}
                  {formatDate(log.createdAt)} · {log.action}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <Button
          type="button"
          variant="destructive"
          onClick={() => void handleDelete()}
          disabled={busy === "delete"}
        >
          {busy === "delete" ? "Deleting…" : "Hard delete order"}
        </Button>
        <p className="mt-2 text-xs text-(--brand-text-muted)">
          Prefer Cancel for normal operations. Hard delete removes the order from history.
        </p>
      </div>
    </section>
  );
}
