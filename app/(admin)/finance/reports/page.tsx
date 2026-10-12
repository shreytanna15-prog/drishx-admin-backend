"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminPage } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";

/**
 * Legacy Finance → GST & Reports entry.
 * Reports hub owns GST Summary (and more); keep this route as a redirect.
 */
export default function FinanceReportsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/reports?report=gst-summary");
  }, [router]);

  return (
    <AdminPage
      title="GST & Reports"
      subtitle="Moved to the Reports hub"
    >
      <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-12 text-center shadow-(--brand-card-shadow)">
        <p className="text-sm text-(--brand-text-muted)">
          GST Summary and other reports now live under{" "}
          <span className="font-semibold text-(--brand-text)">Reports</span>.
        </p>
        <Button asChild className="mt-4 h-10 rounded-xl bg-(--brand-primary) font-bold text-black">
          <Link href="/reports?report=gst-summary">Open Reports hub</Link>
        </Button>
      </div>
    </AdminPage>
  );
}
