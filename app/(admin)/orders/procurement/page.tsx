"use client";

import { useCallback } from "react";
import Link from "next/link";
import { AdminPage } from "@/components/admin-shell";
import { AdminOrdersTable } from "@/components/admin-orders-table";
import type { AdminOrder } from "@/app/lib/admin-orders";

export default function ProcurementOrdersPage() {
  const filterOrders = useCallback(
    (orders: AdminOrder[]) =>
      orders.filter((order) => order.status === "AWAITING_PROCUREMENT"),
    []
  );

  return (
    <AdminPage
      title="Procurement"
      subtitle="Orders waiting for stock intake"
    >
      <AdminOrdersTable
        title="Procurement queue"
        description="Awaiting procurement"
        emptyMessage="No orders are waiting for procurement."
        emptySearchMessage="No procurement orders match your search."
        filterOrders={filterOrders}
        showFilters
        defaultStatus="AWAITING_PROCUREMENT"
      />

      <div className="mt-4 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4 text-sm text-(--brand-text-muted)">
        <p>
          Open an order for full control. After stock is available, set status to{" "}
          <strong className="text-(--brand-text)">Pending</strong> or{" "}
          <strong className="text-(--brand-text)">Picking</strong> on the
          order detail page. Record physical stock intake under{" "}
          <Link
            href="/finance/expenses"
            className="font-semibold text-(--brand-link) hover:underline"
          >
            Finance → Expenses
          </Link>
          .
        </p>
      </div>
    </AdminPage>
  );
}
