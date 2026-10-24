"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { SupplierForm } from "@/components/supplier-form";
import {
  backLinkClass,
  errorBannerClass,
  errorMessage,
  warningBannerClass,
} from "@/components/supplier-ui";
import { fetchSupplier, type AdminSupplier } from "@/app/lib/admin-suppliers";
import { cn } from "@/lib/utils";

export default function EditSupplierPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const detailHref = id ? `/procurement/suppliers/${encodeURIComponent(id)}` : "/procurement/suppliers";

  const [supplier, setSupplier] = useState<AdminSupplier | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchSupplier(id)
      .then((res) => {
        if (cancelled) return;
        setSupplier(res.supplier);
        setCanEdit(res.canEdit);
        setError("");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(errorMessage(err, "Failed to load supplier."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <AdminPage
      title={supplier ? `Edit ${supplier.name}` : "Edit supplier"}
      subtitle="Update business, GST, contact and address details."
    >
      <div className="mb-5">
        <Link href={detailHref} className={backLinkClass}>
          <ArrowLeft className="size-4" />
          Back to supplier
        </Link>
      </div>

      {error ? (
        <p className={cn("mb-4", errorBannerClass)} role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <DetailSkeleton cards={2} />
      ) : supplier && !canEdit ? (
        <p className={cn("mx-auto max-w-3xl", warningBannerClass)} role="alert">
          Only admins can edit suppliers.
        </p>
      ) : supplier ? (
        <SupplierForm
          supplier={supplier}
          onSaved={() => router.push(`${detailHref}?notice=saved`)}
          onCancel={() => router.push(detailHref)}
        />
      ) : null}
    </AdminPage>
  );
}
