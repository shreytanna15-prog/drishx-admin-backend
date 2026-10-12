"use client";

import { Suspense } from "react";
import { AdminPage } from "@/components/admin-shell";
import { AdminOrdersGroupedOverview } from "@/components/admin-orders-grouped-overview";
import { ListSkeleton } from "@/components/admin-skeletons";

export default function OrdersOverviewPage() {
  return (
    <AdminPage
      title="Orders overview"
      subtitle="Catalog, color, and wholesale orders grouped by date or customer"
    >
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <AdminOrdersGroupedOverview />
      </Suspense>
    </AdminPage>
  );
}
