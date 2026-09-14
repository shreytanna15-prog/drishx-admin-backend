"use client";

import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminPage } from "@/components/admin-shell";

export default function AdminHomePage() {
  return (
    <AdminPage title="Dashboard" subtitle="Admin overview">
      <AdminDashboard />
    </AdminPage>
  );
}
