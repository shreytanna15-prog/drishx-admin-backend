"use client";

import { useState } from "react";
import type { AdminReturnRequest } from "@/app/lib/admin-returns";
import { useCorrectReturnStock } from "@/app/lib/modules/returns/mutation/use-correct-return-stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ReturnStockCorrection({ request, onSaved }: {
  request: AdminReturnRequest;
  onSaved: () => Promise<void>;
}) {
  const items = request.items.filter((item) => Boolean(item.lensProductPowerId));
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, String(item.saleableRestockedQuantity ?? 0)]))
  );
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const { mutate, pending, error } = useCorrectReturnStock({
    onSuccess: () => {
      setReason("");
      setMessage("Saleable return quantities updated.");
      void onSaved();
    },
  });
  if (!items.length) return null;
  const changed = items.filter((item) => Number(quantities[item.id]) !== (item.saleableRestockedQuantity ?? 0));
  const valid = changed.length > 0 && reason.trim().length > 0 && changed.every((item) => {
    const qty = Number(quantities[item.id]);
    return Number.isInteger(qty) && qty >= 0 && qty <= item.quantity;
  });

  return (
    <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">Correct saleable return stock</h2>
      <p className="mt-2 text-sm text-(--brand-text-muted)">Edit an accepted quantity after review. Stock changes only by the difference, with an audit trail.</p>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <label key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span>{item.lensLabel} · returned {item.quantity}</span>
            <Input
              type="number" min={0} max={item.quantity} step={1} aria-label={`Saleable quantity for ${item.lensLabel}`}
              className="w-24" value={quantities[item.id] ?? "0"}
              onChange={(event) => setQuantities((prev) => ({ ...prev, [item.id]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      <label className="mt-4 block space-y-1 text-sm">
        <span>Reason for correction</span>
        <Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
      </label>
      {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error.message}</p> : null}
      {message ? <p className="mt-2 text-sm text-emerald-700">{message}</p> : null}
      <Button className="mt-4" disabled={!valid || pending} onClick={() => void mutate({
        returnId: request.id, reason: reason.trim(),
        items: changed.map((item) => ({ itemId: item.id, saleableQuantity: Number(quantities[item.id]) })),
      })}>{pending ? "Saving…" : "Save stock correction"}</Button>
    </section>
  );
}
