/**
 * Courier dispatch field validation + dispatch-readiness gate.
 * Shared by the dedicated dispatch API and the legacy PUT route so both
 * enforce the same rules (min length, allowed characters, no obvious junk,
 * and delivery/weight/pick readiness before PACKED → DISPATCHED).
 */

export const COURIER_NAME_MAX_LENGTH = 120;
export const TRACKING_NUMBER_MAX_LENGTH = 200;
export const TRACKING_NUMBER_MIN_LENGTH = 4;

export type DispatchReadinessOrder = {
  quantity: number;
  reservedQuantity: number;
  pickedQuantity: number;
  deliveryServiceId: string | null;
};

export type DispatchReadinessDelivery = {
  deliveryServiceId: string | null;
  actualWeight: number | string | null;
} | null;

export type DispatchReadinessOverlay = {
  /** Explicit next service id; `null` clears; omit to keep current. */
  deliveryServiceId?: string | null;
  /** Explicit next packed weight; omit to use OrderDelivery. */
  actualWeight?: number | null;
  /** Explicit next picked qty; omit to use order.pickedQuantity. */
  pickedQuantity?: number | null;
};

type ReadyOk = { ok: true };
type ReadyErr = { ok: false; error: string };

/**
 * Server-side gate before handing a packed order to a courier.
 * Does **not** require picked === ordered (partial fulfillment / reserved < qty OK).
 * Requires: delivery service, positive packed weight, and at least one picked unit.
 */
export function assertDispatchReadiness(input: {
  order: DispatchReadinessOrder;
  delivery: DispatchReadinessDelivery;
  next?: DispatchReadinessOverlay;
}): ReadyOk | ReadyErr {
  const currentServiceId =
    input.order.deliveryServiceId?.trim() ||
    input.delivery?.deliveryServiceId?.trim() ||
    null;
  const serviceId =
    input.next && "deliveryServiceId" in input.next
      ? input.next.deliveryServiceId?.trim() || null
      : currentServiceId;

  if (!serviceId) {
    return {
      ok: false,
      error: "Choose a delivery service before dispatching.",
    };
  }

  const existingWeightRaw = input.delivery?.actualWeight;
  const existingWeight =
    existingWeightRaw === null || existingWeightRaw === undefined
      ? null
      : Number(existingWeightRaw);
  const weight =
    input.next && "actualWeight" in input.next
      ? input.next.actualWeight
      : existingWeight;

  if (weight == null || !Number.isFinite(weight) || weight <= 0) {
    return {
      ok: false,
      error: "Enter the packed weight (kg) before dispatching.",
    };
  }

  const picked =
    input.next && "pickedQuantity" in input.next && input.next.pickedQuantity != null
      ? input.next.pickedQuantity
      : input.order.pickedQuantity;

  if (!Number.isFinite(picked) || picked < 1) {
    return {
      ok: false,
      error: "Record picked quantity before dispatching.",
    };
  }

  const orderedQty = Math.max(0, Math.floor(Number(input.order.quantity) || 0));
  if (picked > orderedQty) {
    return {
      ok: false,
      error: "Picked quantity cannot exceed ordered quantity.",
    };
  }

  return { ok: true };
}

const TRACKING_ALLOWED = /^[A-Za-z0-9\-_/.:]+$/;
/** Reject placeholder / placeholder-looking strings. */
const JUNK_TRACKING =
  /^(?:tracking|track|awb|number|abc|test|asdf|asdasd|n\/a|n\.a\.|na|none|nil|null|tbd|todo|pending|unknown|undefined)$/i;
/** Reject 4+ of the same character, e.g. "xxxx", "nnnn". */
const REPEATED_CHAR = /^(.)\1{3,}$/;

export function validateCourierName(
  value: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "Courier name is required to dispatch." };
  }
  const trimmed = value.trim();
  if (trimmed.length > COURIER_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Courier name must be ${COURIER_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, value: trimmed };
}

export function validateTrackingNumber(
  value: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "Tracking number is required to dispatch." };
  }
  const trimmed = value.trim();
  if (trimmed.length < TRACKING_NUMBER_MIN_LENGTH) {
    return {
      ok: false,
      error: `Tracking number must be at least ${TRACKING_NUMBER_MIN_LENGTH} characters.`,
    };
  }
  if (trimmed.length > TRACKING_NUMBER_MAX_LENGTH) {
    return {
      ok: false,
      error: `Tracking number must be ${TRACKING_NUMBER_MAX_LENGTH} characters or fewer.`,
    };
  }
  if (!TRACKING_ALLOWED.test(trimmed)) {
    return {
      ok: false,
      error: "Tracking number can only contain letters, numbers, and - _ / . :",
    };
  }
  if (JUNK_TRACKING.test(trimmed) || REPEATED_CHAR.test(trimmed)) {
    return {
      ok: false,
      error: "Tracking number looks like a placeholder. Enter the real AWB number.",
    };
  }
  return { ok: true, value: trimmed };
}