import { cn } from "@/lib/utils";

/** Square, tightly cropped mark for UI chrome (sidebar, auth, headers). */
export const BRAND_MARK_SRC = "/logo-mark.png";

type BrandMarkSize = "sm" | "md" | "lg";

const MARK_PX: Record<BrandMarkSize, number> = {
  sm: 40,
  md: 44,
  lg: 72,
};

type BrandMarkProps = {
  size?: BrandMarkSize;
  className?: string;
};

export function BrandMark({ size = "md", className }: BrandMarkProps) {
  const px = MARK_PX[size];

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BRAND_MARK_SRC}
      alt=""
      width={px}
      height={px}
      aria-hidden
      draggable={false}
      decoding="async"
      className={cn(
        "brand-logo-mark",
        size === "sm" && "brand-logo-mark--sm",
        size === "lg" && "brand-logo-mark--lg",
        className
      )}
    />
  );
}

type BrandLogoProps = {
  size?: "sm" | "md";
  href?: string;
};

export function BrandLogo({ size = "md", href }: BrandLogoProps) {
  const content = (
    <>
      <BrandMark size={size} />
      <span>Drishx</span>
    </>
  );

  if (href) {
    return (
      <a href={href} className="brand-logo">
        {content}
      </a>
    );
  }

  return <div className="brand-logo">{content}</div>;
}
