"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, X } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import {
  type AdminCustomer,
  customerDisplayName,
  customerPersonName,
  formatApprovalStatus,
  formatCustomerDate,
} from "@/app/lib/admin-customers";
import { cn } from "@/lib/utils";

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

function ClientDetailContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params?.id;
  const fromPending = searchParams.get("from") === "pending";

  const [customer, setCustomer] = useState<AdminCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadCustomer() {
      setLoading(true);
      setError("");
      try {
        const data = await adminFetch<{ customer: AdminCustomer }>(
          `/api/users/customers/${id}`
        );
        if (!cancelled) setCustomer(data.customer ?? null);
      } catch (err) {
        if (!cancelled) {
          setCustomer(null);
          setError(
            err instanceof AdminApiError
              ? err.message
              : "Failed to load customer details."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCustomer();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const title = customer ? customerDisplayName(customer) : "Client details";
  const isPending =
    customer?.approvalStatus === "PENDING_REVIEW" && Boolean(customer.gstNumber);
  const backHref =
    fromPending || isPending ? "/clients?tab=pending" : "/clients?tab=approved";

  async function handleApprove() {
    if (!customer) return;
    if (
      !window.confirm(
        `Approve ${customerDisplayName(customer)} (${customer.email})?`
      )
    ) {
      return;
    }

    setActing(true);
    setActionError("");
    try {
      const data = await adminFetch<{ user: AdminCustomer }>(
        `/api/users/${customer.id}/approve`,
        {
          method: "PUT",
          body: JSON.stringify({ action: "approve" }),
        }
      );
      setCustomer(data.user);
      router.push("/clients?tab=approved");
    } catch (err) {
      setActionError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to approve customer."
      );
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    if (!customer) return;
    const reason = window.prompt(
      `Reject ${customerDisplayName(customer)}?\nEnter a rejection reason (required):`
    );
    if (reason == null) return;
    const rejectionReason = reason.trim();
    if (!rejectionReason) {
      setActionError("Rejection reason is required.");
      return;
    }

    setActing(true);
    setActionError("");
    try {
      await adminFetch(`/api/users/${customer.id}/approve`, {
        method: "PUT",
        body: JSON.stringify({ action: "reject", rejectionReason }),
      });
      router.push("/clients?tab=pending");
    } catch (err) {
      setActionError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to reject customer."
      );
    } finally {
      setActing(false);
    }
  }

  return (
    <AdminPage title={title} subtitle="Customer company details">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--brand-link) hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to clients
        </Link>

        {isPending ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={acting}
              onClick={() => void handleApprove()}
              className="h-9 gap-1.5 rounded-xl bg-(--brand-primary) px-3 font-bold text-black hover:bg-(--brand-primary)/90"
            >
              <Check className="size-3.5" />
              {acting ? "…" : "Approve"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={acting}
              onClick={() => void handleReject()}
              className="h-9 gap-1.5 rounded-xl px-3 font-bold"
            >
              <X className="size-3.5" />
              Reject
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      {actionError ? (
        <div className="auth-alert-error mb-4" role="alert">
          {actionError}
        </div>
      ) : null}

      {loading ? (
        <DetailSkeleton />
      ) : !customer ? (
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
          Customer not found.
        </div>
      ) : (
        <div className="mx-auto grid max-w-3xl gap-4">
          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
                  {customerDisplayName(customer)}
                </h1>
                <p className="mt-1 text-sm text-(--brand-text-muted)">
                  Contact: {customerPersonName(customer)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-lg font-bold",
                    customer.isActive
                      ? "border-(--brand-success-border) bg-(--brand-success-bg) text-(--brand-success)"
                      : "border-(--brand-danger-border) bg-(--brand-danger-bg) text-(--brand-danger)"
                  )}
                >
                  {customer.isActive ? "Active" : "Inactive"}
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded-lg border-(--brand-card-border) font-bold text-(--brand-text-muted)"
                >
                  {formatApprovalStatus(customer.approvalStatus)}
                </Badge>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Contact & account
            </h2>
            <dl>
              <DetailRow label="Contact name" value={customerPersonName(customer)} />
              <DetailRow label="Email" value={customer.email} />
              <DetailRow
                label="Mobile"
                value={customer.mobileNumber?.trim() || "—"}
              />
              <DetailRow
                label="Alternate mobile"
                value={customer.alternateMobileNumber?.trim() || "—"}
              />
              <DetailRow
                label="WhatsApp"
                value={customer.whatsappNumber?.trim() || "—"}
              />
              <DetailRow
                label="Approved on"
                value={formatCustomerDate(customer.approvedAt)}
              />
              <DetailRow
                label="Joined on"
                value={formatCustomerDate(customer.createdAt)}
              />
              {customer.rejectionReason ? (
                <DetailRow
                  label="Rejection reason"
                  value={customer.rejectionReason}
                />
              ) : null}
            </dl>
          </section>

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Business info
            </h2>
            <dl>
              <DetailRow
                label="Business name"
                value={customer.businessName?.trim() || "—"}
              />
              <DetailRow
                label="Shop name"
                value={customer.shopName?.trim() || "—"}
              />
              <DetailRow
                label="Business type"
                value={customer.businessType?.trim() || "—"}
              />
              <DetailRow
                label="Address line 1"
                value={customer.addressLine1?.trim() || "—"}
              />
              <DetailRow
                label="Address line 2"
                value={customer.addressLine2?.trim() || "—"}
              />
              <DetailRow label="City" value={customer.city?.trim() || "—"} />
              <DetailRow label="State" value={customer.state?.trim() || "—"} />
              <DetailRow
                label="Pincode"
                value={customer.pincode?.trim() || "—"}
              />
              <DetailRow
                label="Business email"
                value={customer.businessEmail?.trim() || "—"}
              />
              <DetailRow
                label="Shop phone"
                value={customer.shopPhoneNumber?.trim() || "—"}
              />
            </dl>
          </section>

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              GST details
            </h2>
            <dl>
              <DetailRow
                label="GSTIN"
                value={customer.gstNumber?.trim() || "—"}
              />
              <DetailRow
                label="Legal business name"
                value={customer.legalBusinessName?.trim() || "—"}
              />
              <DetailRow
                label="Trade name"
                value={customer.tradeName?.trim() || "—"}
              />
              <DetailRow
                label="GST registration state"
                value={customer.gstRegistrationState?.trim() || "—"}
              />
              <DetailRow label="PAN" value={customer.panNumber?.trim() || "—"} />
            </dl>
          </section>

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Billing address
            </h2>
            <dl>
              <DetailRow
                label="Legal name"
                value={customer.billingLegalName?.trim() || "—"}
              />
              <DetailRow
                label="Address"
                value={customer.billingAddress?.trim() || "—"}
              />
              <DetailRow
                label="City"
                value={customer.billingCity?.trim() || "—"}
              />
              <DetailRow
                label="State"
                value={customer.billingState?.trim() || "—"}
              />
              <DetailRow
                label="PIN"
                value={customer.billingPincode?.trim() || "—"}
              />
              <DetailRow
                label="GST state"
                value={customer.billingGstState?.trim() || "—"}
              />
            </dl>
          </section>

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Shipping address
            </h2>
            <dl>
              <DetailRow
                label="Legal name"
                value={customer.shippingLegalName?.trim() || "—"}
              />
              <DetailRow
                label="Address"
                value={customer.shippingAddress?.trim() || "—"}
              />
              <DetailRow
                label="City"
                value={customer.shippingCity?.trim() || "—"}
              />
              <DetailRow
                label="State"
                value={customer.shippingState?.trim() || "—"}
              />
              <DetailRow
                label="PIN"
                value={customer.shippingPincode?.trim() || "—"}
              />
            </dl>
          </section>
        </div>
      )}
    </AdminPage>
  );
}

export default function ClientDetailPage() {
  return (
    <Suspense
      fallback={
        <AdminPage title="Client details" subtitle="…">
          <DetailSkeleton />
        </AdminPage>
      }
    >
      <ClientDetailContent />
    </Suspense>
  );
}
