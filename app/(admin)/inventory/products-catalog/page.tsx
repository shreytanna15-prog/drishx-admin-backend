"use client";

import { AdminPage } from "@/components/admin-shell";

export default function ProductsCatalogPage() {
  return (
    <AdminPage title="Products & catalog" subtitle="Inventory">
      <div className="admin-coming-soon !p-0">
        <p className="admin-coming-soon-eyebrow">Products & catalog</p>
        <h1 className="admin-coming-soon-title">Coming soon</h1>
        <p className="admin-coming-soon-copy">
          Product catalog management is on the way.
        </p>
      </div>
    </AdminPage>
  );
}
