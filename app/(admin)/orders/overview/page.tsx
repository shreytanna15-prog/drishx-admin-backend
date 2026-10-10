"use client";

import { AdminPage } from "@/components/admin-shell";
import { AdminOrdersGroupedOverview } from "@/components/admin-orders-grouped-overview";

export default function OrdersOverviewPage() {
  return (
    <AdminPage
      title="Orders overview"
      subtitle="Catalog, color, and wholesale orders grouped by date or customer"
    >
      <AdminOrdersGroupedOverview />
    </AdminPage>
  );
}
