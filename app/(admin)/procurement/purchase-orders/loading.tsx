import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";

export default function PurchaseOrdersLoading() {
  return (
    <AdminPage title="Purchase Orders" subtitle="Loading…">
      <TableSkeleton rows={8} columns={6} compact />
    </AdminPage>
  );
}
