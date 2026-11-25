"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Search,
} from "lucide-react";
import { AdminApiError } from "@/app/lib/admin-api";
import { listActiveDeliveryServiceOptions } from "@/app/lib/admin-delivery";
import {
  createAdminCatalogStockOrder,
  createAdminRxOrder,
  searchAdminCatalogPowers,
  type AdminCatalogPowerHit,
} from "@/app/lib/admin-orders";
import {
  createWalkInCustomer,
  fetchWalkInHistory,
  lookupWalkInMobile,
  sendWalkInMobileOtp,
  verifyWalkInMobileOtp,
  type AdminCustomer,
} from "@/app/lib/admin-customers";
import {
  filterEligibleCreateOrderCustomers,
  formatCustomerPickerLabel,
  isEligibleCreateOrderCustomer,
  resolveCatalogLensSearchUi,
  type CreateOrderCustomerCandidate,
} from "@/app/lib/admin-create-order-eligibility";
import { formatMoney } from "@/app/lib/admin-orders";
import { usePaginatedListState } from "@/app/lib/hooks/use-paginated-list-state";
import { orderTotalFromPairPrice } from "@/app/lib/lens-pricing";

type CatalogPowerHit = AdminCatalogPowerHit;
import { useGetCustomers } from "@/app/lib/modules/customers/query/use-get-customers";
import {
  QueryEmptyState,
  QueryErrorState,
  QueryLoadMoreButton,
} from "@/components/query-list-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4 | 5;

type OrderChannel = "CATALOG" | "RX";

type DeliveryServiceOption = {
  id: string;
  courierCompany: string;
  serviceName: string;
  serviceType: string;
  customerRate: number | string;
  etaText?: string | null;
  isActive?: boolean;
};

type CatalogDraft = {
  power: CatalogPowerHit | null;
  quantity: number;
  stockMode: "LIVE" | "NON_LIVE";
  notes: string;
  deliveryServiceId: string;
};

type RxDraft = {
  lensType: "single-vision" | "kryptok" | "progressive";
  orderFor: "both" | "right" | "left";
  quantity: number;
  feature: string;
  lensIndex: string;
  coating: string;
  productName: string;
  remarks: string;
  deliveryServiceId: string;
  right: { sph: string; cyl: string; axis: string; add: string };
  left: { sph: string; cyl: string; axis: string; add: string };
};

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Customer" },
  { id: 2, label: "Type" },
  { id: 3, label: "Build" },
  { id: 4, label: "Review" },
  { id: 5, label: "Confirm" },
];

const emptyRxEye = { sph: "0", cyl: "0", axis: "0", add: "" };

const initialRxDraft: RxDraft = {
  lensType: "single-vision",
  orderFor: "both",
  quantity: 1,
  feature: "Clear",
  lensIndex: "1.56",
  coating: "HMC",
  productName: "",
  remarks: "",
  deliveryServiceId: "",
  right: { ...emptyRxEye },
  left: { ...emptyRxEye },
};

function powerLabel(power: CatalogPowerHit): string {
  const parts = [
    power.skuCode,
    power.name,
    `SPH ${power.sph.toFixed(2)}`,
    `CYL ${power.cyl.toFixed(2)}`,
    power.axis != null ? `Axis ${power.axis}` : null,
    power.addition != null ? `ADD ${power.addition}` : null,
    power.eye,
  ].filter(Boolean);
  return parts.join(" · ");
}

function parseEyeNumber(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function AdminCreateOrderPanel() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [customerQuery, setCustomerQuery] = useState("");
  const [debouncedCustomerQ, setDebouncedCustomerQ] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<CreateOrderCustomerCandidate | null>(null);
  const [channel, setChannel] = useState<OrderChannel | null>(null);
  const [catalog, setCatalog] = useState<CatalogDraft>({
    power: null,
    quantity: 1,
    stockMode: "LIVE",
    notes: "",
    deliveryServiceId: "",
  });
  const [rx, setRx] = useState<RxDraft>(initialRxDraft);
  const [lensSearch, setLensSearch] = useState("");
  const [lensHits, setLensHits] = useState<CatalogPowerHit[]>([]);
  const [lensLoading, setLensLoading] = useState(false);
  const [deliveryServices, setDeliveryServices] = useState<
    DeliveryServiceOption[]
  >([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [, startTransition] = useTransition();

  const [customerMode, setCustomerMode] = useState<"search" | "walkin">(
    "search"
  );
  const [walkInMobile, setWalkInMobile] = useState("");
  const [walkInCode, setWalkInCode] = useState("");
  const [walkInName, setWalkInName] = useState("");
  const [walkInShop, setWalkInShop] = useState("");
  const [walkInSessionId, setWalkInSessionId] = useState<string | null>(null);
  const [walkInChallengeId, setWalkInChallengeId] = useState<string | null>(
    null
  );
  const [walkInPhase, setWalkInPhase] = useState<
    "idle" | "need_otp" | "need_create"
  >("idle");
  const [walkInBusy, setWalkInBusy] = useState(false);
  const [walkInError, setWalkInError] = useState<string | null>(null);
  const [walkInHistory, setWalkInHistory] = useState<AdminCustomer[]>([]);
  const [walkInHistoryLoading, setWalkInHistoryLoading] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedCustomerQ(customerQuery.trim()),
      300
    );
    return () => window.clearTimeout(t);
  }, [customerQuery]);

  const {
    page: customerPage,
    setPage: setCustomerPage,
    items: customers,
    onPageSuccess: onCustomersPageSuccess,
    acknowledgeCurrentKey: acknowledgeCustomersKey,
  } = usePaginatedListState<CreateOrderCustomerCandidate>(debouncedCustomerQ);

  const {
    data: customersPage,
    loading: customersLoading,
    refreshing: customersRefreshing,
    error: customersQueryError,
    refetch: refetchCustomers,
  } = useGetCustomers(
    {
      status: "orderable",
      page: customerPage,
      limit: 30,
      q: debouncedCustomerQ || undefined,
    },
    {
      onSuccess: (page) => {
        onCustomersPageSuccess({
          page: page.page,
          items: filterEligibleCreateOrderCustomers(
            page.items as CreateOrderCustomerCandidate[]
          ),
        });
      },
      onError: () => acknowledgeCustomersKey(),
    }
  );

  const customersError = customersQueryError?.message ?? null;
  const customersHasMore = Boolean(customersPage?.hasMore);

  useEffect(() => {
    if (customerMode !== "walkin") return;
    let cancelled = false;
    setWalkInHistoryLoading(true);
    void fetchWalkInHistory({ page: 1, limit: 20 })
      .then((page) => {
        if (!cancelled) setWalkInHistory(page.items);
      })
      .catch(() => {
        if (!cancelled) setWalkInHistory([]);
      })
      .finally(() => {
        if (!cancelled) setWalkInHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerMode]);

  function selectWalkInCustomer(customer: AdminCustomer) {
    if (!isEligibleCreateOrderCustomer(customer)) {
      setWalkInError("This customer is not eligible for create-order.");
      return;
    }
    setSelectedCustomer(customer);
    setCustomerMode("search");
    setWalkInPhase("idle");
    setCustomerPage(1);
    void refetchCustomers();
  }

  async function handleWalkInLookup() {
    setWalkInError(null);
    setWalkInBusy(true);
    setWalkInPhase("idle");
    setWalkInChallengeId(null);
    setWalkInSessionId(null);
    setWalkInCode("");
    try {
      const result = await lookupWalkInMobile(walkInMobile.trim());
      setWalkInMobile(result.mobileNumber || walkInMobile.trim());
      if (result.kind === "path_a") {
        setWalkInError(
          result.message ??
            "This mobile is a self-signup customer. Use Search instead."
        );
        return;
      }
      if (result.kind === "staff_created" && !result.orderable) {
        setWalkInError(
          result.message ?? "This customer cannot be used for walk-in."
        );
        return;
      }
      if (
        result.kind === "staff_created" &&
        result.skipOtp &&
        result.customer
      ) {
        selectWalkInCustomer(result.customer);
        return;
      }
      setWalkInPhase("need_otp");
    } catch (err) {
      setWalkInError(
        err instanceof AdminApiError ? err.message : "Failed to look up mobile."
      );
    } finally {
      setWalkInBusy(false);
    }
  }

  async function handleWalkInSendOtp() {
    setWalkInError(null);
    setWalkInBusy(true);
    try {
      const res = await sendWalkInMobileOtp(walkInMobile.trim());
      setWalkInSessionId(res.providerSessionId);
      setWalkInMobile(res.mobileNumber);
    } catch (err) {
      setWalkInError(
        err instanceof AdminApiError ? err.message : "Failed to send OTP."
      );
    } finally {
      setWalkInBusy(false);
    }
  }

  async function handleWalkInVerifyOtp() {
    setWalkInError(null);
    setWalkInBusy(true);
    try {
      const res = await verifyWalkInMobileOtp({
        mobileNumber: walkInMobile.trim(),
        code: walkInCode.trim(),
        sessionId: walkInSessionId,
      });
      setWalkInChallengeId(res.challengeId);
      setWalkInMobile(res.mobileNumber);
      if (res.walkInKind === "path_a" || res.code === "WALK_IN_PATH_A") {
        setWalkInError(
          res.message ??
            "This mobile is a self-signup customer. Use Search instead."
        );
        setWalkInPhase("idle");
        return;
      }
      if (res.code === "WALK_IN_NOT_ORDERABLE") {
        setWalkInError(
          res.message ?? "This customer cannot be used for walk-in."
        );
        setWalkInPhase("idle");
        return;
      }
      if (res.user && isEligibleCreateOrderCustomer(res.user)) {
        selectWalkInCustomer(res.user);
        return;
      }
      setWalkInPhase("need_create");
    } catch (err) {
      setWalkInError(
        err instanceof AdminApiError ? err.message : "Failed to verify OTP."
      );
    } finally {
      setWalkInBusy(false);
    }
  }

  async function handleWalkInCreate() {
    if (!walkInChallengeId) {
      setWalkInError("Verify mobile OTP first.");
      return;
    }
    setWalkInError(null);
    setWalkInBusy(true);
    try {
      const customer = await createWalkInCustomer({
        mobileNumber: walkInMobile.trim(),
        challengeId: walkInChallengeId,
        name: walkInName.trim() || undefined,
        shopName: walkInShop.trim() || undefined,
      });
      selectWalkInCustomer(customer);
    } catch (err) {
      setWalkInError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to create walk-in customer."
      );
    } finally {
      setWalkInBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listActiveDeliveryServiceOptions();
        if (cancelled) return;
        setDeliveryServices(list);
      } catch {
        /* delivery optional at create for some flows */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lensSearchUi = resolveCatalogLensSearchUi({
    search: lensSearch,
    hits: lensHits,
    loading: lensLoading,
  });

  useEffect(() => {
    if (step !== 3 || channel !== "CATALOG") return;
    if (!lensSearchUi.queryReady) return;
    const q = lensSearch.trim();
    let cancelled = false;
    const handle = window.setTimeout(() => {
      startTransition(() => {
        void (async () => {
          setLensLoading(true);
          try {
            const res = await searchAdminCatalogPowers({ q, page: 1, limit: 24 });
            if (cancelled) return;
            setLensHits(res.items ?? []);
          } catch {
            if (!cancelled) setLensHits([]);
          } finally {
            if (!cancelled) setLensLoading(false);
          }
        })();
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [step, channel, lensSearch, lensSearchUi.queryReady]);

  function goNext() {
    setSubmitError(null);
    if (step === 1 && !selectedCustomer) {
      setSubmitError("Select an eligible customer to continue.");
      return;
    }
    if (step === 2 && !channel) {
      setSubmitError("Choose an order type.");
      return;
    }
    if (step === 3) {
      if (channel === "CATALOG") {
        if (!catalog.power) {
          setSubmitError("Select a catalog stock leaf.");
          return;
        }
        if (!Number.isInteger(catalog.quantity) || catalog.quantity <= 0) {
          setSubmitError("Quantity must be a positive whole number.");
          return;
        }
        if (catalog.stockMode === "LIVE" && catalog.quantity > catalog.power.available) {
          setSubmitError("LIVE mode requires quantity ≤ available stock (or switch to NON_LIVE).");
          return;
        }
      }
      if (channel === "RX") {
        const rightSph = parseEyeNumber(rx.right.sph);
        const leftSph = parseEyeNumber(rx.left.sph);
        if ((rx.orderFor === "both" || rx.orderFor === "right") && rightSph == null) {
          setSubmitError("Right eye SPH is required.");
          return;
        }
        if ((rx.orderFor === "both" || rx.orderFor === "left") && leftSph == null) {
          setSubmitError("Left eye SPH is required.");
          return;
        }
      }
    }
    setStep((s) => (s < 5 ? ((s + 1) as Step) : s));
  }

  function goBack() {
    setSubmitError(null);
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  async function confirmPlace() {
    if (submitLockRef.current || submitting || !selectedCustomer || !channel) {
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (channel === "CATALOG" && catalog.power) {
        const res = await createAdminCatalogStockOrder({
          userId: selectedCustomer.id,
          lensProductPowerId: catalog.power.id,
          quantity: catalog.quantity,
          stockMode: catalog.stockMode,
          notes: catalog.notes.trim() || undefined,
          deliveryServiceId: catalog.deliveryServiceId || undefined,
        });
        router.push(`/orders/${res.order.id}`);
        return;
      }

      if (channel === "RX") {
        const prescription: Record<string, unknown> = {};
        if (rx.orderFor === "both" || rx.orderFor === "right") {
          prescription.right = {
            sph: Number(rx.right.sph),
            cyl: Number(rx.right.cyl),
            axis: Number(rx.right.axis),
            add: rx.right.add.trim() ? Number(rx.right.add) : null,
          };
        }
        if (rx.orderFor === "both" || rx.orderFor === "left") {
          prescription.left = {
            sph: Number(rx.left.sph),
            cyl: Number(rx.left.cyl),
            axis: Number(rx.left.axis),
            add: rx.left.add.trim() ? Number(rx.left.add) : null,
          };
        }
        const res = await createAdminRxOrder({
          userId: selectedCustomer.id,
          lensType: rx.lensType,
          orderFor: rx.orderFor,
          quantity: rx.quantity,
          feature: rx.feature,
          lensIndex: rx.lensIndex,
          coating: rx.coating,
          productName: rx.productName.trim() || undefined,
          remarks: rx.remarks.trim() || undefined,
          deliveryServiceId: rx.deliveryServiceId || undefined,
          prescription,
        });
        router.push(`/orders/${res.order.id}`);
        return;
      }
    } catch (err) {
      submitLockRef.current = false;
      setSubmitting(false);
      setSubmitError(
        err instanceof AdminApiError
          ? err.message
          : "Could not place the order. Your entries are preserved — fix and retry."
      );
      return;
    }
  }

  const catalogTotal =
    catalog.power != null
      ? orderTotalFromPairPrice(
          Number(catalog.power.price),
          Number(catalog.quantity)
        )
      : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <nav
        aria-label="Create order steps"
        className="flex flex-wrap gap-2 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-3"
      >
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={s.id > step}
            onClick={() => {
              if (s.id < step) {
                setSubmitError(null);
                setStep(s.id);
              }
            }}
            className={cn(
              "rounded-xl px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition",
              s.id === step
                ? "bg-(--brand-primary) text-(--brand-primary-text)"
                : s.id < step
                  ? "bg-(--brand-primary)/15 text-(--brand-primary)"
                  : "text-(--brand-text-muted)"
            )}
          >
            {s.id}. {s.label}
          </button>
        ))}
      </nav>

      {submitError ? (
        <div className="auth-alert-error" role="alert">
          {submitError}
        </div>
      ) : null}

      <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
        {step === 1 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-extrabold text-(--brand-text)">
                Select customer
              </h2>
              <p className="mt-1 text-sm text-(--brand-text-muted)">
                Approved customers, or pending walk-ins created by staff. The
                order will belong to this account.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={customerMode === "search" ? "default" : "outline"}
                onClick={() => setCustomerMode("search")}
                className="h-9 rounded-xl font-bold"
              >
                Search
              </Button>
              <Button
                type="button"
                size="sm"
                variant={customerMode === "walkin" ? "default" : "outline"}
                onClick={() => setCustomerMode("walkin")}
                className="h-9 rounded-xl font-bold"
              >
                Walk-in
              </Button>
            </div>

            {customerMode === "walkin" ? (
              <div className="space-y-3 rounded-xl border border-(--brand-card-border) p-4">
                <p className="text-sm text-(--brand-text-muted)">
                  Staff-created only. Verified mobiles skip OTP; new mobiles need
                  OTP then create.
                </p>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Input
                    value={walkInMobile}
                    onChange={(e) => {
                      setWalkInMobile(e.target.value);
                      if (walkInPhase !== "idle") setWalkInPhase("idle");
                    }}
                    placeholder="10-digit mobile"
                    className="h-11 rounded-xl"
                    inputMode="tel"
                    disabled={walkInBusy || walkInPhase === "need_create"}
                  />
                  <Button
                    type="button"
                    disabled={
                      walkInBusy ||
                      !walkInMobile.trim() ||
                      walkInPhase === "need_create"
                    }
                    onClick={() => void handleWalkInLookup()}
                    className="h-11 rounded-xl font-bold"
                  >
                    {walkInBusy && walkInPhase === "idle" ? "…" : "Continue"}
                  </Button>
                </div>
                {walkInPhase === "need_otp" || walkInPhase === "need_create" ? (
                  <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto]">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={walkInBusy || walkInPhase === "need_create"}
                      onClick={() => void handleWalkInSendOtp()}
                      className="h-11 rounded-xl font-bold"
                    >
                      Send OTP
                    </Button>
                    <Input
                      value={walkInCode}
                      onChange={(e) => setWalkInCode(e.target.value)}
                      placeholder="OTP code"
                      className="h-11 rounded-xl"
                      inputMode="numeric"
                      disabled={walkInBusy || walkInPhase === "need_create"}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        walkInBusy ||
                        !walkInCode.trim() ||
                        walkInPhase === "need_create"
                      }
                      onClick={() => void handleWalkInVerifyOtp()}
                      className="h-11 rounded-xl font-bold"
                    >
                      Verify
                    </Button>
                  </div>
                ) : null}
                {walkInPhase === "need_create" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      value={walkInName}
                      onChange={(e) => setWalkInName(e.target.value)}
                      placeholder="Contact name (optional)"
                      className="h-11 rounded-xl"
                    />
                    <Input
                      value={walkInShop}
                      onChange={(e) => setWalkInShop(e.target.value)}
                      placeholder="Shop name (optional)"
                      className="h-11 rounded-xl"
                    />
                    <Button
                      type="button"
                      disabled={walkInBusy}
                      onClick={() => void handleWalkInCreate()}
                      className="h-11 rounded-xl bg-(--brand-primary) font-bold text-black sm:col-span-2"
                    >
                      {walkInBusy ? "Creating…" : "Create walk-in & select"}
                    </Button>
                  </div>
                ) : null}
                {walkInError ? (
                  <p className="text-sm text-(--brand-danger)" role="alert">
                    {walkInError}
                  </p>
                ) : null}
                <div className="border-t border-(--brand-card-border) pt-3">
                  <p className="mb-2 text-xs font-semibold text-(--brand-text-muted)">
                    Recent staff-created
                  </p>
                  {walkInHistoryLoading ? (
                    <p className="text-xs text-(--brand-text-muted)">Loading…</p>
                  ) : walkInHistory.length === 0 ? (
                    <p className="text-xs text-(--brand-text-muted)">
                      No prior walk-in customers yet.
                    </p>
                  ) : (
                    <ul className="max-h-40 space-y-1 overflow-y-auto">
                      {walkInHistory.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-(--brand-text) hover:bg-(--brand-primary)/10"
                            disabled={walkInBusy}
                            onClick={() => selectWalkInCustomer(c)}
                          >
                            {formatCustomerPickerLabel(c)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--brand-text-muted)" />
                  <Input
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    placeholder="Search name, business, email, mobile…"
                    className="h-11 rounded-xl pl-10"
                  />
                </div>
                {customersLoading &&
                customerPage === 1 &&
                customers.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-(--brand-text-muted)">
                    <Loader2 className="size-4 animate-spin" /> Loading
                    customers…
                  </p>
                ) : customersError ? (
                  <QueryErrorState
                    message={customersError}
                    onRetry={() => {
                      setCustomerPage(1);
                      void refetchCustomers();
                    }}
                  />
                ) : customers.length === 0 ? (
                  <QueryEmptyState message="No matching eligible customers." />
                ) : (
                  <div className="space-y-2">
                    <ul className="max-h-80 space-y-2 overflow-y-auto">
                      {customers.map((c) => {
                        const selected = selectedCustomer?.id === c.id;
                        const pendingWalkIn =
                          c.approvalStatus === "PENDING_REVIEW" &&
                          Boolean(c.createdByStaffId);
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedCustomer(c)}
                              className={cn(
                                "w-full rounded-xl border px-4 py-3 text-left transition",
                                selected
                                  ? "border-(--brand-primary) bg-(--brand-primary)/10"
                                  : "border-(--brand-card-border) hover:bg-(--brand-primary)/5"
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-2 font-semibold text-(--brand-text)">
                                {formatCustomerPickerLabel(c)}
                                {pendingWalkIn ? (
                                  <span className="rounded-md border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-100">
                                    Pending walk-in
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                                {[c.name, c.email, c.mobileNumber]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <QueryLoadMoreButton
                      hasMore={customersHasMore}
                      loading={customersLoading || customersRefreshing}
                      onLoadMore={() => setCustomerPage((p) => p + 1)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-extrabold text-(--brand-text)">
                Choose order type
              </h2>
              <p className="mt-1 text-sm text-(--brand-text-muted)">
                Color and Wholesale admin create are deferred (Phase C).
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    id: "CATALOG" as const,
                    title: "Catalog / Retail",
                    desc: "Ready stock lens with pricing & reservation rules",
                  },
                  {
                    id: "RX" as const,
                    title: "RX prescription",
                    desc: "Custom RX — stays on admin hold until warehouse release",
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setChannel(opt.id)}
                  className={cn(
                    "rounded-xl border px-4 py-4 text-left transition",
                    channel === opt.id
                      ? "border-(--brand-primary) bg-(--brand-primary)/10"
                      : "border-(--brand-card-border) hover:bg-(--brand-primary)/5"
                  )}
                >
                  <div className="font-extrabold text-(--brand-text)">
                    {opt.title}
                  </div>
                  <p className="mt-1 text-sm text-(--brand-text-muted)">
                    {opt.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 && channel === "CATALOG" ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-extrabold text-(--brand-text)">
                Build catalog stock order
              </h2>
              <p className="mt-1 text-sm text-(--brand-text-muted)">
                Search catalog stock leaves (variant + SPH/CYL). LIVE requires available stock; NON_LIVE can raise procurement.
              </p>
            </div>
            <Input
              value={lensSearch}
              onChange={(e) => setLensSearch(e.target.value)}
              placeholder="Search SKU or name…"
              className="h-11 rounded-xl"
            />
            {lensSearchUi.loading ? (
              <p className="flex items-center gap-2 text-sm text-(--brand-text-muted)">
                <Loader2 className="size-4 animate-spin" /> Searching…
              </p>
            ) : null}
            <ul className="max-h-56 space-y-2 overflow-y-auto">
              {lensSearchUi.hits.map((power) => (
                <li key={power.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setCatalog((prev) => ({ ...prev, power }))
                    }
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left text-sm",
                      catalog.power?.id === power.id
                        ? "border-(--brand-primary) bg-(--brand-primary)/10"
                        : "border-(--brand-card-border)"
                    )}
                  >
                    <div className="font-semibold text-(--brand-text)">
                      {powerLabel(power)}
                    </div>
                    <div className="text-xs text-(--brand-text-muted)">
                      {formatMoney(power.price)} per pair · {power.available} available
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {catalog.power ? (
              <div className="rounded-xl border border-(--brand-card-border) p-3 text-sm">
                Selected:{" "}
                <span className="font-semibold">{powerLabel(catalog.power)}</span>
                {catalog.stockMode === "LIVE" && catalog.power.available < catalog.quantity ? (
                  <p className="mt-2 text-amber-700 dark:text-amber-300">
                    Requested qty exceeds available ({catalog.power.available}). Switch to NON_LIVE or lower qty.
                  </p>
                ) : null}
              </div>
            ) : null}
            <label className="block text-sm font-semibold text-(--brand-label)">
              Stock mode
              <select
                className="mt-1 block h-11 w-full rounded-xl border border-(--brand-input-border) bg-(--brand-card) px-3"
                value={catalog.stockMode}
                onChange={(e) =>
                  setCatalog((p) => ({
                    ...p,
                    stockMode: e.target.value as "LIVE" | "NON_LIVE",
                  }))
                }
              >
                <option value="LIVE">LIVE — available only</option>
                <option value="NON_LIVE">NON_LIVE — procure shortage</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-(--brand-label)">
              Quantity
              <Input
                type="number"
                min={1}
                step={1}
                value={catalog.quantity}
                onChange={(e) =>
                  setCatalog((p) => ({
                    ...p,
                    quantity: Number(e.target.value) || 0,
                  }))
                }
                className="mt-1 h-11 rounded-xl"
              />
            </label>
            <label className="block text-sm font-semibold text-(--brand-label)">
              Notes (optional)
              <Input
                value={catalog.notes}
                onChange={(e) =>
                  setCatalog((p) => ({ ...p, notes: e.target.value }))
                }
                className="mt-1 h-11 rounded-xl"
              />
            </label>
            <DeliverySelect
              value={catalog.deliveryServiceId}
              services={deliveryServices}
              onChange={(id) =>
                setCatalog((p) => ({ ...p, deliveryServiceId: id }))
              }
            />
          </div>
        ) : null}

        {step === 3 && channel === "RX" ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-extrabold text-(--brand-text)">
                Build RX order
              </h2>
              <p className="mt-1 text-sm text-(--brand-text-muted)">
                Same RX fields as customer/employee checkout. Held for admin
                review (RW-05) until warehouse release.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-(--brand-label)">
                Lens type
                <AdminSelect
                  className="mt-1"
                  value={rx.lensType}
                  onValueChange={(v) =>
                    setRx((p) => ({
                      ...p,
                      lensType: v as RxDraft["lensType"],
                    }))
                  }
                  options={[
                    { value: "single-vision", label: "Single vision" },
                    { value: "kryptok", label: "Kryptok" },
                    { value: "progressive", label: "Progressive" },
                  ]}
                  placeholder="Lens type"
                  triggerClassName="h-11 rounded-xl min-w-0"
                />
              </label>
              <label className="text-sm font-semibold text-(--brand-label)">
                Order for
                <AdminSelect
                  className="mt-1"
                  value={rx.orderFor}
                  onValueChange={(v) =>
                    setRx((p) => ({
                      ...p,
                      orderFor: v as RxDraft["orderFor"],
                    }))
                  }
                  options={[
                    { value: "both", label: "Both eyes" },
                    { value: "right", label: "Right only" },
                    { value: "left", label: "Left only" },
                  ]}
                  placeholder="Order for"
                  triggerClassName="h-11 rounded-xl min-w-0"
                />
              </label>
            </div>
            {(rx.orderFor === "both" || rx.orderFor === "right") && (
              <EyeFields
                label="Right eye"
                value={rx.right}
                showAdd={rx.lensType !== "single-vision"}
                onChange={(right) => setRx((p) => ({ ...p, right }))}
              />
            )}
            {(rx.orderFor === "both" || rx.orderFor === "left") && (
              <EyeFields
                label="Left eye"
                value={rx.left}
                showAdd={rx.lensType !== "single-vision"}
                onChange={(left) => setRx((p) => ({ ...p, left }))}
              />
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm font-semibold text-(--brand-label)">
                Feature
                <Input
                  value={rx.feature}
                  onChange={(e) =>
                    setRx((p) => ({ ...p, feature: e.target.value }))
                  }
                  className="mt-1 h-11 rounded-xl"
                />
              </label>
              <label className="text-sm font-semibold text-(--brand-label)">
                Index
                <Input
                  value={rx.lensIndex}
                  onChange={(e) =>
                    setRx((p) => ({ ...p, lensIndex: e.target.value }))
                  }
                  className="mt-1 h-11 rounded-xl"
                />
              </label>
              <label className="text-sm font-semibold text-(--brand-label)">
                Coating
                <Input
                  value={rx.coating}
                  onChange={(e) =>
                    setRx((p) => ({ ...p, coating: e.target.value }))
                  }
                  className="mt-1 h-11 rounded-xl"
                />
              </label>
            </div>
            <label className="block text-sm font-semibold text-(--brand-label)">
              Quantity
              <Input
                type="number"
                min={1}
                step={1}
                value={rx.quantity}
                onChange={(e) =>
                  setRx((p) => ({
                    ...p,
                    quantity: Math.max(1, Math.round(Number(e.target.value) || 1)),
                  }))
                }
                className="mt-1 h-11 rounded-xl"
              />
            </label>
            <label className="block text-sm font-semibold text-(--brand-label)">
              Product name (optional)
              <Input
                value={rx.productName}
                onChange={(e) =>
                  setRx((p) => ({ ...p, productName: e.target.value }))
                }
                className="mt-1 h-11 rounded-xl"
              />
            </label>
            <label className="block text-sm font-semibold text-(--brand-label)">
              Remarks (optional)
              <Input
                value={rx.remarks}
                onChange={(e) =>
                  setRx((p) => ({ ...p, remarks: e.target.value }))
                }
                className="mt-1 h-11 rounded-xl"
              />
            </label>
            <DeliverySelect
              value={rx.deliveryServiceId}
              services={deliveryServices}
              onChange={(id) => setRx((p) => ({ ...p, deliveryServiceId: id }))}
            />
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-extrabold text-(--brand-text)">
                Review
              </h2>
              <p className="mt-1 text-sm font-semibold text-(--brand-primary)">
                This order will be placed on behalf of the selected customer.
              </p>
            </div>
            <dl className="space-y-2 text-sm">
              <ReviewRow
                label="Customer"
                value={
                  selectedCustomer
                    ? `${formatCustomerPickerLabel(selectedCustomer)} (${selectedCustomer.email})`
                    : "—"
                }
              />
              <ReviewRow
                label="Order type"
                value={channel === "RX" ? "RX prescription" : "Catalog / Retail"}
              />
              {channel === "CATALOG" && catalog.power ? (
                <>
                  <ReviewRow label="Product" value={powerLabel(catalog.power)} />
                  <ReviewRow label="Stock mode" value={catalog.stockMode} />
                  <ReviewRow label="Quantity" value={String(catalog.quantity)} />
                  <ReviewRow
                    label="Price per pair"
                    value={formatMoney(catalog.power.price)}
                  />
                  <ReviewRow
                    label="Line total (est.)"
                    value={formatMoney(catalogTotal)}
                  />
                  <ReviewRow
                    label="Stock available"
                    value={String(catalog.power.available)}
                  />
                  <ReviewRow
                    label="Notes"
                    value={catalog.notes.trim() || "—"}
                  />
                </>
              ) : null}
              {channel === "RX" ? (
                <>
                  <ReviewRow label="Lens type" value={rx.lensType} />
                  <ReviewRow label="Order for" value={rx.orderFor} />
                  <ReviewRow label="Quantity" value={String(rx.quantity)} />
                  <ReviewRow
                    label="Pricing"
                    value="Confirmed by ops after review (RX)"
                  />
                  <ReviewRow
                    label="Warehouse"
                    value="Admin hold until explicit release (RW-05)"
                  />
                </>
              ) : null}
            </dl>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-extrabold text-(--brand-text)">
                Confirm placement
              </h2>
              <p className="mt-1 text-sm text-(--brand-text-muted)">
                Submit only when ready. Duplicate clicks are blocked. On success
                you will open the new order detail page.
              </p>
            </div>
            <div className="rounded-xl border border-(--brand-primary)/40 bg-(--brand-primary)/10 px-4 py-3 text-sm text-(--brand-text)">
              Placing{" "}
              <strong>{channel === "RX" ? "RX" : "catalog"}</strong> order for{" "}
              <strong>
                {selectedCustomer
                  ? formatCustomerPickerLabel(selectedCustomer)
                  : "customer"}
              </strong>
              . Attribution: admin panel · your signed-in admin account.
            </div>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => void confirmPlace()}
              className="h-11 w-full rounded-xl bg-(--brand-primary) font-extrabold text-(--brand-primary-text) hover:opacity-95 sm:w-auto sm:px-8"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Placing…
                </>
              ) : (
                <>
                  <Check className="size-4" /> Confirm & place order
                </>
              )}
            </Button>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-(--brand-card-border) pt-4">
          <div className="flex gap-2">
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={goBack}
                disabled={submitting}
              >
                <ArrowLeft className="size-4" /> Back
              </Button>
            ) : (
              <Button asChild variant="outline" className="h-10 rounded-xl">
                <Link href="/orders">
                  <ArrowLeft className="size-4" /> Orders
                </Link>
              </Button>
            )}
          </div>
          {step < 5 ? (
            <Button
              type="button"
              className="h-10 rounded-xl bg-(--brand-primary) font-extrabold text-(--brand-primary-text)"
              onClick={goNext}
            >
              Continue <ArrowRight className="size-4" />
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-(--brand-card-border) py-2 sm:grid-cols-[9rem_1fr]">
      <dt className="font-semibold text-(--brand-label)">{label}</dt>
      <dd className="text-(--brand-text)">{value}</dd>
    </div>
  );
}

function DeliverySelect({
  value,
  services,
  onChange,
}: {
  value: string;
  services: DeliveryServiceOption[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-(--brand-label)">
      Delivery service (optional)
      <AdminSelect
        className="mt-1"
        value={value}
        onValueChange={onChange}
        options={[
          { value: "", label: "None selected" },
          ...services.map((s) => ({
            value: s.id,
            label: `${s.courierCompany} · ${s.serviceName}${s.etaText ? ` (${s.etaText})` : ""}`,
          })),
        ]}
        placeholder="None selected"
        triggerClassName="h-11 rounded-xl min-w-0"
      />
    </label>
  );
}

function EyeFields({
  label,
  value,
  showAdd,
  onChange,
}: {
  label: string;
  value: { sph: string; cyl: string; axis: string; add: string };
  showAdd: boolean;
  onChange: (next: typeof value) => void;
}) {
  return (
    <fieldset className="rounded-xl border border-(--brand-card-border) p-3">
      <legend className="px-1 text-sm font-extrabold text-(--brand-text)">
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ["sph", "SPH"],
            ["cyl", "CYL"],
            ["axis", "AXIS"],
            ...(showAdd ? ([["add", "ADD"]] as const) : []),
          ] as const
        ).map(([key, text]) => (
          <label key={key} className="text-xs font-semibold text-(--brand-label)">
            {text}
            <Input
              value={value[key]}
              onChange={(e) =>
                onChange({ ...value, [key]: e.target.value })
              }
              className="mt-1 h-10 rounded-lg"
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
