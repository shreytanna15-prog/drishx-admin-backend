/**
 * Client-safe stock-check helpers (no Prisma).
 */

export const ACTIVE_STOCK_CHECK_STATUSES = ["OPEN", "SUBMITTED"] as const;

export function stripSystemQtyFromCheckLine<T extends Record<string, unknown>>(
  line: T
): Omit<T, "systemQtyAtStart" | "onHand" | "available" | "blockedQty" | "reservedQty" | "delta"> {
  const {
    systemQtyAtStart: _s,
    onHand: _o,
    available: _a,
    blockedQty: _b,
    reservedQty: _r,
    delta: _d,
    ...rest
  } = line;
  return rest;
}

export function effectiveCountedQty(line: {
  countedQty: number | null;
  verifiedCountedQty?: number | null;
}): number | null {
  if (line.verifiedCountedQty != null) return line.verifiedCountedQty;
  return line.countedQty;
}

/** True when employee may still edit counts. */
export function canEmployeeEditStockCheck(status: string): boolean {
  return status === "OPEN";
}

/** True when admin may verify (apply adjustments). */
export function canAdminVerifyStockCheck(status: string): boolean {
  return status === "SUBMITTED" || status === "OPEN";
}
