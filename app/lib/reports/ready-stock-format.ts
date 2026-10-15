/**
 * Ready Stock Orders — pure eligibility rules.
 *
 * Working definition (developer-approved):
 * A ready-stock order is a non-custom catalog order whose required items are
 * fully reserved/allocated and which is in a fulfillment status that can
 * proceed toward dispatch — not merely “warehouse has aggregate stock”.
 */

import {
  isPhotoPrescriptionOrder,
  isRxOrderNotes,
  isWarehouseHoldActive,
} from "@/app/lib/prescription-order-hold";

export const READY_STOCK_STATUSES = [
  "PENDING",
  "PICKING",
  "PACKED",
] as const;

export type ReadyStockStatus = (typeof READY_STOCK_STATUSES)[number];

export type ReadyStockExclusionReason =
  | "RX_ORDER"
  | "PHOTO_PRESCRIPTION"
  | "CANCELLED"
  | "COMPLETED"
  | "DISPATCHED"
  | "PARTIALLY_FULFILLED"
  | "AWAITING_PROCUREMENT"
  | "WAREHOUSE_HOLD"
  | "NOT_FULFILLMENT_STATUS"
  | "NOT_FULLY_RESERVED"
  | "WHOLESALE_NEEDS_PROCUREMENT"
  | "WHOLESALE_LINES_MISSING"
  | "ZERO_QUANTITY";

export type ReadyStockDispatchState =
  | "DISPATCH_ELIGIBLE"
  | "ALLOCATED_NOT_PACKED";

export type ReadyStockWholesaleLine = {
  quantity: number;
  reservedQuantity: number;
  needsProcurement: boolean;
};

export type ReadyStockOrderInput = {
  id: string;
  orderNumber: number | null;
  status: string;
  lineType: string;
  quantity: number;
  reservedQuantity: number;
  notes: string | null;
  orderImageUrl: string | null;
  warehouseHold: boolean;
  warehouseReleasedAt: Date | string | null;
  totalAmount: number;
  createdAt: Date;
  customer: string;
  wholesaleLines: ReadyStockWholesaleLine[] | null;
};

export type ReadyStockAssessment = {
  ready: boolean;
  reason: ReadyStockExclusionReason | "OK";
  dispatchState: ReadyStockDispatchState | null;
  allocationStatus: "FULLY_RESERVED" | "PARTIAL_OR_NONE" | "UNKNOWN";
};

function isReadyStatus(status: string): status is ReadyStockStatus {
  return (READY_STOCK_STATUSES as readonly string[]).includes(status);
}

export function isRetailFullyReserved(
  quantity: number,
  reservedQuantity: number
): boolean {
  if (!(quantity > 0)) return false;
  return reservedQuantity + 1e-9 >= quantity;
}

export function assessWholesaleAllocation(
  lines: ReadyStockWholesaleLine[] | null
): {
  ok: boolean;
  reason: ReadyStockExclusionReason | "OK";
} {
  if (lines == null) {
    return { ok: false, reason: "WHOLESALE_LINES_MISSING" };
  }
  if (lines.length === 0) {
    return { ok: false, reason: "WHOLESALE_LINES_MISSING" };
  }
  for (const line of lines) {
    if (!(line.quantity > 0)) {
      return { ok: false, reason: "ZERO_QUANTITY" };
    }
    if (line.needsProcurement) {
      return { ok: false, reason: "WHOLESALE_NEEDS_PROCUREMENT" };
    }
    if (!isRetailFullyReserved(line.quantity, line.reservedQuantity)) {
      return { ok: false, reason: "NOT_FULLY_RESERVED" };
    }
  }
  return { ok: true, reason: "OK" };
}

/**
 * Classify a single order. Does not look at aggregate warehouse stock —
 * only per-order reservation / wholesale line allocation.
 */
export function assessReadyStockOrder(
  order: ReadyStockOrderInput
): ReadyStockAssessment {
  if (isRxOrderNotes(order.notes)) {
    return {
      ready: false,
      reason: "RX_ORDER",
      dispatchState: null,
      allocationStatus: "UNKNOWN",
    };
  }
  if (isPhotoPrescriptionOrder(order)) {
    return {
      ready: false,
      reason: "PHOTO_PRESCRIPTION",
      dispatchState: null,
      allocationStatus: "UNKNOWN",
    };
  }

  switch (order.status) {
    case "CANCELLED":
      return {
        ready: false,
        reason: "CANCELLED",
        dispatchState: null,
        allocationStatus: "UNKNOWN",
      };
    case "COMPLETED":
      return {
        ready: false,
        reason: "COMPLETED",
        dispatchState: null,
        allocationStatus: "UNKNOWN",
      };
    case "DISPATCHED":
      return {
        ready: false,
        reason: "DISPATCHED",
        dispatchState: null,
        allocationStatus: "UNKNOWN",
      };
    case "PARTIALLY_FULFILLED":
      return {
        ready: false,
        reason: "PARTIALLY_FULFILLED",
        dispatchState: null,
        allocationStatus: "PARTIAL_OR_NONE",
      };
    case "AWAITING_PROCUREMENT":
      return {
        ready: false,
        reason: "AWAITING_PROCUREMENT",
        dispatchState: null,
        allocationStatus: "PARTIAL_OR_NONE",
      };
    default:
      break;
  }

  if (
    isWarehouseHoldActive({
      warehouseHold: order.warehouseHold,
      warehouseReleasedAt: order.warehouseReleasedAt,
    })
  ) {
    return {
      ready: false,
      reason: "WAREHOUSE_HOLD",
      dispatchState: null,
      allocationStatus: "UNKNOWN",
    };
  }

  if (!isReadyStatus(order.status)) {
    return {
      ready: false,
      reason: "NOT_FULFILLMENT_STATUS",
      dispatchState: null,
      allocationStatus: "UNKNOWN",
    };
  }

  let allocationOk = false;
  let allocationReason: ReadyStockExclusionReason | "OK" = "OK";
  let allocationStatus: ReadyStockAssessment["allocationStatus"] =
    "PARTIAL_OR_NONE";

  if (order.lineType === "WHOLESALE") {
    const w = assessWholesaleAllocation(order.wholesaleLines);
    allocationOk = w.ok;
    allocationReason = w.reason;
    allocationStatus = w.ok ? "FULLY_RESERVED" : "PARTIAL_OR_NONE";
    if (w.reason === "WHOLESALE_LINES_MISSING") {
      allocationStatus = "UNKNOWN";
    }
  } else {
    if (!(order.quantity > 0)) {
      return {
        ready: false,
        reason: "ZERO_QUANTITY",
        dispatchState: null,
        allocationStatus: "PARTIAL_OR_NONE",
      };
    }
    allocationOk = isRetailFullyReserved(
      order.quantity,
      order.reservedQuantity
    );
    allocationReason = allocationOk ? "OK" : "NOT_FULLY_RESERVED";
    allocationStatus = allocationOk ? "FULLY_RESERVED" : "PARTIAL_OR_NONE";
  }

  if (!allocationOk) {
    return {
      ready: false,
      reason: allocationReason === "OK" ? "NOT_FULLY_RESERVED" : allocationReason,
      dispatchState: null,
      allocationStatus,
    };
  }

  const dispatchState: ReadyStockDispatchState =
    order.status === "PACKED" ? "DISPATCH_ELIGIBLE" : "ALLOCATED_NOT_PACKED";

  return {
    ready: true,
    reason: "OK",
    dispatchState,
    allocationStatus: "FULLY_RESERVED",
  };
}

export function selectReadyStockOrders(
  orders: ReadyStockOrderInput[]
): Array<
  ReadyStockOrderInput & {
    assessment: ReadyStockAssessment;
  }
> {
  const out: Array<ReadyStockOrderInput & { assessment: ReadyStockAssessment }> =
    [];
  for (const order of orders) {
    const assessment = assessReadyStockOrder(order);
    if (!assessment.ready) continue;
    out.push({ ...order, assessment });
  }
  return out.toSorted(
    (a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() ||
      a.id.localeCompare(b.id)
  );
}

export const READY_STOCK_COLUMNS = [
  { key: "orderNumber", label: "Order" },
  { key: "customer", label: "Customer" },
  { key: "status", label: "Status" },
  { key: "lineType", label: "Line" },
  { key: "quantity", label: "Qty", align: "right" as const },
  { key: "reservedQuantity", label: "Reserved", align: "right" as const },
  { key: "allocationStatus", label: "Allocation" },
  { key: "dispatchState", label: "Dispatch readiness" },
  { key: "totalAmount", label: "Amount", align: "right" as const },
  { key: "createdAt", label: "Placed" },
];

export function formatDispatchStateLabel(
  state: ReadyStockDispatchState | null
): string {
  if (state === "DISPATCH_ELIGIBLE") {
    return "Dispatch-eligible (packed)";
  }
  if (state === "ALLOCATED_NOT_PACKED") {
    return "Fully allocated — not yet packed";
  }
  return "—";
}
