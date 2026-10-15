import type { CatalogLensFamily } from "./product-identity";
import type { SphCylRangeBounds } from "./range-math";

export type LegacyLensLeaf = {
  id: string;
  lensFamily: CatalogLensFamily;
  category: string | null;
  brand: string;
  item: string | null;
  index: number | null;
  coating: string;
  progressiveType: string | null;
  sph: number | null;
  sphStartRange: number | null;
  cyl: number | null;
  cylStartRange: number | null;
  crossPower: number | null;
  add: number | null;
  axis: number | null;
  eye: string | null;
  price: number;
  costPrice: number | null;
  quantity: number;
  isDisabled: boolean;
  identityKey: string;
  bounds: SphCylRangeBounds | null;
};

export type LegacyProductGroup = {
  identityKey: string;
  lensFamily: CatalogLensFamily;
  category: string | null;
  brand: string;
  item: string | null;
  index: number | null;
  coating: string;
  progressiveType: string | null;
  leafCount: number;
  leaves: LegacyLensLeaf[];
};
