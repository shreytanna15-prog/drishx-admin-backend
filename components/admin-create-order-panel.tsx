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
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import {
  filterEligibleCreateOrderCustomers,
  formatCustomerPickerLabel,
  resolveCatalogLensSearchUi,
  type CreateOrderCustomerCandidate,
} from "@/app/lib/admin-create-order-eligibility";
import { formatMoney } from "@/app/lib/admin-orders";
import { usePaginatedListState } from "@/app/lib/hooks/use-paginated-list-state";
import { orderTotalFromPairPrice } from "@/app/lib/lens-pricing";
import { useGetCustomers } from "@/app/lib/modules/customers/query/use-get-customers";
import {
  QueryEmptyState,
  QueryErrorState,
  QueryLoadMoreButton,
} from "@/components/query-list-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type CatalogLensHit = {
  id: string;
  lensType: "SINGLE_VISION" | "KRYPTOK" | "PROGRESSIVE";
  brand?: string | null;
  item?: string | null;
  coating?: string | null;
  category?: string | null;
  sph?: number | null;
  cyl?: number | null;
  axis?: number | null;
  add?: number | null;
  eye?: string | null;
  price: number;
  quantity: number;
};

type CatalogDraft = {
  lens: CatalogLensHit | null;
  quantity: number;
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

function lensLabel(lens: CatalogLensHit): string {
  const parts = [
    lens.brand,
    lens.item,
    lens.coating,
    lens.sph != null ? `SPH ${lens.sph}` : null,
    lens.cyl != null ? `CYL ${lens.cyl}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || lens.id;
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
    lens: null,
    quantity: 1,
    notes: "",
    deliveryServiceId: "",
  });
  const [rx, setRx] = useState<RxDraft>(initialRxDraft);
  const [lensSearch, setLensSearch] = useState("");
  const [lensTypeFilter, setLensTypeFilter] = useState<
    "single-vision" | "kryptok" | "progressive"
  >("single-vision");
  const [lensHits, setLensHits] = useState<CatalogLensHit[]>([]);
  const [lensLoading, setLensLoading] = useState(false);
  const [deliveryServices, setDeliveryServices] = useState<
    DeliveryServiceOption[]
  >([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [, startTransition] = useTransition();

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
      status: "approved",
      activeOnly: true,
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
    let cancelled = false;
    (async () => {
      try {
        const data = await adminFetch<
          DeliveryServiceOption[] | { services?: DeliveryServiceOption[] }
        >("/api/delivery-services");
        if (cancelled) return;
        const list = Array.isArray(data) ? data : (data.services ?? []);
        setDeliveryServices(list.filter((s) => s.isActive !== false));
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
            const params = new URLSearchParams({
              type: lensTypeFilter,
              search: q,
              page: "1",
              limit: "20",
            });
            const data = await adminFetch<{
              items?: CatalogLensHit[];
              lenses?: CatalogLensHit[];
            }>(`/api/lenses?${params}`);
            if (cancelled) return;
            setLensHits(data.items ?? data.lenses ?? []);
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
  }, [step, channel, lensSearch, lensTypeFilter, lensSearchUi.queryReady]);

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
        if (!catalog.lens) {
          setSubmitError("Select a catalog lens.");
          return;
        }
        if (!(catalog.quantity > 0)) {
          setSubmitError("Quantity must be greater than zero.");
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
      if (channel === "CATALOG" && catalog.lens) {
        const body: Record<string, unknown> = {
          userId: selectedCustomer.id,
          lensType: catalog.lens.lensType,
          lensId: catalog.lens.id,
          quantity: catalog.quantity,
          notes: catalog.notes.trim() || undefined,
          deliveryServiceId: catalog.deliveryServiceId || undefined,
          sph: catalog.lens.sph,
          cyl: catalog.lens.cyl,
          axis: catalog.lens.axis,
          add: catalog.lens.add,
          eye: catalog.lens.eye,
        };
        const res = await adminFetch<{ order: { id: string } }>(
          "/api/orders",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
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
        const res = await adminFetch<{ order: { id: string } }>(
          "/api/orders/rx",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
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
            }),
          }
        );
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
    catalog.lens != null
      ? orderTotalFromPairPrice(
          Number(catalog.lens.price),
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
                Approved and active customers only. The order will belong to this
                account.
              </p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--brand-text-muted)" />
              <Input
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="Search name, business, email, mobile…"
                className="h-11 rounded-xl pl-10"
              />
            </div>
            {customersLoading && customerPage === 1 && customers.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-(--brand-text-muted)">
                <Loader2 className="size-4 animate-spin" /> Loading customers…
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
                          <div className="font-semibold text-(--brand-text)">
                            {formatCustomerPickerLabel(c)}
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
                Build catalog order
              </h2>
              <p className="mt-1 text-sm text-(--brand-text-muted)">
                Search the live lens catalog. Stock and price come from checkout.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["single-vision", "Single vision"],
                  ["kryptok", "Kryptok"],
                  ["progressive", "Progressive"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLensTypeFilter(value)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-bold",
                    lensTypeFilter === value
                      ? "bg-(--brand-primary) text-(--brand-primary-text)"
                      : "bg-(--brand-primary)/10 text-(--brand-text)"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <Input
              value={lensSearch}
              onChange={(e) => setLensSearch(e.target.value)}
              placeholder="Search brand, item, coating, power…"
              className="h-11 rounded-xl"
            />
            {lensSearchUi.loading ? (
              <p className="flex items-center gap-2 text-sm text-(--brand-text-muted)">
                <Loader2 className="size-4 animate-spin" /> Searching…
              </p>
            ) : null}
            <ul className="max-h-56 space-y-2 overflow-y-auto">
              {lensSearchUi.hits.map((lens) => (
                <li key={lens.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setCatalog((prev) => ({ ...prev, lens }))
                    }
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left text-sm",
                      catalog.lens?.id === lens.id
                        ? "border-(--brand-primary) bg-(--brand-primary)/10"
                        : "border-(--brand-card-border)"
                    )}
                  >
                    <div className="font-semibold text-(--brand-text)">
                      {lensLabel(lens)}
                    </div>
                    <div className="text-xs text-(--brand-text-muted)">
                      {formatMoney(lens.price)} per pair · Stock{" "}
                      {lens.quantity}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {catalog.lens ? (
              <div className="rounded-xl border border-(--brand-card-border) p-3 text-sm">
                Selected:{" "}
                <span className="font-semibold">{lensLabel(catalog.lens)}</span>
                {catalog.lens.quantity < catalog.quantity ? (
                  <p className="mt-2 text-amber-700 dark:text-amber-300">
                    Requested qty exceeds available stock ({catalog.lens.quantity}
                    ). Checkout may route to procurement for the customer.
                  </p>
                ) : null}
              </div>
            ) : null}
            <label className="block text-sm font-semibold text-(--brand-label)">
              Quantity
              <Input
                type="number"
                min={0.25}
                step={0.25}
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
                <select
                  className="mt-1 h-11 w-full rounded-xl border border-(--brand-card-border) bg-(--brand-card) px-3"
                  value={rx.lensType}
                  onChange={(e) =>
                    setRx((p) => ({
                      ...p,
                      lensType: e.target.value as RxDraft["lensType"],
                    }))
                  }
                >
                  <option value="single-vision">Single vision</option>
                  <option value="kryptok">Kryptok</option>
                  <option value="progressive">Progressive</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-(--brand-label)">
                Order for
                <select
                  className="mt-1 h-11 w-full rounded-xl border border-(--brand-card-border) bg-(--brand-card) px-3"
                  value={rx.orderFor}
                  onChange={(e) =>
                    setRx((p) => ({
                      ...p,
                      orderFor: e.target.value as RxDraft["orderFor"],
                    }))
                  }
                >
                  <option value="both">Both eyes</option>
                  <option value="right">Right only</option>
                  <option value="left">Left only</option>
                </select>
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
              {channel === "CATALOG" && catalog.lens ? (
                <>
                  <ReviewRow label="Product" value={lensLabel(catalog.lens)} />
                  <ReviewRow label="Quantity" value={String(catalog.quantity)} />
                  <ReviewRow
                    label="Price per pair"
                    value={formatMoney(catalog.lens.price)}
                  />
                  <ReviewRow
                    label="Line total (est.)"
                    value={formatMoney(catalogTotal)}
                  />
                  <ReviewRow
                    label="Stock available"
                    value={String(catalog.lens.quantity)}
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
      <select
        className="mt-1 h-11 w-full rounded-xl border border-(--brand-card-border) bg-(--brand-card) px-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">None selected</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.courierCompany} · {s.serviceName}
            {s.etaText ? ` (${s.etaText})` : ""}
          </option>
        ))}
      </select>
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
