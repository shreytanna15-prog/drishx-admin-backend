"use client";

import type { AuditOverview } from "@/app/lib/admin-audit";

const CARDS: {
  key: keyof AuditOverview;
  label: string;
  hint: string;
}[] = [
  { key: "todayTotal", label: "Events today", hint: "All audit events since midnight" },
  { key: "highRiskToday", label: "High-risk today", hint: "Sensitive actions flagged high-risk" },
  { key: "stockAdjustmentsToday", label: "Stock changes", hint: "Increment, decrement, adjust" },
  { key: "financeToday", label: "Finance events", hint: "Payments, expenses, voids" },
  { key: "failedSecurityToday", label: "Failed security", hint: "Login failures & access denied" },
];

export function AuditOverviewCards({ data }: { data: AuditOverview | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {CARDS.map((card) => (
        <article
          key={card.key}
          className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow)"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-(--brand-label)">
            {card.label}
          </p>
          <p className="mt-2 text-3xl font-bold text-(--brand-text)">
            {data ? data[card.key] : "—"}
          </p>
          <p className="mt-1 text-xs text-(--brand-label)">{card.hint}</p>
        </article>
      ))}
    </div>
  );
}
