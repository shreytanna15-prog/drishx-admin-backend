"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { AdminApiError, adminFetch } from "@/app/lib/admin-api";
import {
  formatReturnDate,
  formatReturnMoney,
  formatReturnOrderCatalogSummary,
  formatReturnOrderDisplayId,
  formatReturnOrderStatus,
  formatReturnPowerLine,
  formatReturnReason,
  formatReturnStatus,
  resolveApprovedCreditDisplay,
  returnStatusBadgeClass,
  type AdminReturnOrderContext,
  type AdminReturnRequest,
} from "@/app/lib/admin-returns";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";
import { EntityTimeline } from "@/components/audit/entity-timeline";

function ReturnOrderContextBlock({
  order,
  fallbackLabel,
}: {
  order: AdminReturnOrderContext | null | undefined;
  fallbackLabel?: string;
}) {
  if (!order) {
    return fallbackLabel ? (
      <p className="text-sm text-(--brand-text-muted)">{fallbackLabel}</p>
    ) : null;
  }

  const customerLabel =
    order.user?.businessName?.trim() ||
    order.user?.name?.trim() ||
    order.user?.email ||
    null;

  return (
    <div className="mt-3 rounded-lg border border-(--brand-card-border)/80 bg-[rgba(240,161,50,0.04)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            href={`/orders/${order.id}`}
            className="inline-flex items-center gap-1.5 font-semibold text-(--brand-link) hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {formatReturnOrderDisplayId(order)}
            <ExternalLink className="size-3.5 shrink-0 opacity-80" />
          </Link>
          <p className="mt-1 text-xs text-(--brand-text-muted)">
            {order.lineType === "WHOLESALE" ? "Wholesale" : "Retail"}
            {order.assignedTo
              ? ` · Assignee: ${order.assignedTo.name?.trim() || order.assignedTo.email}`
              : ""}
          </p>
        </div>
        <Badge variant="outline" className="rounded-md text-[10px]">
          {formatReturnOrderStatus(order.status)}
        </Badge>
      </div>
      {customerLabel ? (
        <p className="mt-2 text-sm font-semibold text-(--brand-text)">
          {customerLabel}
          {order.user?.email && customerLabel !== order.user.email ? (
            <span className="ml-1.5 font-normal text-(--brand-text-muted)">
              · {order.user.email}
            </span>
          ) : null}
        </p>
      ) : null}
      <p className="mt-1 text-sm text-(--brand-text)">
        {formatReturnOrderCatalogSummary(order)}
      </p>
      <p className="mt-1 text-xs text-(--brand-text-muted)">
        Order qty {order.quantity}
        {" · "}
        {formatReturnMoney(order.totalAmount)}
        {" · "}
        {formatReturnMoney(order.unitPrice)} per pair
        {" · "}
        {formatReturnDate(order.createdAt)}
      </p>
      <p className="mt-1 text-xs text-(--brand-text-muted)">
        Ordered power:{" "}
        {formatReturnPowerLine({
          sph: order.sph,
          cyl: order.cyl,
          add: order.add,
          axis: order.axis,
        })}
        {order.eye ? ` · ${order.eye}` : ""}
      </p>
    </div>
  );
}

const STOCK_OPTIONS = [
  { value: "RETURN_TO_SALEABLE", label: "Return to saleable stock" },
  { value: "DAMAGED_STOCK", label: "Damaged stock" },
  { value: "SEND_TO_IMPORTER", label: "Send to importer" },
  { value: "SCRAP", label: "Scrap" },
] as const;

const DECIDABLE_STATUSES = new Set([
  "SUBMITTED",
  "MORE_INFO_REQUIRED",
  "ESCALATED_TO_ADMIN",
]);

type EmployeeOption = {
  id: string;
  name: string | null;
  email: string;
  isActive?: boolean;
};

export default function ReturnDetailPage() {
  const params = useParams<{ id: string }>();
  const [request, setRequest] = useState<AdminReturnRequest | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [remarks, setRemarks] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [stockDisposition, setStockDisposition] = useState("RETURN_TO_SALEABLE");
  const [assignedEmployeeId, setAssignedEmployeeId] = useState("");
  const [reassignEmployeeId, setReassignEmployeeId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canDecide = request ? DECIDABLE_STATUSES.has(request.status) : false;
  const canReassign = request
    ? (request.status === "APPROVED_CREDIT" ||
        request.status === "AWAITING_MATERIAL" ||
        request.status === "APPROVED_REPLACEMENT" ||
        (request.status === "MORE_INFO_REQUIRED" && Boolean(request.assignedEmployee)))
    : false;
  const approvedCredit = request
    ? resolveApprovedCreditDisplay(request)
    : { show: false as const };

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.isActive !== false),
    [employees]
  );

  useEffect(() => {
    async function load() {
      const id = params?.id;
      if (!id) return;
      setLoading(true);
      setError("");
      try {
        const [data, employeesRes] = await Promise.all([
          adminFetch<AdminReturnRequest>(`/api/returns/${id}`),
          adminFetch<{ employees: EmployeeOption[] }>("/api/users/employees").catch(
            () => ({ employees: [] as EmployeeOption[] })
          ),
        ]);
        setRequest(data);
        setEmployees(employeesRes.employees ?? []);
        setApprovedAmount(data.approvedAmount ? String(data.approvedAmount) : "");
        setAssignedEmployeeId(data.assignedEmployee?.id ?? "");
        setReassignEmployeeId(data.assignedEmployee?.id ?? "");
      } catch (err) {
        setError(
          err instanceof AdminApiError ? err.message : "Failed to load return request."
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [params]);

  async function submitDecision(decision: "CREDIT" | "REPLACEMENT" | "REJECT") {
    if (!request) return;
    if ((decision === "CREDIT" || decision === "REPLACEMENT") && !assignedEmployeeId) {
      setError("Select an employee to assign before approving.");
      return;
    }
    if (decision === "CREDIT" && approvedAmount.trim()) {
      const entered = Number(approvedAmount);
      const maxEligible = request.eligibleCreditAmount;
      if (!Number.isFinite(entered) || entered <= 0) {
        setError("Approved amount must be a positive number, or leave blank for auto-calc.");
        return;
      }
      if (
        maxEligible != null &&
        Number.isFinite(maxEligible) &&
        entered > maxEligible + 0.009
      ) {
        setError(
          `Approved amount ₹${entered.toFixed(2)} exceeds eligible credit ₹${maxEligible.toFixed(2)} for this return.`
        );
        return;
      }
    }
    setSubmitting(true);
    setError("");
    try {
      await adminFetch(`/api/returns/${request.id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          remarks,
          approvedAmount: approvedAmount.trim() ? Number(approvedAmount) : undefined,
          stockDisposition,
          ...(decision !== "REJECT" ? { assignedEmployeeId } : {}),
        }),
      });
      const refreshed = await adminFetch<AdminReturnRequest>(`/api/returns/${request.id}`);
      setRequest(refreshed);
      setReassignEmployeeId(refreshed.assignedEmployee?.id ?? "");
      setRemarks("");
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to submit decision."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function reassignEmployee() {
    if (!request || !reassignEmployeeId) {
      setError("Select an employee to assign.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await adminFetch(`/api/returns/${request.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "assign",
          assignedEmployeeId: reassignEmployeeId,
          remarks: remarks || undefined,
        }),
      });
      const refreshed = await adminFetch<AdminReturnRequest>(`/api/returns/${request.id}`);
      setRequest(refreshed);
      setReassignEmployeeId(refreshed.assignedEmployee?.id ?? "");
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to reassign employee."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminPage title="Return Request" subtitle={request?.requestNumber ?? "Details"}>
      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-400/35 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {loading || !request ? (
        <DetailSkeleton cards={3} />
      ) : (
        <div className="space-y-5">
          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
                  {request.requestNumber}
                </h1>
                <p className="mt-1 text-sm text-(--brand-text-muted)">
                  {request.requestType} · created {formatReturnDate(request.createdAt)}
                </p>
              </div>
              <Badge variant="outline" className={returnStatusBadgeClass(request.status)}>
                {formatReturnStatus(request.status)}
              </Badge>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-(--brand-text-muted)">
                  Customer
                </p>
                <p className="mt-2 font-semibold text-(--brand-text)">
                  {request.customer.businessName || request.customer.name || request.customer.email}
                </p>
                <p className="text-sm text-(--brand-text-muted)">{request.customer.email}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-(--brand-text-muted)">
                  Assigned employee
                </p>
                <p className="mt-2 font-semibold text-(--brand-text)">
                  {request.assignedEmployee?.name ||
                    request.assignedEmployee?.email ||
                    "Unassigned (admin review)"}
                </p>
              </div>
            </div>
            {request.customerRemarks ? (
              <p className="mt-4 text-sm text-(--brand-text)">
                <span className="font-semibold text-(--brand-text-muted)">Customer remarks: </span>
                {request.customerRemarks}
              </p>
            ) : null}
            {request.primaryOrder ? (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-(--brand-text-muted)">
                  Primary order
                </p>
                <ReturnOrderContextBlock order={request.primaryOrder} />
              </div>
            ) : null}
          </section>

          {approvedCredit.show ? (
            <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Approved Credit
              </h2>
              {approvedCredit.needsReconciliation ? (
                <p className="mt-3 rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  Reconciliation needed — approved amount or linked credit note is missing from
                  persisted records.
                </p>
              ) : null}
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-(--brand-text-muted)">
                    Approved amount
                  </p>
                  <p className="mt-2 font-semibold text-(--brand-text)">
                    {approvedCredit.approvedAmount != null
                      ? formatReturnMoney(approvedCredit.approvedAmount)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-(--brand-text-muted)">
                    Credit note
                  </p>
                  <p className="mt-2 font-semibold text-(--brand-text)">
                    {approvedCredit.creditNoteNumber ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-(--brand-text-muted)">
                    Credit note amount
                  </p>
                  <p className="mt-2 font-semibold text-(--brand-text)">
                    {approvedCredit.creditNoteAmount != null
                      ? formatReturnMoney(approvedCredit.creditNoteAmount)
                      : "—"}
                  </p>
                </div>
              </div>
              {approvedCredit.allocations.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-(--brand-text-muted)">
                    Allocations by invoice
                  </p>
                  <ul className="mt-2 space-y-2">
                    {approvedCredit.allocations.map((row) => (
                      <li
                        key={row.invoiceId}
                        className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-(--brand-card-border) px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-(--brand-text)">
                          {row.invoiceNumber ?? row.invoiceId}
                        </span>
                        <span className="text-(--brand-text-muted)">
                          {formatReturnMoney(row.amount)}
                          <span className="ml-2 text-xs">
                            (taxable {formatReturnMoney(row.taxableAmount)})
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Returned items
            </h2>
            <div className="mt-4 space-y-3">
              {request.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-(--brand-card-border) p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-(--brand-text)">{item.lensLabel}</p>
                    <p className="text-sm text-(--brand-text-muted)">
                      Return qty {item.quantity}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-(--brand-text-muted)">
                    {formatReturnReason(item.reason)}
                    {item.eye ? ` · ${item.eye}` : ""}
                  </p>
                  <ReturnOrderContextBlock
                    order={item.originalOrder}
                    fallbackLabel={`Linked order ${item.originalOrderId}`}
                  />
                  <p className="mt-2 text-xs text-(--brand-text-muted)">
                    Snapshot power:{" "}
                    {formatReturnPowerLine({
                      sph: item.originalSph,
                      cyl: item.originalCyl,
                      add: item.originalAdd,
                      axis: item.originalAxis,
                    })}
                  </p>
                  {item.requestedSph != null ||
                  item.requestedCyl != null ||
                  item.requestedAdd != null ||
                  item.requestedAxis != null ? (
                    <p className="mt-1 text-xs font-semibold text-(--brand-text)">
                      Requested replacement:{" "}
                      {formatReturnPowerLine({
                        sph: item.requestedSph,
                        cyl: item.requestedCyl,
                        add: item.requestedAdd,
                        axis: item.requestedAxis,
                      })}
                    </p>
                  ) : null}
                  {item.itemRemarks ? (
                    <p className="mt-2 text-sm text-(--brand-text)">{item.itemRemarks}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {request.images.length > 0 ? (
            <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Evidence photos
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {request.images.map((image) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={image.id}
                    src={image.imageUrl}
                    alt="Return evidence"
                    className="aspect-square w-full rounded-xl border border-(--brand-card-border) object-contain p-2"
                  />
                ))}
              </div>
            </section>
          ) : null}

          {canDecide ? (
            <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Admin decision
              </h2>
              <p className="mt-2 text-sm text-(--brand-text-muted)">
                Review the request, then approve with an employee assignment, or reject.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-(--brand-text-muted)">
                    Assign employee (required for approval)
                  </span>
                  <AdminSelect
                    value={assignedEmployeeId}
                    onValueChange={setAssignedEmployeeId}
                    options={[
                      { value: "", label: "Select employee…" },
                      ...activeEmployees.map((employee) => ({
                        value: employee.id,
                        label: employee.name || employee.email,
                      })),
                    ]}
                    placeholder="Select employee…"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-(--brand-text-muted)">
                    Stock disposition
                  </span>
                  <AdminSelect
                    value={stockDisposition}
                    onValueChange={setStockDisposition}
                    options={STOCK_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    placeholder="Stock disposition"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-(--brand-text-muted)">
                    Approved amount
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={
                      request.eligibleCreditAmount != null
                        ? request.eligibleCreditAmount
                        : undefined
                    }
                    step="0.01"
                    value={approvedAmount}
                    onChange={(e) => setApprovedAmount(e.target.value)}
                    placeholder="Leave blank for auto-calc"
                  />
                  {request.eligibleCreditAmount != null ? (
                    <span className="text-xs text-(--brand-text-muted)">
                      Max eligible {formatReturnMoney(request.eligibleCreditAmount)} (pair
                      pricing; prior credits deducted). Over-limit amounts are rejected.
                    </span>
                  ) : null}
                </label>
                <label className="block space-y-1 md:col-span-2">
                  <span className="text-xs font-semibold text-(--brand-text-muted)">
                    Remarks / rejection reason
                  </span>
                  <textarea
                    rows={4}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full rounded-lg border border-(--brand-card-border) bg-transparent px-3 py-2 text-sm text-(--brand-text)"
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button disabled={submitting} onClick={() => void submitDecision("CREDIT")}>
                  Approve Credit
                </Button>
                <Button
                  disabled={submitting}
                  variant="secondary"
                  onClick={() => void submitDecision("REPLACEMENT")}
                >
                  Approve Replacement
                </Button>
                <Button
                  disabled={submitting}
                  variant="destructive"
                  onClick={() => void submitDecision("REJECT")}
                >
                  Reject
                </Button>
              </div>
            </section>
          ) : null}

          {canReassign ? (
            <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                {request.assignedEmployee ? "Reassign employee" : "Assign employee"}
              </h2>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="block min-w-55 flex-1 space-y-1">
                  <span className="text-xs font-semibold text-(--brand-text-muted)">
                    Employee
                  </span>
                  <AdminSelect
                    value={reassignEmployeeId}
                    onValueChange={setReassignEmployeeId}
                    options={[
                      { value: "", label: "Select employee…" },
                      ...activeEmployees.map((employee) => ({
                        value: employee.id,
                        label: employee.name || employee.email,
                      })),
                    ]}
                    placeholder="Select employee…"
                  />
                </label>
                <Button disabled={submitting} onClick={() => void reassignEmployee()}>
                  {request.assignedEmployee ? "Reassign" : "Assign"}
                </Button>
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Timeline
            </h2>
            <div className="mt-4 space-y-3">
              {request.timelineEvents.map((event) => (
                <div key={event.id} className="rounded-xl border border-(--brand-card-border) p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-(--brand-text)">{event.message}</p>
                    <p className="text-xs text-(--brand-text-muted)">
                      {formatReturnDate(event.createdAt)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-(--brand-text-muted)">
                    {event.actorUser?.name || event.actorUser?.email || "System"} ·{" "}
                    {formatReturnStatus(event.eventType)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {params?.id ? (
            <EntityTimeline
              entityType="ReturnRequest"
              entityId={params.id}
              title="Audit timeline"
            />
          ) : null}
        </div>
      )}
    </AdminPage>
  );
}
