/**
 * RW-05 / RC-02 — RX prescription orders stay admin-only until warehouse release.
 *
 * warehouseHold=true on create for RX. Assignment alone never exposes
 * the order to employees. Staff see it only when assigned AND released.
 */

import type { Prisma } from "@prisma/client";
import { RX_ORDER_NOTES_MARKER } from "./reports/rx-marker";

export const COLOR_LENS_NOTES_MARKER = "[Color Lens]";

export type HoldOrderFields = {
  notes?: string | null;
  orderImageUrl?: string | null;
  warehouseHold?: boolean | null;
  warehouseReleasedAt?: Date | string | null;
  assignedToId?: string | null;
};

export function isRxOrderNotes(notes: string | null | undefined): boolean {
  return typeof notes === "string" && notes.includes(RX_ORDER_NOTES_MARKER);
}

export function isColorLensNotes(notes: string | null | undefined): boolean {
  return typeof notes === "string" && notes.includes(COLOR_LENS_NOTES_MARKER);
}

/**
 * RC-02: legacy photo prescription rows (not RX form, not color reference).
 * Photo orders are retired — this is for legacy classification only
 * (e.g. excluding old rows from ready-stock). It is NOT a hold candidate.
 */
export function isPhotoPrescriptionOrder(
  order: Pick<HoldOrderFields, "notes" | "orderImageUrl">
): boolean {
  if (!order.orderImageUrl) return false;
  if (isRxOrderNotes(order.notes)) return false;
  if (isColorLensNotes(order.notes)) return false;
  return true;
}

/** RC-02: RX form orders only (photo prescription is retired). */
export function isPrescriptionHoldCandidate(
  order: Pick<HoldOrderFields, "notes">
): boolean {
  return isRxOrderNotes(order.notes);
}

export function isWarehouseHoldActive(
  order: Pick<HoldOrderFields, "warehouseHold" | "warehouseReleasedAt">
): boolean {
  if (!order.warehouseHold) return false;
  return !order.warehouseReleasedAt;
}

/** Employee may list/open the order only when assigned and not on admin hold. */
export function employeeMayAccessOrder(
  order: HoldOrderFields,
  employeeUserId: string
): boolean {
  if (!order.assignedToId || order.assignedToId !== employeeUserId) {
    return false;
  }
  if (isWarehouseHoldActive(order)) return false;
  return true;
}

/**
 * Prisma filter for EMPLOYEE order lists: must be assigned to them, and either
 * not on warehouse hold or already released.
 */
export function employeeOrdersWhere(
  employeeUserId: string
): Prisma.OrderWhereInput {
  return {
    assignedToId: employeeUserId,
    OR: [
      { warehouseHold: false },
      { warehouseReleasedAt: { not: null } },
    ],
  };
}

export function warehouseReleaseCreateFields() {
  return {
    warehouseHold: true as const,
    warehouseReleasedAt: null,
    warehouseReleasedById: null,
  };
}

export type WarehouseEligibility = {
  eligible: boolean;
  reason:
    | "OK"
    | "NOT_HOLD_ORDER"
    | "ALREADY_RELEASED"
    | "STILL_HELD"
    | "UNASSIGNED";
};

export function assessWarehouseRelease(
  order: Pick<
    HoldOrderFields,
    "warehouseHold" | "warehouseReleasedAt" | "assignedToId"
  >
): WarehouseEligibility {
  if (!order.warehouseHold) {
    return { eligible: false, reason: "NOT_HOLD_ORDER" };
  }
  if (order.warehouseReleasedAt) {
    return { eligible: false, reason: "ALREADY_RELEASED" };
  }
  return { eligible: true, reason: "STILL_HELD" };
}

/** Notify staff only once the order is both assigned and released. */
export function shouldNotifyStaffOnEligibilityChange(input: {
  previouslyEligible: boolean;
  nowAssignedToId: string | null;
  warehouseHold: boolean;
  warehouseReleasedAt: Date | string | null;
}): { notify: boolean; assigneeId: string | null } {
  const nowEligible =
    Boolean(input.nowAssignedToId) &&
    (!input.warehouseHold || Boolean(input.warehouseReleasedAt));
  if (!nowEligible || input.previouslyEligible) {
    return { notify: false, assigneeId: null };
  }
  return { notify: true, assigneeId: input.nowAssignedToId };
}
