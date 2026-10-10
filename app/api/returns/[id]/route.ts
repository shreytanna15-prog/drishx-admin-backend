import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";

import {
  appendReturnTimelineEvent,
  getReturnRequestWithRelations,
  ReturnRequestStatus,
  serializeReturnItemPowers,
  type ReturnRequestStatus as ReturnRequestStatusType,
} from "../../../lib/returns";
import { prisma } from "../../../lib/prisma";
import {
  notifyCustomerOfReturnUpdate,
  notifyEmployeeOfReturnAssigned,
} from "../../../lib/staff-notifications";
import { getSignedOrderImageUrl } from "../../../lib/supabase-storage";

const REASSIGNABLE_STATUSES = new Set<string>([
  ReturnRequestStatus.APPROVED_CREDIT,
  ReturnRequestStatus.AWAITING_MATERIAL,
  ReturnRequestStatus.APPROVED_REPLACEMENT,
  ReturnRequestStatus.MORE_INFO_REQUIRED,
]);

async function serializeReturnRequest(id: string) {
  const request = await getReturnRequestWithRelations(id);
  if (!request) return null;
  const images = await Promise.all(
    request.images.map(async (image) => ({
      ...image,
      imageUrl: await getSignedOrderImageUrl(image.imageUrl),
    }))
  );

  return {
    ...request,
    approvedAmount: request.approvedAmount !== null ? Number(request.approvedAmount) : null,
    primaryInvoice: request.primaryInvoice
      ? {
          ...request.primaryInvoice,
          amount: Number(request.primaryInvoice.amount),
        }
      : null,
    creditNote: request.creditNote
      ? {
          ...request.creditNote,
          amount: Number(request.creditNote.amount),
        }
      : null,
    items: request.items.map((item) => serializeReturnItemPowers(item)),
    images,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;

  const { id } = await params;
  const request = await getReturnRequestWithRelations(id);
  if (!request) return NextResponse.json({ error: "Return request not found." }, { status: 404 });

  if (session.role === "CUSTOMER" && request.customerId !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (session.role === "EMPLOYEE" && request.assignedEmployeeId !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json(await serializeReturnRequest(id));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role !== "EMPLOYEE" && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const action = typeof body?.action === "string" ? body.action.trim().toLowerCase() : "";
  const remarks = typeof body?.remarks === "string" ? body.remarks.trim() : "";

  const existing = await getReturnRequestWithRelations(id);
  if (!existing) {
    return NextResponse.json({ error: "Return request not found." }, { status: 404 });
  }
  if (session.role === "EMPLOYEE" && existing.assignedEmployeeId !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Admin reassign after approval
  if (action === "assign") {
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can assign employees." }, { status: 403 });
    }
    if (!REASSIGNABLE_STATUSES.has(existing.status)) {
      return NextResponse.json(
        {
          error:
            "Employee can only be assigned after approval (credit or replacement).",
        },
        { status: 400 }
      );
    }

    const assignedEmployeeId =
      typeof body?.assignedEmployeeId === "string" ? body.assignedEmployeeId.trim() : "";
    if (!assignedEmployeeId) {
      return NextResponse.json({ error: "assignedEmployeeId is required." }, { status: 400 });
    }

    const employee = await prisma.user.findFirst({
      where: { id: assignedEmployeeId, role: "EMPLOYEE", isActive: true },
      select: { id: true, name: true, email: true },
    });
    if (!employee) {
      return NextResponse.json(
        { error: "Active employee not found for assignment." },
        { status: 400 }
      );
    }

    const employeeLabel = employee.name || employee.email;
    const assignMessage =
      remarks || `Assigned to ${employeeLabel} for processing.`;

    await prisma.$transaction(async (tx) => {
      await tx.returnRequest.update({
        where: { id },
        data: { assignedEmployeeId: employee.id },
      });
      // Reuse ESCALATED event type for assignment trail (no new enum); message is displayed.
      await appendReturnTimelineEvent(tx, {
        returnRequestId: id,
        actorUserId: session.userId,
        eventType: "ESCALATED",
        message: assignMessage,
      });
    });

    await notifyEmployeeOfReturnAssigned(
      employee.id,
      existing.requestNumber,
      remarks || null,
      existing.primaryOrderId
    );

    return NextResponse.json(await serializeReturnRequest(id));
  }

  let nextStatus: ReturnRequestStatusType | null = null;
  let eventType: "MORE_INFO_REQUIRED" | "ESCALATED" | "REJECTED" | "CLOSED" | null = null;
  let employeeRemarks: string | null = null;
  let rejectionReason: string | null = null;

  if (action === "more-info") {
    nextStatus = ReturnRequestStatus.MORE_INFO_REQUIRED;
    eventType = "MORE_INFO_REQUIRED";
    employeeRemarks = remarks || null;
  } else if (action === "escalate") {
    // Escalation is no longer part of the main path (admin-first).
    if (session.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Employees cannot escalate. Returns are reviewed by admin first." },
        { status: 403 }
      );
    }
    nextStatus = ReturnRequestStatus.ESCALATED_TO_ADMIN;
    eventType = "ESCALATED";
    employeeRemarks = remarks || null;
  } else if (action === "reject") {
    if (session.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admins can reject return requests." },
        { status: 403 }
      );
    }
    if (!remarks) {
      return NextResponse.json({ error: "Remarks are required to reject." }, { status: 400 });
    }
    nextStatus = ReturnRequestStatus.REJECTED;
    eventType = "REJECTED";
    rejectionReason = remarks;
    employeeRemarks = remarks;
  } else if (action === "close" && session.role === "ADMIN") {
    nextStatus = ReturnRequestStatus.CLOSED;
    eventType = "CLOSED";
  } else {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.returnRequest.update({
      where: { id },
      data: {
        status: nextStatus!,
        ...(employeeRemarks !== null ? { employeeRemarks } : {}),
        ...(rejectionReason !== null ? { rejectionReason } : {}),
      },
    });
    await appendReturnTimelineEvent(tx, {
      returnRequestId: id,
      actorUserId: session.userId,
      eventType: eventType!,
      message: remarks || `Return request marked ${nextStatus!.toLowerCase()}.`,
    });
  });

  if (action === "more-info" || action === "reject") {
    await notifyCustomerOfReturnUpdate(
      existing.customerId,
      existing.requestNumber,
      nextStatus!,
      remarks || null,
      existing.primaryOrderId
    );
  }

  return NextResponse.json(await serializeReturnRequest(id));
}
