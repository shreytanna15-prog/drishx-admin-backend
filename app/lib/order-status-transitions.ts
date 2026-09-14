/** Shared staff status transitions — must stay aligned with employee/customer clients. */

export const ORDER_TRACKING_STATUSES = [
  "PENDING",
  "PICKING",
  "PACKED",
  "DISPATCHED",
  "PARTIALLY_FULFILLED",
  "AWAITING_PROCUREMENT",
  "COMPLETED",
  "CANCELLED",
] as const;

export type OrderTrackingStatus = (typeof ORDER_TRACKING_STATUSES)[number];

export function isOrderTrackingStatus(value: string): value is OrderTrackingStatus {
  return (ORDER_TRACKING_STATUSES as readonly string[]).includes(value);
}

/**
 * Allowed next statuses for ADMIN / EMPLOYEE from the current status.
 * Matches `getStaffStatusOptions` in the employee web/mobile apps.
 */
export function getStaffStatusOptions(
  current: OrderTrackingStatus
): OrderTrackingStatus[] {
  switch (current) {
    case "PENDING":
      return ["PICKING", "CANCELLED"];
    case "PICKING":
      return ["PACKED", "CANCELLED"];
    case "PACKED":
      return ["DISPATCHED", "CANCELLED"];
    case "DISPATCHED":
      return [
        "PARTIALLY_FULFILLED",
        "AWAITING_PROCUREMENT",
        "COMPLETED",
        "CANCELLED",
      ];
    case "PARTIALLY_FULFILLED":
      return ["AWAITING_PROCUREMENT", "COMPLETED", "CANCELLED"];
    case "AWAITING_PROCUREMENT":
      return ["PARTIALLY_FULFILLED", "PICKING", "PENDING", "COMPLETED", "CANCELLED"];
    case "COMPLETED":
    case "CANCELLED":
      return [];
    default:
      return [];
  }
}

export function canTransitionStatus(
  from: OrderTrackingStatus,
  to: OrderTrackingStatus,
  options?: { allowAdminForce?: boolean }
): boolean {
  if (from === to) return true;
  if (from === "CANCELLED") return false;
  if (options?.allowAdminForce && to === "CANCELLED" && from !== "COMPLETED") {
    return true;
  }
  return getStaffStatusOptions(from).includes(to);
}

export function formatOrderStatusLabel(status: OrderTrackingStatus): string {
  return status
    .toLowerCase()
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

/** Statuses that allow safe field edits (qty, rx, notes, pricing). */
export function isEditableOrderStatus(status: string): boolean {
  return status === "PENDING" || status === "AWAITING_PROCUREMENT";
}
