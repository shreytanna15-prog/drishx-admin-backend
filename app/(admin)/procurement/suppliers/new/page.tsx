"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { SupplierForm } from "@/components/supplier-form";
import { backLinkClass } from "@/components/supplier-ui";

export default function NewSupplierPage() {
  const router = useRouter();

  return (
    <AdminPage
      title="New supplier"
      subtitle="Add a supplier profile for purchase orders, receipts and purchase bills."
    >
      <div className="mb-5">
        <Link href="/procurement/suppliers" className={backLinkClass}>
          <ArrowLeft className="size-4" />
          Back to suppliers
        </Link>
      </div>

      <SupplierForm
        onSaved={(supplier) =>
          router.push(`/procurement/suppliers/${supplier.id}?notice=created`)
        }
        onCancel={() => router.push("/procurement/suppliers")}
      />
    </AdminPage>
  );
}
