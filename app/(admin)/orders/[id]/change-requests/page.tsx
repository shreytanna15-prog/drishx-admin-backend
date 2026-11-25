"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetOrderModifications } from "@/app/lib/modules/orders/query/use-get-order-modifications";
import { useGetOrder } from "@/app/lib/modules/orders/query/use-get-order";
import { useDecideOrderModification } from "@/app/lib/modules/orders/mutation/use-decide-order-modification";

export default function OrderChangeRequestsPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, refetch } = useGetOrderModifications(id);
  const { data: order, refetch: refreshOrder } = useGetOrder(id);
  const [reason, setReason] = useState("");
  const [goodsReturnedConfirmed, setGoodsReturnedConfirmed] = useState(false);
  const { mutate, pending, error: decisionError } = useDecideOrderModification({
    onSuccess: () => { setReason(""); setGoodsReturnedConfirmed(false); void refetch(); void refreshOrder(); },
  });
  return (
    <AdminPage title="Order change requests" subtitle="Admin approval reverses the original order and its stock; the customer then places a new order.">
      <Link href={`/orders/${id}`} className="text-sm text-(--brand-link) hover:underline">← Back to order</Link>
      {loading ? <TableSkeleton rows={4} /> : null}
      {error ? <p role="alert" className="mt-4 text-red-600">{error.message}</p> : null}
      <div className="mt-4 space-y-4">
        {data?.items.map((request) => (
          <section key={request.id} className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-5">
            <h2 className="font-semibold">{request.status} · {new Date(request.createdAt).toLocaleString()}</h2>
            <p className="text-sm">Requested quantity {request.requestedQuantity} · power {request.requestedPowerId || "same"}</p>
            <p className="text-sm">Reason: {request.reason}</p>
            {request.decisionReason ? <p className="text-sm">Decision: {request.decisionReason}</p> : null}
            {request.status === "PENDING" ? (
              <div className="mt-4 space-y-3">
                <label className="block text-sm">Decision reason
                  <Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
                </label>
                {Number(order?.pickedQuantity ?? 0) > 0 ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={goodsReturnedConfirmed} onChange={(event) => setGoodsReturnedConfirmed(event.target.checked)} />
                    I confirm all picked goods were physically returned to stock.
                  </label>
                ) : null}
                {decisionError ? <p role="alert" className="text-red-600">{decisionError.message}</p> : null}
                <div className="flex gap-2">
                  <Button disabled={pending || !reason.trim() || (Number(order?.pickedQuantity ?? 0) > 0 && !goodsReturnedConfirmed)} onClick={() => void mutate({ orderId: id, requestId: request.id, decision: "APPROVE", reason, goodsReturnedConfirmed })}>Approve reversal</Button>
                  <Button variant="outline" disabled={pending || !reason.trim()} onClick={() => void mutate({ orderId: id, requestId: request.id, decision: "REJECT", reason, goodsReturnedConfirmed: false })}>Reject</Button>
                </div>
              </div>
            ) : null}
          </section>
        ))}
        {data?.items.length === 0 ? <p className="text-sm text-(--brand-text-muted)">No change requests for this order.</p> : null}
      </div>
    </AdminPage>
  );
}
