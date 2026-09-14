"use client";

import Link from "next/link";
import { useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { AdminOrdersTable } from "@/components/admin-orders-table";
import { Button } from "@/components/ui/button";
import { filterRxOrders, type AdminOrder } from "@/app/lib/admin-orders";

export default function RxLabPage() {
  const filterOrders = useCallback(
    (orders: AdminOrder[]) => filterRxOrders(orders),
    []
  );

  return (
    <AdminPage title="Rx Orders" subtitle="Custom prescription RX orders">
      <AdminOrdersTable
        title="Rx Orders"
        description="All RX prescription orders"
        searchPlaceholder="Search RX orders by customer, order #…"
        emptyMessage="No RX orders found yet."
        emptySearchMessage="No RX orders match your search."
        filterOrders={filterOrders}
        showNotes
        showFilters
        hideOrderKindFilter
        headerActions={
          <Button
            asChild
            variant="outline"
            className="h-10 rounded-xl border-(--brand-input-border)"
          >
            <Link href="/orders">
              <ArrowLeft className="size-4" />
              All Orders
            </Link>
          </Button>
        }
      />
    </AdminPage>
  );
}
