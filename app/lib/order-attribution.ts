import { OrderSource } from "@prisma/client";

export type OrderAttributionSession = {
  role: string;
  userId: string;
};

export type OrderAttributionFields = {
  orderSource: OrderSource;
  placedByUserId: string | null;
};

export type OrderAttributionDisplay = {
  orderSource?: OrderSource | null;
  placedByUserId?: string | null;
  placedBy?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
};

/**
 * Resolve attribution from the authenticated session only.
 * Never trust client-supplied placedByUserId / orderSource.
 *
 * - Customer self-checkout → CUSTOMER_APP, placer null
 * - Admin placing for another user → ADMIN_PANEL + session user
 * - Employee placing for another user → EMPLOYEE_ON_BEHALF + session user
 */
export function resolveOrderAttribution(input: {
  session: OrderAttributionSession;
  customerUserId: string;
}): OrderAttributionFields {
  const customerId = input.customerUserId.trim();
  const actorId = input.session.userId.trim();

  if (input.session.role === "CUSTOMER" || customerId === actorId) {
    return {
      orderSource: OrderSource.CUSTOMER_APP,
      placedByUserId: null,
    };
  }

  if (input.session.role === "ADMIN") {
    return {
      orderSource: OrderSource.ADMIN_PANEL,
      placedByUserId: actorId,
    };
  }

  if (input.session.role === "EMPLOYEE") {
    return {
      orderSource: OrderSource.EMPLOYEE_ON_BEHALF,
      placedByUserId: actorId,
    };
  }

  return {
    orderSource: OrderSource.CUSTOMER_APP,
    placedByUserId: null,
  };
}

/** Strip spoofable attribution keys from untrusted request bodies. */
export function stripClientOrderAttribution<T extends Record<string, unknown>>(
  body: T
): Omit<T, "placedByUserId" | "orderSource" | "placedBy"> {
  const {
    placedByUserId: _placedByUserId,
    orderSource: _orderSource,
    placedBy: _placedBy,
    ...rest
  } = body;
  return rest;
}

export function isAdminPanelOrder(
  order: Pick<OrderAttributionDisplay, "orderSource">
): boolean {
  return order.orderSource === OrderSource.ADMIN_PANEL;
}

export function isEmployeeOnBehalfOrder(
  order: Pick<OrderAttributionDisplay, "orderSource">
): boolean {
  return order.orderSource === OrderSource.EMPLOYEE_ON_BEHALF;
}

/** True only when we have an explicit source — legacy null is unknown. */
export function hasKnownOrderSource(
  order: Pick<OrderAttributionDisplay, "orderSource">
): boolean {
  return (
    order.orderSource === OrderSource.CUSTOMER_APP ||
    order.orderSource === OrderSource.EMPLOYEE_ON_BEHALF ||
    order.orderSource === OrderSource.ADMIN_PANEL
  );
}

export function placedByDisplayName(
  order: Pick<OrderAttributionDisplay, "placedBy" | "placedByUserId">
): string | null {
  const name = order.placedBy?.name?.trim();
  if (name) return name;
  const email = order.placedBy?.email?.trim();
  if (email) return email;
  return null;
}

/** Admin list/detail badge copy. Null when not admin-panel or legacy unknown. */
export function formatPlacedByAdminBadge(
  order: OrderAttributionDisplay
): string | null {
  if (!isAdminPanelOrder(order)) return null;
  const who = placedByDisplayName(order);
  return who ? `Placed by admin · ${who}` : "Placed by admin";
}

export function buildOnBehalfActivityMessage(input: {
  orderNumber: number | null | undefined;
  orderId: string;
  customerLabel: string;
  sessionRole: string;
  actorLabel?: string | null;
}): string {
  const ref = input.orderNumber ?? input.orderId.slice(-6);
  if (input.sessionRole === "ADMIN") {
    const actor = input.actorLabel?.trim() || "admin";
    return `Order #${ref} created on behalf of ${input.customerLabel} by admin ${actor}`;
  }
  if (input.sessionRole === "EMPLOYEE") {
    const actor = input.actorLabel?.trim() || "staff";
    return `Order #${ref} created on behalf of ${input.customerLabel} by ${actor}`;
  }
  return `Order #${ref} created`;
}

/** Prisma include fragment for admin list/detail. */
export const orderPlacedByInclude = {
  placedBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
} as const;
