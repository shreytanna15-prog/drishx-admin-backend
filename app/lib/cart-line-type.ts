/**
 * Application enum for cart line type.
 * Values must match `enum CartLineType` in prisma/schema.prisma.
 */
export const CartLineType = {
  RETAIL: "RETAIL",
  WHOLESALE: "WHOLESALE",
} as const;

export type CartLineType = (typeof CartLineType)[keyof typeof CartLineType];