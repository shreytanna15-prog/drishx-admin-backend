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
    <AdminPage
      title="Rx & photo orders"
      subtitle="Prescription RX and photo orders — admin review, assign, then release to warehouse"
    >
      <AdminOrdersTable
        title="Rx & photo orders"
        description="Held for admin until Mark available at warehouse. Assignment alone does not expose them to staff queues."
        searchPlaceholder="Search RX / photo orders by customer, order #…"
        emptyMessage="No RX or photo prescription orders found yet."
        emptySearchMessage="No RX or photo orders match your search."
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
