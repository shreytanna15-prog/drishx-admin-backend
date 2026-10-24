"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { SupplierReadOnly } from "@/components/supplier-read-only";
import {
  backLinkClass,
  errorBannerClass,
  errorMessage,
  successBannerClass,
} from "@/components/supplier-ui";
import { Button } from "@/components/ui/button";
import { fetchSupplier, type AdminSupplier } from "@/app/lib/admin-suppliers";
import { cn } from "@/lib/utils";

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params?.id;
  const notice = searchParams.get("notice");

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

  const noticeText =
    notice === "created"
      ? `Supplier "${supplier?.name ?? ""}" created.`
      : notice === "saved"
        ? `Saved "${supplier?.name ?? ""}".`
        : "";

  return (
    <AdminPage
      title={supplier?.name ?? "Supplier"}
      subtitle={
        supplier
          ? canEdit
            ? "Supplier profile. Edit to change business, GST, contact or address details."
            : "Read-only supplier profile. Only admins can make changes."
          : "Supplier profile"
      }
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/procurement/suppliers" className={backLinkClass}>
          <ArrowLeft className="size-4" />
          Back to suppliers
        </Link>
        {supplier && canEdit && id ? (
          <Button asChild>
            <Link href={`/procurement/suppliers/${encodeURIComponent(id)}/edit`}>
              <Pencil className="size-4" />
              Edit
            </Link>
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className={cn("mb-4", errorBannerClass)} role="alert">
          {error}
        </p>
      ) : null}
      {supplier && noticeText ? (
        <p className={cn("mx-auto mb-4 max-w-3xl", successBannerClass)} role="status">
          {noticeText}
        </p>
      ) : null}

      {loading ? <DetailSkeleton cards={2} /> : supplier ? <SupplierReadOnly supplier={supplier} /> : null}
    </AdminPage>
  );
}
