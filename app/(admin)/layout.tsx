import type { ReactNode } from "react";
import { AdminChrome } from "@/components/admin-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminChrome>{children}</AdminChrome>;
}
