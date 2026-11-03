"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { AdminTable } from "@/components/admin-table";
import { DetailSkeleton } from "@/components/admin-skeletons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  fetchCustomerChangeHistory,
  type CustomerChangeHistoryItem,
} from "@/app/lib/admin-customers";

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ChangeHistoryContent() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [items, setItems] = useState<CustomerChangeHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const rows = await fetchCustomerChangeHistory(id, 100);
        if (!cancelled) setItems(rows);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof AdminApiError
              ? err.message
              : "Failed to load change history."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <AdminPage title="Change history" subtitle="Admin updates for this client">
      <div className="mb-5">
        <Link
          href={`/clients/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--brand-link) hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to client
        </Link>
      </div>

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <DetailSkeleton />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
          No Admin change history yet.
        </div>
      ) : (
        <AdminTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & time</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Fields changed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="align-top whitespace-nowrap">
                    {formatWhen(item.createdAt)}
                  </TableCell>
                  <TableCell className="align-top">
                    {item.adminName?.trim() || "—"}
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    {item.notes?.trim() || "—"}
                  </TableCell>
                  <TableCell className="align-top whitespace-normal text-(--brand-text-muted)">
                    {item.fieldLabels.length > 0
                      ? item.fieldLabels.join(", ")
                      : item.action}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      )}
    </AdminPage>
  );
}

export default function ClientChangeHistoryPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ChangeHistoryContent />
    </Suspense>
  );
}
