"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Pause, Play, RotateCcw, Shield, X } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import {
  type AccountActionValue,
  type AdminCustomer,
  customerDisplayName,
  customerPersonName,
  formatAccountAction,
  formatApprovalStatus,
  formatCustomerDate,
  formatGstinVerifyStatus,
  isIncompleteSignup,
  isPendingReady,
  isSuspendedCustomer,
} from "@/app/lib/admin-customers";
import { listPricingTiers, type AdminPricingTier } from "@/app/lib/admin-pricing-tiers";
import { useSetAccountAction } from "@/app/lib/modules/customers/mutation/use-set-account-action";
import { useUpdateCustomer } from "@/app/lib/modules/customers/mutation/use-update-customer";
import { useVerifyCustomerGst } from "@/app/lib/modules/customers/mutation/use-verify-customer-gst";
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
  const from = searchParams.get("from");

  const [customer, setCustomer] = useState<AdminCustomer | null>(null);
  const [finance, setFinance] = useState<{
    outstanding: number;
    creditLimit: number | null;
    availableCredit: number | null;
    creditAllowed: boolean;
    accountAction: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [acting, setActing] = useState(false);
  const [creditLimitDraft, setCreditLimitDraft] = useState("");
  const [creditAllowedDraft, setCreditAllowedDraft] = useState(true);
  const [pricingTierIdDraft, setPricingTierIdDraft] = useState("");
  const [pricingTiers, setPricingTiers] = useState<AdminPricingTier[]>([]);
  const [verifyHint, setVerifyHint] = useState("");

  const { mutate: saveCommercial, pending: savingCommercial } = useUpdateCustomer({
    onSuccess: (updated) => {
      setCustomer(updated);
      setCreditLimitDraft(updated.creditLimit ?? "");
      setCreditAllowedDraft(updated.creditAllowed ?? true);
      setPricingTierIdDraft(updated.pricingTierId ?? "");
    },
    onError: (err) => {
      setActionError(
        err instanceof AdminApiError ? err.message : "Failed to save commercial fields."
      );
    },
  });

  const { mutate: setAccountAction, pending: actionPending } = useSetAccountAction({
    onSuccess: (updated) => setCustomer(updated),
    onError: (err) => {
      setActionError(
        err instanceof AdminApiError ? err.message : "Failed to update account action."
      );
    },
  });

  const { mutate: verifyGst, pending: verifyingGst } = useVerifyCustomerGst({
    onSuccess: (result) => {
      setCustomer(result.customer);
      const parts = [
        result.verify.status,
        result.verify.legalName ? `Legal: ${result.verify.legalName}` : null,
        result.verify.tradeName ? `Trade: ${result.verify.tradeName}` : null,
      ].filter(Boolean);
      setVerifyHint(parts.join(" · "));
    },
    onError: (err) => {
      setActionError(
        err instanceof AdminApiError ? err.message : "GST verify failed."
      );
    },
  });

  useEffect(() => {
    let cancelled = false;
    void listPricingTiers()
      .then((rows) => {
        if (!cancelled) setPricingTiers(rows);
      })
      .catch(() => {
        /* tiers optional for detail load */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadCustomer() {
      setLoading(true);
      setError("");
      try {
        const data = await adminFetch<{
          customer: AdminCustomer;
          finance?: {
            outstanding: number;
            creditLimit: number | null;
            availableCredit: number | null;
            creditAllowed: boolean;
            accountAction: string;
          };
        }>(`/api/users/customers/${id}`);
        if (!cancelled) {
          const row = data.customer ?? null;
          setCustomer(row);
          setFinance(data.finance ?? null);
          if (row) {
            setCreditLimitDraft(row.creditLimit ?? "");
            setCreditAllowedDraft(row.creditAllowed ?? true);
            setPricingTierIdDraft(row.pricingTierId ?? "");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setCustomer(null);
          setFinance(null);
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

  const backHref =
    from === "pending"
      ? "/clients?tab=pending"
      : from === "incomplete"
        ? "/clients?tab=incomplete"
        : from === "rejected"
          ? "/clients?tab=rejected"
          : customer && isIncompleteSignup(customer)
            ? "/clients?tab=incomplete"
            : customer && isPendingReady(customer)
              ? "/clients?tab=pending"
              : customer?.approvalStatus === "REJECTED"
                ? "/clients?tab=rejected"
                : "/clients?tab=approved";

  async function runAction(
    action: "approve" | "reject" | "reopen" | "suspend" | "activate",
    rejectionReason?: string
  ) {
    if (!customer) return;

    setActing(true);
    setActionError("");
    try {
      const data = await adminFetch<{ user: AdminCustomer }>(
        `/api/users/${customer.id}/approve`,
        {
          method: "PUT",
          body: JSON.stringify({
            action,
            ...(rejectionReason ? { rejectionReason } : {}),
          }),
        }
      );
      setCustomer(data.user);

      if (action === "approve") {
        router.push("/clients?tab=approved");
      } else if (action === "reject") {
        router.push("/clients?tab=rejected");
      } else if (action === "reopen") {
        const next = data.user.gstNumber
          ? "/clients?tab=pending"
          : "/clients?tab=incomplete";
        router.push(next);
      }
    } catch (err) {
      setActionError(
        err instanceof AdminApiError
          ? err.message
          : `Failed to ${action} customer.`
      );
    } finally {
      setActing(false);
    }
  }

  async function handleApprove() {
    if (!customer) return;
    if (
      !window.confirm(
        `Approve ${customerDisplayName(customer)} (${customer.email})?`
      )
    ) {
      return;
    }
    await runAction("approve");
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
    await runAction("reject", rejectionReason);
  }

  async function handleReopen() {
    if (!customer) return;
    if (
      !window.confirm(
        `Reopen ${customerDisplayName(customer)} to pending review?`
      )
    ) {
      return;
    }
    await runAction("reopen");
  }

  async function handleSuspend() {
    if (!customer) return;
    if (
      !window.confirm(
        `Suspend ${customerDisplayName(customer)}? They will lose access until reactivated.`
      )
    ) {
      return;
    }
    await runAction("suspend");
  }

  async function handleActivate() {
    if (!customer) return;
    if (
      !window.confirm(`Reactivate ${customerDisplayName(customer)}?`)
    ) {
      return;
    }
    await runAction("activate");
  }

  const canApprove = customer ? isPendingReady(customer) : false;
  const canReject =
    customer != null &&
    (customer.approvalStatus === "PENDING_REVIEW" ||
      customer.approvalStatus === "APPROVED");
  const canReopen =
    customer != null &&
    (customer.approvalStatus === "APPROVED" ||
      customer.approvalStatus === "REJECTED");
  const canSuspend =
    customer != null &&
    customer.approvalStatus === "APPROVED" &&
    customer.isActive;
  const canActivate = customer ? isSuspendedCustomer(customer) : false;
  const showActions =
    canApprove || canReject || canReopen || canSuspend || canActivate;
  const commercialBusy = acting || savingCommercial || actionPending || verifyingGst;

  async function handleAccountAction(action: AccountActionValue) {
    if (!customer) return;
    const label = formatAccountAction(action);
    if (
      !window.confirm(
        action === "NONE"
          ? `Clear account action for ${customerDisplayName(customer)}?`
          : `Set account action to ${label} for ${customerDisplayName(customer)}?`
      )
    ) {
      return;
    }
    setActionError("");
    await setAccountAction({ id: customer.id, action });
  }

  async function handleSaveCommercial() {
    if (!customer) return;
    setActionError("");
    const trimmed = creditLimitDraft.trim();
    await saveCommercial({
      id: customer.id,
      payload: {
        creditLimit: trimmed === "" ? null : Number(trimmed),
        creditAllowed: creditAllowedDraft,
        pricingTierId: pricingTierIdDraft.trim() || null,
      },
    });
  }

  async function handleVerifyGst() {
    if (!customer) return;
    setActionError("");
    setVerifyHint("");
    await verifyGst(customer.id);
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

        {showActions ? (
          <div className="flex flex-wrap items-center gap-2">
            {canApprove ? (
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
            ) : null}
            {canReject ? (
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
            ) : null}
            {canReopen ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={acting}
                onClick={() => void handleReopen()}
                className="h-9 gap-1.5 rounded-xl border-(--brand-card-border) px-3 font-bold text-(--brand-text)"
              >
                <RotateCcw className="size-3.5" />
                Reopen to pending
              </Button>
            ) : null}
            {canSuspend ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={acting}
                onClick={() => void handleSuspend()}
                className="h-9 gap-1.5 rounded-xl border-amber-400/40 px-3 font-bold text-amber-100"
              >
                <Pause className="size-3.5" />
                Suspend
              </Button>
            ) : null}
            {canActivate ? (
              <Button
                type="button"
                size="sm"
                disabled={acting}
                onClick={() => void handleActivate()}
                className="h-9 gap-1.5 rounded-xl bg-(--brand-primary) px-3 font-bold text-black hover:bg-(--brand-primary)/90"
              >
                <Play className="size-3.5" />
                Reactivate
              </Button>
            ) : null}
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
                {isIncompleteSignup(customer) ? (
                  <p className="mt-2 text-sm text-amber-200/90">
                    Incomplete signup — GST not submitted yet. Approve is blocked
                    until GST details are completed.
                  </p>
                ) : null}
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
                  {isSuspendedCustomer(customer)
                    ? "Suspended"
                    : customer.isActive
                      ? "Active"
                      : "Inactive"}
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded-lg border-(--brand-card-border) font-bold text-(--brand-text-muted)"
                >
                  {formatApprovalStatus(customer.approvalStatus)}
                </Badge>
                {customer.accountAction && customer.accountAction !== "NONE" ? (
                  <Badge
                    variant="outline"
                    className="rounded-lg border-(--brand-danger-border) bg-(--brand-danger-bg) font-bold text-(--brand-danger)"
                  >
                    {formatAccountAction(customer.accountAction)}
                  </Badge>
                ) : null}
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                GST details
              </h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={commercialBusy || !customer.gstNumber}
                onClick={() => void handleVerifyGst()}
                className="h-9 gap-1.5 rounded-xl border-(--brand-card-border) px-3 font-bold"
              >
                <Shield className="size-3.5" />
                {verifyingGst ? "Verifying…" : "Verify GST"}
              </Button>
            </div>
            <dl>
              <DetailRow
                label="GSTIN"
                value={customer.gstNumber?.trim() || "—"}
              />
              <DetailRow
                label="Verify status"
                value={formatGstinVerifyStatus(customer.gstinVerifyStatus)}
              />
              <DetailRow
                label="Last verified"
                value={formatCustomerDate(customer.gstinVerifiedAt ?? null)}
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
            {verifyHint ? (
              <p className="mt-3 text-sm text-(--brand-text-muted)">{verifyHint}</p>
            ) : null}
            {!customer.gstNumber ? (
              <p className="mt-3 text-sm text-amber-200/90">
                Add a GSTIN before Verify GST (provider charges per check).
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Finance summary
            </h2>
            <dl>
              <DetailRow
                label="Outstanding"
                value={
                  finance
                    ? new Intl.NumberFormat("en-IN", {
                        style: "currency",
                        currency: "INR",
                        maximumFractionDigits: 2,
                      }).format(finance.outstanding)
                    : "—"
                }
              />
              <DetailRow
                label="Credit limit"
                value={
                  finance?.creditLimit != null
                    ? new Intl.NumberFormat("en-IN", {
                        style: "currency",
                        currency: "INR",
                        maximumFractionDigits: 0,
                      }).format(finance.creditLimit)
                    : "No limit"
                }
              />
              <DetailRow
                label="Available credit"
                value={
                  finance?.availableCredit != null
                    ? new Intl.NumberFormat("en-IN", {
                        style: "currency",
                        currency: "INR",
                        maximumFractionDigits: 2,
                      }).format(finance.availableCredit)
                    : "—"
                }
              />
              <DetailRow
                label="Credit allowed"
                value={
                  finance
                    ? finance.creditAllowed
                      ? "Yes"
                      : "No"
                    : customer.creditAllowed
                      ? "Yes"
                      : "No"
                }
              />
              <DetailRow
                label="Account action"
                value={formatAccountAction(
                  finance?.accountAction ?? customer.accountAction
                )}
              />
            </dl>
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
              <Link
                href="/finance/receivables"
                className="text-(--brand-primary) underline-offset-2 hover:underline"
              >
                Open receivables
              </Link>
              <Link
                href="/finance/payments"
                className="text-(--brand-primary) underline-offset-2 hover:underline"
              >
                Open payments & claims
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Commercial
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-(--brand-label)">
                  Pricing tier
                </span>
                <select
                  value={pricingTierIdDraft}
                  onChange={(e) => setPricingTierIdDraft(e.target.value)}
                  className="h-10 rounded-md border border-(--brand-input-border) bg-(--brand-input-bg) px-3 text-sm text-(--brand-text)"
                >
                  <option value="">Default (D)</option>
                  {pricingTiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code}
                      {t.isBase ? " (Base)" : ""} — {t.discountPercent}%
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-(--brand-label)">
                  Credit limit (₹)
                </span>
                <Input
                  value={creditLimitDraft}
                  onChange={(e) => setCreditLimitDraft(e.target.value)}
                  placeholder="No limit"
                  className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
                  inputMode="decimal"
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-(--brand-text) sm:col-span-2">
                <input
                  type="checkbox"
                  checked={creditAllowedDraft}
                  onChange={(e) => setCreditAllowedDraft(e.target.checked)}
                  className="size-4 rounded border-(--brand-input-border)"
                />
                Credit allowed
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={commercialBusy}
                onClick={() => void handleSaveCommercial()}
                className="h-9 rounded-xl bg-(--brand-primary) px-3 font-bold text-black hover:bg-(--brand-primary)/90"
              >
                {savingCommercial ? "Saving…" : "Save commercial"}
              </Button>
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-(--brand-label)">
              Account action
            </p>
            <p className="mt-1 text-sm text-(--brand-text-muted)">
              Current: {formatAccountAction(customer.accountAction)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  "BLOCKED",
                  "CREDIT_SUSPENDED",
                  "CLOSED",
                  "NONE",
                ] as AccountActionValue[]
              ).map((action) => (
                <Button
                  key={action}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    commercialBusy || customer.accountAction === action
                  }
                  onClick={() => void handleAccountAction(action)}
                  className="h-9 rounded-xl border-(--brand-card-border) px-3 font-bold"
                >
                  {action === "NONE" ? "Clear" : formatAccountAction(action)}
                </Button>
              ))}
            </div>
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
