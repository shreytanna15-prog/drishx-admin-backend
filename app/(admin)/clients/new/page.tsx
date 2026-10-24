"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminApiError } from "@/app/lib/admin-api";
import { useCreateCustomer } from "@/app/lib/modules/customers/mutation/use-create-customer";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-(--brand-label)">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "h-10 border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)";

export default function NewClientPage() {
  const router = useRouter();
  const { mutate, pending } = useCreateCustomer({
    onSuccess: (customer) => {
      router.push(`/clients/${customer.id}?from=incomplete`);
    },
    onError: (err) => {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to create customer."
      );
    },
  });

  const [error, setError] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [shopName, setShopName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [creditAllowed, setCreditAllowed] = useState(true);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const limitTrim = creditLimit.trim();
    void mutate({
      mobileNumber: mobileNumber.trim(),
      name: name.trim() || undefined,
      email: email.trim() || undefined,
      businessName: businessName.trim() || undefined,
      shopName: shopName.trim() || undefined,
      gstNumber: gstNumber.trim() || undefined,
      panNumber: panNumber.trim() || undefined,
      addressLine1: addressLine1.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      pincode: pincode.trim() || undefined,
      creditLimit: limitTrim === "" ? undefined : Number(limitTrim),
      creditAllowed,
    });
  }

  return (
    <AdminPage
      title="New client"
      subtitle="Path B — create pending customer (Admin)"
    >
      <div className="mb-5">
        <Link
          href="/clients?tab=incomplete"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--brand-link) hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to clients
        </Link>
      </div>

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="mx-auto grid max-w-2xl gap-5 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6"
      >
        <p className="text-sm text-(--brand-text-muted)">
          Mobile is required. Customer stays in pending review until you approve.
          They verify mobile via OTP on first login.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile *">
            <Input
              required
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              placeholder="10-digit mobile"
              className={inputClass}
              inputMode="tel"
            />
          </Field>
          <Field label="Contact name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Email (optional)">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Business name">
            <Input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Shop name">
            <Input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="GSTIN">
            <Input
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="PAN">
            <Input
              value={panNumber}
              onChange={(e) => setPanNumber(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Address line 1">
            <Input
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="City">
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="State">
            <Input
              value={state}
              onChange={(e) => setState(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Pincode">
            <Input
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Credit limit (₹)">
            <Input
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              placeholder="Optional"
              className={inputClass}
              inputMode="decimal"
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold text-(--brand-text)">
          <input
            type="checkbox"
            checked={creditAllowed}
            onChange={(e) => setCreditAllowed(e.target.checked)}
            className="size-4 rounded border-(--brand-input-border)"
          />
          Credit allowed
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={pending}
            className="h-10 rounded-xl bg-(--brand-primary) px-4 font-bold text-black hover:bg-(--brand-primary)/90"
          >
            {pending ? "Creating…" : "Create client"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => router.push("/clients")}
            className="h-10 rounded-xl border-(--brand-card-border) font-bold"
          >
            Cancel
          </Button>
        </div>
      </form>
    </AdminPage>
  );
}
