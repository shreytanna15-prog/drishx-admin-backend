"use client";

import { Suspense } from "react";
import { AdminPage } from "@/components/admin-shell";
import { AdminReportsHub } from "@/components/admin-reports-hub";
import { TableSkeleton } from "@/components/admin-skeletons";

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <AdminPage title="Reports" subtitle="…">
          <TableSkeleton />
        </AdminPage>
      }
    >
      <AdminReportsHub />
    </Suspense>
  );
}
