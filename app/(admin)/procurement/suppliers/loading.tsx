import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";

export default function SuppliersLoading() {
  return (
    <AdminPage title="Suppliers" subtitle="Loading…">
      <TableSkeleton rows={8} columns={7} compact />
    </AdminPage>
  );
}
