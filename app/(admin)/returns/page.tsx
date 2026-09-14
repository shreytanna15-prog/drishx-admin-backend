"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { AdminApiError, adminFetch } from "@/app/lib/admin-api";
import {
  formatReturnDate,
  formatReturnStatus,
  returnStatusBadgeClass,
  type AdminReturnRequest,
} from "@/app/lib/admin-returns";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ReturnsPage() {
  const [requests, setRequests] = useState<AdminReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await adminFetch<AdminReturnRequest[]>("/api/returns");
        setRequests(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(
          err instanceof AdminApiError ? err.message : "Failed to load return requests."
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return requests;
    return requests.filter((request) =>
      [
        request.requestNumber,
        request.customer?.name ?? "",
        request.customer?.businessName ?? "",
        request.customer?.email ?? "",
        request.status,
        formatReturnStatus(request.status),
        request.assignedEmployee?.name ?? "",
        request.assignedEmployee?.email ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [query, requests]);

  const needsReviewCount = useMemo(
    () =>
      requests.filter(
        (r) =>
          r.status === "SUBMITTED" ||
          r.status === "ESCALATED_TO_ADMIN" ||
          r.status === "MORE_INFO_REQUIRED"
      ).length,
    [requests]
  );

  return (
    <AdminPage title="Returns & Replacements" subtitle="Customer requests and decisions">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
            Returns & Replacements
          </h1>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            {loading
              ? "…"
              : `${filtered.length} request${filtered.length === 1 ? "" : "s"}${
                  needsReviewCount > 0
                    ? ` · ${needsReviewCount} need${needsReviewCount === 1 ? "s" : ""} admin review`
                    : ""
                }`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button asChild className="rounded-xl">
            <Link href="/orders?createReturn=1">
              <Plus className="size-4" />
              Create on behalf
            </Link>
          </Button>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by customer, request number, or status"
            className="sm:w-80"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-400/35 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <TableSkeleton compact columns={5} rows={8} />
      ) : (
      <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card)">
        <div className="grid grid-cols-[1.1fr_1fr_0.9fr_0.8fr_0.8fr] gap-4 border-b border-(--brand-card-border) px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-(--brand-text-muted)">
          <div>Request</div>
          <div>Customer</div>
          <div>Status</div>
          <div>Assignee</div>
          <div>Created</div>
        </div>
        {filtered.map((request) => {
          const needsReview =
            request.status === "SUBMITTED" ||
            request.status === "ESCALATED_TO_ADMIN" ||
            (request.status === "MORE_INFO_REQUIRED" && !request.assignedEmployee);
          return (
            <Link
              key={request.id}
              href={`/returns/${request.id}`}
              className={`grid grid-cols-[1.1fr_1fr_0.9fr_0.8fr_0.8fr] gap-4 border-b border-(--brand-card-border) px-4 py-4 transition-colors hover:bg-(--brand-card-hover,rgba(255,255,255,0.03)) ${
                needsReview ? "bg-amber-500/5" : ""
              }`}
            >
              <div>
                <p className="font-semibold text-(--brand-link)">{request.requestNumber}</p>
                <p className="mt-1 text-xs text-(--brand-text-muted)">
                  {request.requestType} · {request.items.length} item
                  {request.items.length === 1 ? "" : "s"}
                  {needsReview ? " · Needs review" : ""}
                </p>
              </div>
              <div>
                <p className="font-semibold text-(--brand-text)">
                  {request.customer.businessName || request.customer.name || request.customer.email}
                </p>
                <p className="mt-1 text-xs text-(--brand-text-muted)">
                  {request.customer.email}
                </p>
              </div>
              <div>
                <Badge
                  variant="outline"
                  className={returnStatusBadgeClass(request.status)}
                >
                  {formatReturnStatus(request.status)}
                </Badge>
              </div>
              <div className="text-sm text-(--brand-text-muted)">
                {request.assignedEmployee?.name ||
                  request.assignedEmployee?.email ||
                  "—"}
              </div>
              <div className="text-sm text-(--brand-text-muted)">
                {formatReturnDate(request.createdAt)}
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-(--brand-text-muted)">
            No return requests found.
          </div>
        ) : null}
      </div>
      )}
    </AdminPage>
  );
}
