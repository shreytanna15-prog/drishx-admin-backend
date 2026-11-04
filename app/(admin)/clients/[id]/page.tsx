"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  History,
  MapPinCheck,
  Pencil,
  Pause,
  Play,
  RotateCcw,
  Shield,
  X,
} from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { AdminSelect } from "@/components/admin-select";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  getAdminCustomer,
  setCustomerApprovalAction,
} from "@/app/lib/admin-customers";
import {
  type AccountActionValue,
  type AdminCustomer,
  customerDisplayName,
  customerPersonName,
  formatAccountAction,
  formatApprovalStatus,
  formatCustomerDate,
  formatGstinVerifyStatus,
  isAddressVerified,
  isEmailVerified,
  isGstTaxLocked,
  isIncompleteSignup,
  isMobileVerified,
  isPendingReady,
  isSuspendedCustomer,
  sendAdminEmailOtp,
  sendAdminMobileOtp,
  verifyAdminEmailOtp,
  verifyAdminMobileOtp,
  verifyCustomerAddress,
} from "@/app/lib/admin-customers";
import { listPricingTiers, type AdminPricingTier } from "@/app/lib/admin-pricing-tiers";
import { useSetAccountAction } from "@/app/lib/modules/customers/mutation/use-set-account-action";
import { useUpdateCustomer } from "@/app/lib/modules/customers/mutation/use-update-customer";
import { useVerifyCustomerGst } from "@/app/lib/modules/customers/mutation/use-verify-customer-gst";
import { cn } from "@/lib/utils";
import {
  payloadFromProfileDraft,
  profileDraftFromCustomer,
  type ProfileDraft,
} from "@/app/lib/admin-client-profile-draft";

const inputClass =
  "h-9 border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text)";

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-(--brand-card-border) py-3 last:border-b-0 sm:grid-cols-[7.5rem_1fr] sm:gap-3">
      <dt className="text-sm font-semibold text-(--brand-label)">{label}</dt>
      <dd className="text-sm text-(--brand-text)">{value || "—"}</dd>
    </div>
  );
}

function EditRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-(--brand-card-border) py-3 last:border-b-0 sm:grid-cols-[7.5rem_1fr] sm:items-center sm:gap-3">
      <span className="text-sm font-semibold text-(--brand-label)">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "ml-2 rounded-md text-[10px] font-bold uppercase tracking-wide",
        verified
          ? "border-(--brand-success-border) bg-(--brand-success-bg) text-(--brand-success)"
          : "border-amber-400/40 bg-amber-500/10 text-amber-100"
      )}
    >
      {verified ? "Verified" : "Unverified"}
    </Badge>
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
  const [actionHint, setActionHint] = useState("");
  const [acting, setActing] = useState(false);
  const [creditLimitDraft, setCreditLimitDraft] = useState("");
  const [creditAllowedDraft, setCreditAllowedDraft] = useState(true);
  const [pricingTierIdDraft, setPricingTierIdDraft] = useState("");
  const [pricingTiers, setPricingTiers] = useState<AdminPricingTier[]>([]);
  const [verifyHint, setVerifyHint] = useState("");

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [updateNotes, setUpdateNotes] = useState("");
  const [verifyingAddress, setVerifyingAddress] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [mobileOtpCode, setMobileOtpCode] = useState("");
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [mobileSessionId, setMobileSessionId] = useState<string | null>(null);
  const [emailSessionId, setEmailSessionId] = useState<string | null>(null);

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

  const { mutate: saveProfile, pending: savingProfile } = useUpdateCustomer({
    onSuccess: (updated) => {
      setCustomer(updated);
      setDraft(profileDraftFromCustomer(updated));
      setEditing(false);
      setUpdateNotes("");
      const hints: string[] = [];
      if (!isMobileVerified(updated)) {
        hints.push("Mobile is unverified — send OTP to verify.");
      }
      if (updated.email && !isEmailVerified(updated)) {
        hints.push("Email is unverified — send OTP to verify.");
      }
      if (!isAddressVerified(updated)) {
        hints.push("Address is unverified — use Verify address when confirmed.");
      }
      setActionHint(hints.join(" ") || "Client details saved.");
      setActionError("");
    },
    onError: (err) => {
      setActionError(
        err instanceof AdminApiError ? err.message : "Failed to save client details."
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
        const data = await getAdminCustomer(id);
        if (!cancelled) {
          const row = data.customer ?? null;
          setCustomer(row);
          setFinance(data.finance);
          if (row) {
            setCreditLimitDraft(row.creditLimit ?? "");
            setCreditAllowedDraft(row.creditAllowed ?? true);
            setPricingTierIdDraft(row.pricingTierId ?? "");
            setDraft(profileDraftFromCustomer(row));
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
      const user = await setCustomerApprovalAction(
        customer.id,
        action,
        rejectionReason
      );
      setCustomer(user);

      if (action === "approve") {
        router.push("/clients?tab=approved");
      } else if (action === "reject") {
        router.push("/clients?tab=rejected");
      } else if (action === "reopen") {
        const next = user.gstNumber
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
  const taxLocked = customer ? isGstTaxLocked(customer) : false;
  const commercialBusy =
    acting ||
    savingCommercial ||
    savingProfile ||
    actionPending ||
    verifyingGst ||
    verifyingAddress ||
    otpBusy;

  function patchDraft<K extends keyof ProfileDraft>(key: K, value: string) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function startEditing() {
    if (!customer) return;
    setDraft(profileDraftFromCustomer(customer));
    setEditing(true);
    setUpdateNotes("");
    setActionError("");
    setActionHint("");
  }

  function cancelEditing() {
    if (customer) setDraft(profileDraftFromCustomer(customer));
    setEditing(false);
    setUpdateNotes("");
    setActionError("");
  }

  async function handleSaveProfile() {
    if (!customer || !draft) return;
    if (!draft.mobileNumber.trim()) {
      setActionError("Mobile number is required.");
      return;
    }
    if (!draft.email.trim()) {
      setActionError("Email is required.");
      return;
    }
    if (!updateNotes.trim()) {
      setActionError("Notes are required for every Admin update.");
      return;
    }
    setActionError("");
    setActionHint("");
    await saveProfile({
      id: customer.id,
      payload: {
        ...payloadFromProfileDraft(draft, taxLocked),
        notes: updateNotes.trim(),
      },
    });
  }

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
    const notes = window.prompt(
      "Notes required for commercial update (reason for change):"
    );
    if (notes == null) return;
    if (!notes.trim()) {
      setActionError("Notes are required for every Admin update.");
      return;
    }
    setActionError("");
    const trimmed = creditLimitDraft.trim();
    await saveCommercial({
      id: customer.id,
      payload: {
        creditLimit: trimmed === "" ? null : Number(trimmed),
        creditAllowed: creditAllowedDraft,
        pricingTierId: pricingTierIdDraft.trim() || null,
        notes: notes.trim(),
      },
    });
  }

  async function handleVerifyGst() {
    if (!customer) return;
    setActionError("");
    setVerifyHint("");
    await verifyGst(customer.id);
  }

  async function handleVerifyAddress() {
    if (!customer) return;
    setVerifyingAddress(true);
    setActionError("");
    try {
      const updated = await verifyCustomerAddress(customer.id);
      setCustomer(updated);
      setActionHint("Address verified.");
    } catch (err) {
      setActionError(
        err instanceof AdminApiError ? err.message : "Failed to verify address."
      );
    } finally {
      setVerifyingAddress(false);
    }
  }

  async function handleSendMobileOtp() {
    if (!customer?.mobileNumber) return;
    setOtpBusy(true);
    setActionError("");
    try {
      const result = await sendAdminMobileOtp(customer.mobileNumber);
      setMobileSessionId(result.providerSessionId);
      setActionHint("Mobile OTP sent. Enter the code below.");
    } catch (err) {
      setActionError(
        err instanceof AdminApiError ? err.message : "Failed to send mobile OTP."
      );
    } finally {
      setOtpBusy(false);
    }
  }

  async function handleVerifyMobileOtp() {
    if (!customer?.mobileNumber) return;
    setOtpBusy(true);
    setActionError("");
    try {
      const result = await verifyAdminMobileOtp({
        mobileNumber: customer.mobileNumber,
        code: mobileOtpCode.trim(),
        sessionId: mobileSessionId,
      });
      if (result.user) {
        setCustomer(result.user);
        setDraft(profileDraftFromCustomer(result.user));
      } else {
        setCustomer((prev) =>
          prev
            ? { ...prev, mobileVerifiedAt: new Date().toISOString() }
            : prev
        );
      }
      setMobileOtpCode("");
      setActionHint("Mobile verified.");
    } catch (err) {
      setActionError(
        err instanceof AdminApiError ? err.message : "Mobile OTP verify failed."
      );
    } finally {
      setOtpBusy(false);
    }
  }

  async function handleSendEmailOtp() {
    if (!customer?.email) return;
    setOtpBusy(true);
    setActionError("");
    try {
      const result = await sendAdminEmailOtp(customer.email);
      setEmailSessionId(result.providerSessionId);
      setActionHint("Email OTP sent. Enter the code below.");
    } catch (err) {
      setActionError(
        err instanceof AdminApiError ? err.message : "Failed to send email OTP."
      );
    } finally {
      setOtpBusy(false);
    }
  }

  async function handleVerifyEmailOtp() {
    if (!customer?.email) return;
    setOtpBusy(true);
    setActionError("");
    try {
      const result = await verifyAdminEmailOtp({
        email: customer.email,
        code: emailOtpCode.trim(),
        sessionId: emailSessionId,
      });
      if (result.user) {
        setCustomer(result.user);
        setDraft(profileDraftFromCustomer(result.user));
      } else {
        setCustomer((prev) =>
          prev
            ? { ...prev, emailVerifiedAt: new Date().toISOString() }
            : prev
        );
      }
      setEmailOtpCode("");
      setActionHint("Email verified.");
    } catch (err) {
      setActionError(
        err instanceof AdminApiError ? err.message : "Email OTP verify failed."
      );
    } finally {
      setOtpBusy(false);
    }
  }

  const showMobileOtp = customer != null && !isMobileVerified(customer);
  const showEmailOtp =
    customer != null && Boolean(customer.email) && !isEmailVerified(customer);

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

        <div className="flex flex-wrap items-center gap-2">
          {customer && !editing ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={commercialBusy}
                onClick={startEditing}
                className="h-9 gap-1.5 rounded-xl border-(--brand-card-border) px-3 font-bold text-(--brand-text)"
              >
                <Pencil className="size-3.5" />
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                asChild
                className="h-9 gap-1.5 rounded-xl border-(--brand-card-border) px-3 font-bold text-(--brand-text)"
              >
                <Link href={`/clients/${customer.id}/change-history`}>
                  <History className="size-3.5" />
                  Change history
                </Link>
              </Button>
            </>
          ) : null}
          {editing ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={commercialBusy}
                onClick={cancelEditing}
                className="h-9 gap-1.5 rounded-xl border-(--brand-card-border) px-3 font-bold"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={commercialBusy}
                onClick={() => void handleSaveProfile()}
                className="h-9 gap-1.5 rounded-xl bg-(--brand-primary) px-3 font-bold text-black hover:bg-(--brand-primary)/90"
              >
                {savingProfile ? "Saving…" : "Save"}
              </Button>
            </>
          ) : null}
          {!editing && showActions ? (
            <>
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
            </>
          ) : null}
        </div>
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

      {actionHint ? (
        <div
          className="mb-4 rounded-xl border border-(--brand-success-border) bg-(--brand-success-bg) px-4 py-3 text-sm text-(--brand-success)"
          role="status"
        >
          {actionHint}
        </div>
      ) : null}

      {loading ? (
        <DetailSkeleton />
      ) : !customer || !draft ? (
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
          Customer not found.
        </div>
      ) : (
        <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch">
          {!isAddressVerified(customer) ? (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 lg:col-span-12"
              role="status"
            >
              <p className="text-sm text-amber-100">
                Address pending verification. Account stays approved; confirm
                the address when ready.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={commercialBusy || editing}
                onClick={() => void handleVerifyAddress()}
                className="h-9 gap-1.5 rounded-xl border-amber-400/40 px-3 font-bold text-amber-100"
              >
                <MapPinCheck className="size-3.5" />
                {verifyingAddress ? "Verifying…" : "Verify address"}
              </Button>
            </div>
          ) : null}

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6 lg:col-span-12">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
                  {customerDisplayName(customer)}
                </h1>
                <p className="mt-1 text-sm text-(--brand-text-muted)">
                  Contact: {customerPersonName(customer)}
                </p>
                <p className="mt-1 text-sm text-(--brand-text-muted)">
                  Address:{" "}
                  {isAddressVerified(customer) ? "Verified" : "Unverified"}
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

          {editing ? (
            <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6 lg:col-span-12">
              <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Update notes (required)
              </h2>
              <p className="mb-3 text-sm text-(--brand-text-muted)">
                Explain why this Admin update is being made. Shown in change
                history.
              </p>
              <textarea
                value={updateNotes}
                onChange={(e) => setUpdateNotes(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-(--brand-input-border) bg-(--brand-input-bg) px-3 py-2 text-sm text-(--brand-text)"
                placeholder="e.g. Client asked to change delivery address due to construction."
                required
              />
            </section>
          ) : null}

          <section
            className={cn(
              "flex h-full flex-col rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6",
              editing ? "lg:col-span-12" : "lg:col-span-6"
            )}
          >
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Contact & account
            </h2>
            {editing ? (
              <div>
                <EditRow label="Contact name">
                  <Input
                    value={draft.name}
                    onChange={(e) => patchDraft("name", e.target.value)}
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="Email">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="email"
                      value={draft.email}
                      onChange={(e) => patchDraft("email", e.target.value)}
                      className={inputClass}
                      required
                    />
                    <VerifiedBadge verified={isEmailVerified(customer)} />
                  </div>
                </EditRow>
                <EditRow label="Mobile">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={draft.mobileNumber}
                      onChange={(e) => patchDraft("mobileNumber", e.target.value)}
                      className={inputClass}
                      inputMode="tel"
                      required
                    />
                    <VerifiedBadge verified={isMobileVerified(customer)} />
                  </div>
                </EditRow>
                <EditRow label="Alternate mobile">
                  <Input
                    value={draft.alternateMobileNumber}
                    onChange={(e) =>
                      patchDraft("alternateMobileNumber", e.target.value)
                    }
                    className={inputClass}
                    inputMode="tel"
                  />
                </EditRow>
                <EditRow label="WhatsApp">
                  <Input
                    value={draft.whatsappNumber}
                    onChange={(e) => patchDraft("whatsappNumber", e.target.value)}
                    className={inputClass}
                    inputMode="tel"
                  />
                </EditRow>
              </div>
            ) : (
              <dl className="flex-1">
                <DetailRow label="Contact name" value={customerPersonName(customer)} />
                <DetailRow
                  label="Email"
                  value={
                    <span className="inline-flex flex-wrap items-center">
                      {customer.email}
                      <VerifiedBadge verified={isEmailVerified(customer)} />
                    </span>
                  }
                />
                <DetailRow
                  label="Mobile"
                  value={
                    <span className="inline-flex flex-wrap items-center">
                      {customer.mobileNumber?.trim() || "—"}
                      {customer.mobileNumber ? (
                        <VerifiedBadge verified={isMobileVerified(customer)} />
                      ) : null}
                    </span>
                  }
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
            )}
          </section>

          <section
            className={cn(
              "flex h-full flex-col rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6",
              editing ? "lg:col-span-12" : "lg:col-span-6"
            )}
          >
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Finance summary
            </h2>
            <dl className="flex-1">
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
            <div className="mt-auto flex flex-wrap gap-3 pt-4 text-sm font-semibold">
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

          <section
            className={cn(
              "flex h-full flex-col rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6",
              editing ? "lg:col-span-12" : "lg:col-span-6"
            )}
          >
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Business info
            </h2>
            {editing ? (
              <div>
                <EditRow label="Business name">
                  <Input
                    value={draft.businessName}
                    onChange={(e) => patchDraft("businessName", e.target.value)}
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="Shop name">
                  <Input
                    value={draft.shopName}
                    onChange={(e) => patchDraft("shopName", e.target.value)}
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="Business type">
                  <Input
                    value={draft.businessType}
                    onChange={(e) => patchDraft("businessType", e.target.value)}
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="Address line 1">
                  <Input
                    value={draft.addressLine1}
                    onChange={(e) => patchDraft("addressLine1", e.target.value)}
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="Address line 2">
                  <Input
                    value={draft.addressLine2}
                    onChange={(e) => patchDraft("addressLine2", e.target.value)}
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="City">
                  <Input
                    value={draft.city}
                    onChange={(e) => patchDraft("city", e.target.value)}
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="State">
                  <Input
                    value={draft.state}
                    onChange={(e) => patchDraft("state", e.target.value)}
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="Pincode">
                  <Input
                    value={draft.pincode}
                    onChange={(e) => patchDraft("pincode", e.target.value)}
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="Business email">
                  <Input
                    type="email"
                    value={draft.businessEmail}
                    onChange={(e) => patchDraft("businessEmail", e.target.value)}
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="Shop phone">
                  <Input
                    value={draft.shopPhoneNumber}
                    onChange={(e) =>
                      patchDraft("shopPhoneNumber", e.target.value)
                    }
                    className={inputClass}
                    inputMode="tel"
                  />
                </EditRow>
              </div>
            ) : (
              <dl className="flex-1">
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
            )}
          </section>

          <section
            className={cn(
              "flex h-full flex-col rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6",
              editing ? "lg:col-span-12" : "lg:col-span-6"
            )}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                GST details
              </h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    commercialBusy || !customer.gstNumber || editing || taxLocked
                  }
                  onClick={() => void handleVerifyGst()}
                  className="h-9 gap-1.5 rounded-xl border-(--brand-card-border) px-3 font-bold"
                >
                  <Shield className="size-3.5" />
                  {verifyingGst ? "Verifying…" : "Verify GST"}
                </Button>
              </div>
            </div>
            {taxLocked && editing ? (
              <p className="mb-3 text-sm text-amber-200/90">
                GSTIN and PAN are locked once verified and cannot be changed.
              </p>
            ) : null}
            {editing ? (
              <div>
                <EditRow label="GSTIN">
                  <Input
                    value={draft.gstNumber}
                    onChange={(e) => patchDraft("gstNumber", e.target.value)}
                    className={inputClass}
                    disabled={taxLocked}
                  />
                </EditRow>
                <EditRow label="PAN">
                  <Input
                    value={draft.panNumber}
                    onChange={(e) => patchDraft("panNumber", e.target.value)}
                    className={inputClass}
                    disabled={taxLocked}
                  />
                </EditRow>
                <EditRow label="Legal business name">
                  <Input
                    value={draft.legalBusinessName}
                    onChange={(e) =>
                      patchDraft("legalBusinessName", e.target.value)
                    }
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="Trade name">
                  <Input
                    value={draft.tradeName}
                    onChange={(e) => patchDraft("tradeName", e.target.value)}
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="GST registration state">
                  <Input
                    value={draft.gstRegistrationState}
                    onChange={(e) =>
                      patchDraft("gstRegistrationState", e.target.value)
                    }
                    className={inputClass}
                  />
                </EditRow>
              </div>
            ) : (
              <dl className="flex-1">
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
            )}
            {verifyHint ? (
              <p className="mt-auto pt-3 text-sm text-(--brand-text-muted)">{verifyHint}</p>
            ) : null}
            {!customer.gstNumber && !editing ? (
              <p className="mt-3 text-sm text-amber-200/90">
                Add a GSTIN before Verify GST (provider charges per check).
              </p>
            ) : null}
          </section>

          {(showMobileOtp || showEmailOtp) && !editing ? (
            <section className="rounded-2xl border border-amber-400/30 bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6 lg:col-span-12">
              <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-amber-200">
                Re-verify identity
              </h2>
              <p className="mb-4 text-sm text-(--brand-text-muted)">
                After a mobile or email change, send OTP and enter the code to
                mark verified again.
              </p>
              {showMobileOtp ? (
                <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-(--brand-label)">
                      Mobile OTP ({customer.mobileNumber})
                    </span>
                    <Input
                      value={mobileOtpCode}
                      onChange={(e) => setMobileOtpCode(e.target.value)}
                      placeholder="6-digit code"
                      className={inputClass}
                      inputMode="numeric"
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={commercialBusy}
                    onClick={() => void handleSendMobileOtp()}
                    className="h-9 rounded-xl border-(--brand-card-border) px-3 font-bold"
                  >
                    Send OTP
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={commercialBusy || !mobileOtpCode.trim()}
                    onClick={() => void handleVerifyMobileOtp()}
                    className="h-9 rounded-xl bg-(--brand-primary) px-3 font-bold text-black"
                  >
                    Verify
                  </Button>
                </div>
              ) : null}
              {showEmailOtp ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-(--brand-label)">
                      Email OTP ({customer.email})
                    </span>
                    <Input
                      value={emailOtpCode}
                      onChange={(e) => setEmailOtpCode(e.target.value)}
                      placeholder="6-digit code"
                      className={inputClass}
                      inputMode="numeric"
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={commercialBusy}
                    onClick={() => void handleSendEmailOtp()}
                    className="h-9 rounded-xl border-(--brand-card-border) px-3 font-bold"
                  >
                    Send OTP
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={commercialBusy || !emailOtpCode.trim()}
                    onClick={() => void handleVerifyEmailOtp()}
                    className="h-9 rounded-xl bg-(--brand-primary) px-3 font-bold text-black"
                  >
                    Verify
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6 lg:col-span-12">
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Commercial
            </h2>
            <div className="grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-(--brand-label)">
                  Pricing tier
                </span>
                <AdminSelect
                  value={pricingTierIdDraft}
                  onValueChange={setPricingTierIdDraft}
                  disabled={editing}
                  placeholder="Default (D)"
                  options={[
                    { value: "", label: "Default (D)" },
                    ...pricingTiers.map((t) => ({
                      value: t.id,
                      label: `${t.code}${t.isBase ? " (Base)" : ""} — ${t.discountPercent}%`,
                    })),
                  ]}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-(--brand-label)">
                  Credit limit (₹)
                </span>
                <Input
                  value={creditLimitDraft}
                  onChange={(e) => setCreditLimitDraft(e.target.value)}
                  placeholder="No limit"
                  disabled={editing}
                  className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
                  inputMode="decimal"
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-(--brand-text)">
                <input
                  type="checkbox"
                  checked={creditAllowedDraft}
                  onChange={(e) => setCreditAllowedDraft(e.target.checked)}
                  disabled={editing}
                  className="size-4 rounded border-(--brand-input-border)"
                />
                Credit allowed
              </label>
            </div>
            <div className="mt-4 flex max-w-4xl flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={commercialBusy || editing}
                onClick={() => void handleSaveCommercial()}
                className="h-9 rounded-xl bg-(--brand-primary) px-3 font-bold text-black hover:bg-(--brand-primary)/90"
              >
                {savingCommercial ? "Saving…" : "Save commercial"}
              </Button>
            </div>
            <div className="mt-4 max-w-4xl">
              <p className="text-xs font-bold uppercase tracking-wide text-(--brand-label)">
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
                      commercialBusy ||
                      editing ||
                      customer.accountAction === action
                    }
                    onClick={() => void handleAccountAction(action)}
                    className="h-9 rounded-xl border-(--brand-card-border) px-3 font-bold"
                  >
                    {action === "NONE" ? "Clear" : formatAccountAction(action)}
                  </Button>
                ))}
              </div>
            </div>
          </section>

          <section
            className={cn(
              "flex h-full flex-col rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6",
              editing ? "lg:col-span-12" : "lg:col-span-6"
            )}
          >
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Billing address
            </h2>
            {editing ? (
              <div>
                <EditRow label="Legal name">
                  <Input
                    value={draft.billingLegalName}
                    onChange={(e) =>
                      patchDraft("billingLegalName", e.target.value)
                    }
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="Address">
                  <Input
                    value={draft.billingAddress}
                    onChange={(e) =>
                      patchDraft("billingAddress", e.target.value)
                    }
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="City">
                  <Input
                    value={draft.billingCity}
                    onChange={(e) => patchDraft("billingCity", e.target.value)}
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="State">
                  <Input
                    value={draft.billingState}
                    onChange={(e) => patchDraft("billingState", e.target.value)}
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="PIN">
                  <Input
                    value={draft.billingPincode}
                    onChange={(e) =>
                      patchDraft("billingPincode", e.target.value)
                    }
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="GST state">
                  <Input
                    value={draft.billingGstState}
                    onChange={(e) =>
                      patchDraft("billingGstState", e.target.value)
                    }
                    className={inputClass}
                  />
                </EditRow>
              </div>
            ) : (
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
            )}
          </section>

          <section
            className={cn(
              "flex h-full flex-col rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6",
              editing ? "lg:col-span-12" : "lg:col-span-6"
            )}
          >
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Shipping address
            </h2>
            {editing ? (
              <div>
                <EditRow label="Legal name">
                  <Input
                    value={draft.shippingLegalName}
                    onChange={(e) =>
                      patchDraft("shippingLegalName", e.target.value)
                    }
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="Address">
                  <Input
                    value={draft.shippingAddress}
                    onChange={(e) =>
                      patchDraft("shippingAddress", e.target.value)
                    }
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="City">
                  <Input
                    value={draft.shippingCity}
                    onChange={(e) => patchDraft("shippingCity", e.target.value)}
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="State">
                  <Input
                    value={draft.shippingState}
                    onChange={(e) =>
                      patchDraft("shippingState", e.target.value)
                    }
                    className={inputClass}
                  />
                </EditRow>
                <EditRow label="PIN">
                  <Input
                    value={draft.shippingPincode}
                    onChange={(e) =>
                      patchDraft("shippingPincode", e.target.value)
                    }
                    className={inputClass}
                  />
                </EditRow>
              </div>
            ) : (
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
            )}
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
