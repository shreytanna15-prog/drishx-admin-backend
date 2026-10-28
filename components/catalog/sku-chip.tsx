import { cn } from "@/lib/utils";

/** Compact SKU label — brand-tinted chip with room for full glyphs. */
export function SkuChip({
  sku,
  className,
}: {
  sku: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 max-w-full items-center rounded-md bg-(--brand-primary)/15 px-2.5 text-xs leading-none text-(--brand-primary)",
        className
      )}
      title={sku}
    >
      {sku}
    </span>
  );
}
