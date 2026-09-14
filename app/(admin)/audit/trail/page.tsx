"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { AuditTrailTable } from "@/components/audit/audit-trail-table";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  auditExportUrl,
  fetchAuditEvents,
  type AuditEventRow,
} from "@/app/lib/admin-audit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getAccessToken } from "@/app/lib/client-auth";

export default function AuditTrailPage() {
  const [items, setItems] = useState<AuditEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuditEvents({
        page,
        limit: 25,
        module: module || undefined,
        action: action || undefined,
        q: query || undefined,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setItems([]);
      setError(err instanceof AdminApiError ? err.message : "Failed to load audit trail.");
    } finally {
      setLoading(false);
    }
  }, [page, module, action, query]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleExport() {
    const token = getAccessToken();
    const url = auditExportUrl({
      module: module || undefined,
      action: action || undefined,
      q: query || undefined,
    });
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = `audit-export-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(objectUrl);
      })
      .catch(() => setError("CSV export failed."));
  }

  return (
    <AdminPage title="Audit trail" subtitle={`${total} events`}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-xs text-(--brand-label)">Search</label>
          <Input
            value={query}
            onChange={(e) => {
              setPage(1);
              setQuery(e.target.value);
            }}
            placeholder="Public ID, message, entity…"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-(--brand-label)">Module</label>
          <Input
            value={module}
            onChange={(e) => {
              setPage(1);
              setModule(e.target.value.toUpperCase());
            }}
            placeholder="ORDER"
            className="w-32"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-(--brand-label)">Action</label>
          <Input
            value={action}
            onChange={(e) => {
              setPage(1);
              setAction(e.target.value.toUpperCase());
            }}
            placeholder="ORDER_CREATED"
            className="w-44"
          />
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
        <Button type="button" onClick={handleExport}>
          Export CSV
        </Button>
        <Link href="/audit" className="text-sm text-(--brand-primary) hover:underline">
          ← Overview
        </Link>
      </div>

      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {loading ? (
        <TableSkeleton compact columns={6} rows={8} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
          <AuditTrailTable items={items} />
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </Button>
        <span className="text-sm text-(--brand-label)">
          Page {page} · {total} total
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={page * 25 >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </AdminPage>
  );
}
