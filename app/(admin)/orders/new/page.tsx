"use client";

import { AdminPage } from "@/components/admin-shell";
import { AdminCreateOrderPanel } from "@/components/admin-create-order-panel";

export default function AdminCreateOrderPage() {
  return (
    <AdminPage
      title="Create Order"
      subtitle="Place a catalog or RX order on behalf of an approved customer"
    >
      <AdminCreateOrderPanel />
    </AdminPage>
  );
}
