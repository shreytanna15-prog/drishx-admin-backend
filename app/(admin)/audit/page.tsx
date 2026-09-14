"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPage } from "@/components/admin-shell";
import { AuditOverviewCards } from "@/components/audit/audit-overview-cards";
import { AdminApiError } from "@/app/lib/admin-api";
import { fetchAuditOverview, type AuditOverview } from "@/app/lib/admin-audit";

const LINKS = [
  { href: "/audit/trail", label: "Audit trail", desc: "Search and filter all business events" },
  { href: "/audit/activity", label: "Activity feed", desc: "Human-readable operational timeline" },
  { href: "/audit/security", label: "Security", desc: "Login, logout, access denied" },
  { href: "/audit/errors", label: "System errors", desc: "API and validation failures" },
];

export default function AuditOverviewPage() {
  const [overview, setOverview] = useState<AuditOverview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchAuditOverview()
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof AdminApiError ? err.message : "Failed to load overview.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminPage
      title="Audit & logs"
      subtitle="Immutable accountability trail across orders, inventory, finance, and security."
    >
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      <AuditOverviewCards data={overview} />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) transition hover:border-(--brand-primary)/50"
          >
            <h2 className="text-base font-bold text-(--brand-text)">{link.label}</h2>
            <p className="mt-1 text-sm text-(--brand-label)">{link.desc}</p>
          </Link>
        ))}
      </div>
    </AdminPage>
  );
}
