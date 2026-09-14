"use client";

import { AdminPage } from "@/components/admin-shell";

export default function PowerWiseStockPage() {
  return (
    <AdminPage title="Power wise stock" subtitle="Inventory">
      <div className="admin-coming-soon !p-0">
        <p className="admin-coming-soon-eyebrow">Power wise stock</p>
        <h1 className="admin-coming-soon-title">Coming soon</h1>
        <p className="admin-coming-soon-copy">
          Power-wise stock views and filters are on the way.
        </p>
      </div>
    </AdminPage>
  );
}
