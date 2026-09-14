"use client";

import Link from "next/link";
import { Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { AdminOrdersTable } from "@/components/admin-orders-table";
import { Button } from "@/components/ui/button";
import { filterNonRxOrders, type AdminOrder } from "@/app/lib/admin-orders";

function OrdersPageContent() {
  const searchParams = useSearchParams();
  const createReturnMode = searchParams.get("createReturn") === "1";

  const filterOrders = useCallback(
    (orders: AdminOrder[]) => filterNonRxOrders(orders),
    []
  );

  return (
    <AdminPage title="Orders" subtitle="Catalog, color, and wholesale orders">
      {createReturnMode ? (
        <div className="mb-4 rounded-2xl border border-(--brand-primary)/40 bg-(--brand-primary)/10 px-4 py-3 text-sm text-(--brand-text)">
          <p className="font-semibold text-(--brand-primary)">
            Create return / replacement on behalf of a customer
          </p>
          <p className="mt-1 text-(--brand-text-muted)">
            Open an order below. On the order detail page, use{" "}
            <span className="font-semibold text-(--brand-text)">
              Create return on behalf of customer
            </span>{" "}
            to submit for admin review.
          </p>
          <div className="mt-2">
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link href="/returns">Back to returns</Link>
            </Button>
          </div>
        </div>
      ) : null}
      <AdminOrdersTable
        title="Orders"
        description="Catalog, color, and wholesale orders"
        emptyMessage="No orders found yet."
        showFilters
        hideRxOrderKind
        filterOrders={filterOrders}
        orderDetailHash={
          createReturnMode ? "create-return-on-behalf" : undefined
        }
        headerActions={
          <Button
            asChild
            className="h-10 rounded-xl bg-(--brand-primary) px-4 text-sm font-extrabold text-(--brand-primary-text) hover:opacity-95"
          >
            <Link href="/orders/rx-lab">
              <FlaskConical className="size-4" />
              Rx Orders
            </Link>
          </Button>
        }
      />
    </AdminPage>
  );
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <AdminPage title="Orders" subtitle="Catalog, color, and wholesale orders">
          <TableSkeleton />
        </AdminPage>
      }
    >
      <OrdersPageContent />
    </Suspense>
  );
}
