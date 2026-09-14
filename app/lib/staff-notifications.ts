import { NotificationType } from "@prisma/client";

import { prisma } from "./prisma";

function formatShortOrderId(orderId: string): string {
  return orderId.slice(-8).toUpperCase();
}

function formatDueDateLabel(dueDate: Date): string {
  return dueDate.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Notify the assigned employee (if any) plus all active admins.
 * Falls back to all active staff when nobody is assigned yet.
 */
export async function notifyStaffOfNewOrder(
  orderId: string,
  customerLabel: string,
  assignedToId?: string | null
): Promise<void> {
  const recipientIds = new Set<string>();

  if (assignedToId) {
    recipientIds.add(assignedToId);
  }

  const admins = await prisma.user.findMany({
    where: {
      role: "ADMIN",
      isActive: true,
    },
    select: { id: true },
  });
  for (const admin of admins) {
    recipientIds.add(admin.id);
  }

  if (recipientIds.size === 0) {
    const staffUsers = await prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "EMPLOYEE"] },
        isActive: true,
      },
      select: { id: true },
    });
    for (const staff of staffUsers) {
      recipientIds.add(staff.id);
    }
  }

  if (recipientIds.size === 0) {
    return;
  }

  const shortId = formatShortOrderId(orderId);
  await prisma.notification.createMany({
    data: [...recipientIds].map((userId) => ({
      userId,
      orderId,
      type: NotificationType.ORDER_PLACED,
      title: "New order received",
      message: `${customerLabel} placed order #${shortId}.`,
    })),
  });
}

export async function notifyEmployeeOfTaskAssigned(
  taskId: string,
  assignedToId: string,
  title: string,
  dueDate: Date
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: assignedToId,
      taskId,
      type: NotificationType.TASK_ASSIGNED,
      title: "New task assigned",
      message: `${title}. Due ${formatDueDateLabel(dueDate)}.`,
    },
  });
}

/**
 * Notify all active admins when a return request is submitted by a customer.
 * Admin-created on-behalf requests skip this (admin is already in the UI).
 */
export async function notifyAdminsOfReturnSubmitted(
  returnRequestId: string,
  requestNumber: string,
  customerLabel: string,
  orderId?: string | null
): Promise<void> {
  void returnRequestId;
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (admins.length === 0) return;

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      orderId: orderId ?? null,
      type: NotificationType.RETURN_REQUEST_SUBMITTED,
      title: "New return request",
      message: `${customerLabel} submitted ${requestNumber}. Awaiting admin review.`,
    })),
  });
}

export async function notifyCustomerOfReturnSubmittedOnBehalf(
  customerId: string,
  requestNumber: string,
  orderId?: string | null
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: customerId,
      orderId: orderId ?? null,
      type: NotificationType.RETURN_REQUEST_SUBMITTED,
      title: "Return request submitted for you",
      message: `${requestNumber} was created on your behalf and is under admin review.`,
    },
  });
}

/** @deprecated Use notifyAdminsOfReturnSubmitted — kept as alias for any callers. */
export async function notifyEmployeeOfReturnSubmitted(
  returnRequestId: string,
  requestNumber: string,
  _assignedEmployeeId: string | null,
  customerLabel: string,
  orderId?: string | null
): Promise<void> {
  return notifyAdminsOfReturnSubmitted(
    returnRequestId,
    requestNumber,
    customerLabel,
    orderId
  );
}

export async function notifyEmployeeOfReturnAssigned(
  assignedEmployeeId: string,
  requestNumber: string,
  remarks?: string | null,
  orderId?: string | null
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: assignedEmployeeId,
      orderId: orderId ?? null,
      type: NotificationType.RETURN_REQUEST_UPDATED,
      title: "Return request assigned",
      message: remarks?.trim()
        ? `${requestNumber} was assigned to you. ${remarks.trim()}`
        : `${requestNumber} was assigned to you for processing.`,
    },
  });
}

export async function notifyCustomerOfReturnUpdate(
  customerId: string,
  requestNumber: string,
  status: string,
  remarks?: string | null,
  orderId?: string | null
): Promise<void> {
  const statusLabel = status.toLowerCase().replace(/_/g, " ");
  await prisma.notification.create({
    data: {
      userId: customerId,
      orderId: orderId ?? null,
      type: NotificationType.RETURN_REQUEST_UPDATED,
      title: "Return request updated",
      message: remarks?.trim()
        ? `${requestNumber} is now ${statusLabel}. ${remarks.trim()}`
        : `${requestNumber} is now ${statusLabel}.`,
    },
  });
}

export async function notifyAdminsOfReturnEscalated(
  requestNumber: string,
  remarks?: string | null,
  orderId?: string | null
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (admins.length === 0) return;

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      orderId: orderId ?? null,
      type: NotificationType.RETURN_REQUEST_UPDATED,
      title: "Return escalated",
      message: remarks?.trim()
        ? `${requestNumber} needs admin review. ${remarks.trim()}`
        : `${requestNumber} needs admin review.`,
    })),
  });
}

export async function notifyCustomerOfReturnDecision(
  customerId: string,
  requestNumber: string,
  status: string,
  remarks?: string | null,
  orderId?: string | null
): Promise<void> {
  const statusLabel = status.toLowerCase().replace(/_/g, " ");
  await prisma.notification.create({
    data: {
      userId: customerId,
      orderId: orderId ?? null,
      type: NotificationType.RETURN_REQUEST_DECIDED,
      title: "Return decision",
      message: remarks?.trim()
        ? `${requestNumber}: ${statusLabel}. ${remarks.trim()}`
        : `${requestNumber}: ${statusLabel}.`,
    },
  });
}
