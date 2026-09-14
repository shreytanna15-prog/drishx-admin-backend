import { resolveKryptokWholesaleItem } from "./kryptok-wholesale-catalog";

export const KRYPTOK_CROSS_ITEM = "CROSS";

type KryptokLensRow = {
  category: string | null;
  brand: string | null;
  coating: string | null;
  item?: string | null;
  sph: unknown;
  sphStartRange?: unknown | null;
  cyl: unknown | null;
  cylStartRange?: unknown | null;
  crossPower?: unknown | null;
  axis: number | null;
  add: unknown;
  costPrice: unknown | null;
  price: unknown;
  quantity: number;
  createdAt: Date;
  id: string;
};

export function resolveKryptokCrossPower(
  lens: Pick<KryptokLensRow, "crossPower" | "cyl">
): number | null {
  if (lens.crossPower !== null && lens.crossPower !== undefined && lens.crossPower !== "") {
    const value = Number(lens.crossPower);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

export function resolveKryptokApiItem(lens: Pick<KryptokLensRow, "item" | "category" | "coating">): string | null {
  const storedItem = lens.item?.trim();
  if (storedItem) {
    return storedItem;
  }
  return resolveKryptokWholesaleItem(lens.category, lens.coating, storedItem) ?? lens.category;
}

export function mapKryptokLensFields(lens: KryptokLensRow) {
  return {
    id: lens.id,
    costPrice: lens.costPrice !== null && lens.costPrice !== undefined ? Number(lens.costPrice) : null,
    price: Number(lens.price),
    sph: Number(lens.sph),
    sphStartRange:
      lens.sphStartRange !== null && lens.sphStartRange !== undefined
        ? Number(lens.sphStartRange)
        : null,
    cyl: lens.cyl !== null && lens.cyl !== undefined ? Number(lens.cyl) : null,
    cylStartRange:
      lens.cylStartRange !== null && lens.cylStartRange !== undefined
        ? Number(lens.cylStartRange)
        : null,
    crossPower: resolveKryptokCrossPower(lens),
    axis: lens.axis,
    add: Number(lens.add),
    eye: null as string | null,
    quantity: lens.quantity,
    createdAt: lens.createdAt,
    brand: lens.brand,
    item: resolveKryptokApiItem(lens),
    coating: lens.coating,
    category: lens.category,
  };
}
