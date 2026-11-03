"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { AdminOrdersTable } from "@/components/admin-orders-table";
import { Button } from "@/components/ui/button";

export default function RxLabPage() {
  return (
    <AdminPage
      title="Rx orders"
      subtitle="Prescription RX orders — admin review, assign, then release to warehouse"
    >
      <AdminOrdersTable
        title="Rx orders"
        description="Held for admin until Mark available at warehouse. Assignment alone does not expose them to staff queues."
        searchPlaceholder="Search RX orders by customer, order #…"
        emptyMessage="No RX orders found yet."
        emptySearchMessage="No RX orders match your search."
        scope="rx_lab"
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
