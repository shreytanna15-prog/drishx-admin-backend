/**
 * Shared employee order access gate for RX/photo warehouse hold (RW-05).
 */

import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { employeeMayAccessOrder } from "./prescription-order-hold";

export async function loadOrderForEmployeeAccess(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      assignedToId: true,
      warehouseHold: true,
      warehouseReleasedAt: true,
    },
  });
}

/**
 * ADMIN: always allowed (caller still may apply other checks).
 * EMPLOYEE: must be assigned AND released from warehouse hold.
 * CUSTOMER: not allowed via this helper (caller handles ownership).
 */
export function employeeOrderAccessForbidden(
  order: {
    assignedToId?: string | null;
    warehouseHold?: boolean | null;
    warehouseReleasedAt?: Date | string | null;
  },
  session: { role: string; userId: string }
): NextResponse | null {
  if (session.role !== "EMPLOYEE") return null;
  if (
    employeeMayAccessOrder(
      {
        assignedToId: order.assignedToId,
        warehouseHold: order.warehouseHold,
        warehouseReleasedAt: order.warehouseReleasedAt,
      },
      session.userId
    )
  ) {
    return null;
  }
  return NextResponse.json(
    {
      error:
        "Forbidden. This order is not assigned to you or is still held for admin release.",
      code: "FORBIDDEN",
    },
    { status: 403 }
  );
}
