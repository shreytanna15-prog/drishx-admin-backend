/** Sheet values are cost; selling price is 20% above cost. */
export const SELLING_PRICE_MARKUP = 1.2;

export function sellingPriceFromCost(costPrice: string | number): string {
  const cost = Number(costPrice);
  return String(Math.round(cost * SELLING_PRICE_MARKUP));
}

export function withSellingPrice(costPrice: string): {
  costPrice: string;
  price: string;
} {
  return {
    costPrice,
    price: sellingPriceFromCost(costPrice),
  };
}
