/**
 * RW-09 hold/archive visibility rules.
 *
 * Hold: hidden from customer catalog / wholesale; admin can still list via status filter.
 * Archive: same as hold for shop paths; reversible soft-state (unarchive → ACTIVE).
 * Leaf rows use isDisabled so historical Order.lensId FKs still resolve.
 */

import type { CatalogProductStatus } from "@prisma/client";

export function isCatalogProductShopVisible(
  status: CatalogProductStatus | string | null | undefined
): boolean {
  return status === "ACTIVE";
}

export function shouldDisableLensLeaves(
  status: CatalogProductStatus | string | null | undefined
): boolean {
  return status === "HELD" || status === "ARCHIVED";
}

/** Prisma where fragment: exclude disabled leaves from customer-facing listings. */
export function activeLensWhere() {
  return { isDisabled: false } as const;
}
