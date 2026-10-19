import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { Prisma } from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import { dispatchSlotForNow } from "../../../../lib/dispatch-cutoff";
import {
  appendReturnTimelineEvent,
  createCreditNoteForReturn,
  getReturnRequestWithRelations,
  incrementLensStock,
  parseReturnDecision,
  parseStockDisposition,
  ReturnRequestStatus,
} from "../../../../lib/returns";
import {
  aggregateQuantitiesByOrderId,
  computeMaxEligibleCredit,
  lockOrdersForReturnEligibility,
  loadPriorApprovedCreditsByOrderId,
  loadReservedReturnQuantitiesByOrderId,
  resolveApprovedCreditAmount,
  ReturnEligibilityError,
  validateRequestedReturnQuantities,
} from "../../../../lib/return-eligibility";
import {
  allocateReturnCreditAcrossInvoices,
  estimateReturnCreditByOrder,
} from "../../../../lib/return-credit";
import {
  notifyCustomerOfReturnDecision,
  notifyEmployeeOfReturnAssigned,
} from "../../../../lib/staff-notifications";
import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../../lib/audit";
import { createInvoiceFromOrder } from "../../../../lib/finance/create-invoice-from-order";
import { reverseLoyaltyForCreditAllocations } from "../../../../lib/loyalty/reverse";

const DECIDABLE_STATUSES = new Set<string>([
  ReturnRequestStatus.SUBMITTED,
  ReturnRequestStatus.MORE_INFO_REQUIRED,
  ReturnRequestStatus.ESCALATED_TO_ADMIN,
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const decision = parseReturnDecision(body?.decision);
  const stockDisposition = parseStockDisposition(body?.stockDisposition);
  const remarks = typeof body?.remarks === "string" ? body.remarks.trim() : "";
  /** Keep raw so missing/blank can auto-calc; never Number() into NaN early. */
  const approvedAmountRaw = body?.approvedAmount;
  const assignedEmployeeIdRaw =
    typeof body?.assignedEmployeeId === "string" ? body.assignedEmployeeId.trim() : "";

  if (!decision) {
    return NextResponse.json({ error: "Valid decision is required." }, { status: 400 });
  }
  if (decision !== "REJECT" && !stockDisposition) {
    return NextResponse.json({ error: "Stock disposition is required." }, { status: 400 });
  }

  const request = await prisma.returnRequest.findUnique({
    where: { id },
    include: {
      items: true,
      primaryOrder: true,
      primaryInvoice: true,
    },
  });
  if (!request) {
    return NextResponse.json({ error: "Return request not found." }, { status: 404 });
  }

  if (!DECIDABLE_STATUSES.has(request.status)) {
    return NextResponse.json(
      { error: "This return request has already been decided or closed." },
      { status: 400 }
    );
  }

  let assignedEmployeeId: string | null = null;
  let assignedEmployeeLabel: string | null = null;

  if (decision === "CREDIT" || decision === "REPLACEMENT") {
    if (!assignedEmployeeIdRaw) {
      return NextResponse.json(
        { error: "An employee must be assigned when approving a return." },
        { status: 400 }
      );
    }
    const employee = await prisma.user.findFirst({
      where: { id: assignedEmployeeIdRaw, role: "EMPLOYEE", isActive: true },
      select: { id: true, name: true, email: true },
    });
    if (!employee) {
      return NextResponse.json(
        { error: "Active employee not found for assignment." },
        { status: 400 }
      );
    }
    assignedEmployeeId = employee.id;
    assignedEmployeeLabel = employee.name || employee.email;
  }

  const cutoffSlot = await dispatchSlotForNow();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const live = await tx.returnRequest.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!live || !DECIDABLE_STATUSES.has(live.status)) {
        throw new ReturnEligibilityError(
          "This return request has already been decided or closed."
        );
      }

      if (decision === "REJECT") {
        if (!remarks) {
          throw new Error("Remarks are required to reject.");
        }
        await tx.returnRequest.update({
          where: { id },
          data: {
            status: ReturnRequestStatus.REJECTED,
            reviewedByAdminId: session.userId,
            decisionType: decision,
            rejectionReason: remarks,
            adminRemarks: remarks,
          },
        });
        await appendReturnTimelineEvent(tx, {
          returnRequestId: id,
          actorUserId: session.userId,
          eventType: "REJECTED",
          message: remarks,
        });
        return;
      }

      const orderIds = [
        ...new Set(live.items.map((i) => i.originalOrderId)),
      ];
      await lockOrdersForReturnEligibility(tx, orderIds);

      const orders = await tx.order.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          totalAmount: true,
        },
      });
      const orderedQtyByOrderId = new Map(
        orders.map((o) => [o.id, Number(o.quantity)])
      );
      const requestedByOrderId = aggregateQuantitiesByOrderId(
        live.items.map((i) => ({
          originalOrderId: i.originalOrderId,
          quantity: Number(i.quantity),
        }))
      );
      // Exclude this request: its items are pending and already counted in reserved.
      const reservedExcludingSelf = await loadReservedReturnQuantitiesByOrderId(
        tx,
        orderIds,
        id
      );
      const qtyCheck = validateRequestedReturnQuantities({
        requestedByOrderId,
        orderedQtyByOrderId,
        reservedQtyByOrderId: reservedExcludingSelf,
      });
      if (!qtyCheck.ok) {
        throw new ReturnEligibilityError(qtyCheck.error);
      }

      for (const item of live.items) {
        await tx.inventoryMovement.create({
          data: {
            returnRequestId: id,
            orderId: item.originalOrderId,
            lensType: item.lensType,
            lensId: item.lensId,
            quantity: item.quantity,
            disposition: stockDisposition!,
            notes: remarks || null,
          },
        });

        if (stockDisposition === "RETURN_TO_SALEABLE" && item.lensId) {
          await incrementLensStock(tx, item.lensType, item.lensId, Number(item.quantity));
        }
      }

      if (decision === "CREDIT") {
        const invoices = await tx.invoice.findMany({
          where: { orderId: { in: orderIds } },
          select: {
            id: true,
            orderId: true,
            amount: true,
            amountOutstanding: true,
            taxableAmount: true,
            cgstAmount: true,
            sgstAmount: true,
            igstAmount: true,
            lines: {
              select: {
                quantity: true,
                unitPrice: true,
                lineTotal: true,
              },
              orderBy: { lineNumber: "asc" },
            },
          },
        });
        const ordersById = new Map(
          orders.map((o) => [
            o.id,
            {
              id: o.id,
              quantity: Number(o.quantity),
              unitPrice: Number(o.unitPrice),
              totalAmount: Number(o.totalAmount),
            },
          ])
        );
        const invoicesByOrderId = new Map(
          invoices.map((inv) => [
            inv.orderId,
            {
              id: inv.id,
              orderId: inv.orderId,
              amount: Number(inv.amount),
              amountOutstanding: Number(inv.amountOutstanding),
              taxableAmount: Number(inv.taxableAmount),
              cgstAmount: Number(inv.cgstAmount),
              sgstAmount: Number(inv.sgstAmount),
              igstAmount: Number(inv.igstAmount),
              lines: inv.lines.map((l) => ({
                quantity: Number(l.quantity),
                unitPrice: Number(l.unitPrice),
                lineTotal: Number(l.lineTotal),
              })),
            },
          ])
        );
        const creditItems = live.items.map((i) => ({
          originalOrderId: i.originalOrderId,
          quantity: Number(i.quantity),
        }));
        const priorCreditedByOrderId = await loadPriorApprovedCreditsByOrderId(
          tx,
          orderIds,
          id,
          { ordersById, invoicesByOrderId }
        );
        const maxEligible = computeMaxEligibleCredit({
          items: creditItems,
          ordersById,
          invoicesByOrderId,
          priorCreditedByOrderId,
        });
        const resolved = resolveApprovedCreditAmount({
          requestedAmount: approvedAmountRaw,
          maxEligible,
        });
        if (!resolved.ok) {
          throw new ReturnEligibilityError(resolved.error);
        }
        const amount = resolved.amount;

        const eligibleByOrderId = estimateReturnCreditByOrder({
          items: creditItems,
          ordersById,
          invoicesByOrderId,
        });
        // Cap each order's weight by remaining eligible after prior credits.
        for (const [orderId, elig] of eligibleByOrderId) {
          const order = ordersById.get(orderId);
          if (!order) continue;
          const full = estimateReturnCreditByOrder({
            items: [
              {
                originalOrderId: orderId,
                quantity: Number(order.quantity),
              },
            ],
            ordersById,
            invoicesByOrderId,
          }).get(orderId) ?? 0;
          const prior = Number(priorCreditedByOrderId.get(orderId) ?? 0);
          const remaining = Math.max(0, full - prior);
          eligibleByOrderId.set(orderId, Math.min(elig, remaining));
        }

        const allocation = allocateReturnCreditAcrossInvoices({
          approvedAmount: amount,
          eligibleByOrderId,
          invoices: invoices.map((inv) => ({
            orderId: inv.orderId,
            invoiceId: inv.id,
            invoiceAmount: Number(inv.amount),
            amountOutstanding: Number(inv.amountOutstanding),
            taxableAmount: Number(inv.taxableAmount),
            cgstAmount: Number(inv.cgstAmount),
            sgstAmount: Number(inv.sgstAmount),
            igstAmount: Number(inv.igstAmount),
          })),
        });
        if (!allocation.ok) {
          throw new ReturnEligibilityError(allocation.error);
        }

        const { creditNote } = await createCreditNoteForReturn(tx, {
          returnRequestId: id,
          userId: request.customerId,
          amount,
          reason: remarks || "Return approved as credit.",
          allocations: allocation.allocations,
          primaryInvoiceId: request.primaryInvoiceId,
        });

        // Loyalty: reverse from tax-exclusive allocation shares (same tx — no silent swallow).
        await reverseLoyaltyForCreditAllocations({
          customerId: request.customerId,
          returnRequestId: id,
          creditNoteId: creditNote.id,
          reason: `Return ${request.requestNumber}: ${remarks || "credit approved"}`,
          allocations: allocation.allocations.map((a) => ({
            orderId: a.orderId,
            invoiceId: a.invoiceId,
            taxableAmount: a.taxableAmount,
          })),
          db: tx,
        });

        await tx.returnRequest.update({
          where: { id },
          data: {
            status: ReturnRequestStatus.APPROVED_CREDIT,
            reviewedByAdminId: session.userId,
            assignedEmployeeId,
            decisionType: decision,
            stockDisposition: stockDisposition!,
            approvedAmount: amount,
            adminRemarks: remarks || null,
          },
        });
        await appendReturnTimelineEvent(tx, {
          returnRequestId: id,
          actorUserId: session.userId,
          eventType: "APPROVED_CREDIT",
          message:
            remarks ||
            `Approved as credit note. Assigned to ${assignedEmployeeLabel}.`,
        });
        return;
      }

      const replacementBatchId = `RET-REPL-${Date.now()}`;
      for (const item of request.items) {
        const originalOrder = await tx.order.findUnique({
          where: { id: item.originalOrderId },
        });
        if (!originalOrder) continue;

        const createdOrder = await tx.order.create({
          data: {
            orderNumber: null,
            checkoutBatchId: replacementBatchId,
            userId: request.customerId,
            assignedToId: assignedEmployeeId,
            assignedAt: new Date(),
            lineType: originalOrder.lineType,
            wholesaleSpec:
              originalOrder.wholesaleSpec === null
                ? Prisma.JsonNull
                : (originalOrder.wholesaleSpec as Prisma.InputJsonValue),
            lensType: originalOrder.lensType,
            singleVisionLensId: originalOrder.singleVisionLensId,
            kryptokLensId: originalOrder.kryptokLensId,
            progressiveLensId: originalOrder.progressiveLensId,
            oriVisionLensId: originalOrder.oriVisionLensId,
            magnusLensId: originalOrder.magnusLensId,
            bifocalLensId: originalOrder.bifocalLensId,
            quantity: item.quantity,
            reservedQuantity: 0,
            pickedQuantity: 0,
            unitPrice: 0,
            totalAmount: 0,
            sph: item.requestedSph ?? originalOrder.sph,
            cyl: item.requestedCyl ?? originalOrder.cyl,
            axis: item.requestedAxis ?? originalOrder.axis,
            add: item.requestedAdd ?? originalOrder.add,
            eye: item.eye ?? originalOrder.eye,
            status: "PENDING",
            notes: `[Replacement Order] ${remarks || `Created from return request ${request.requestNumber}`}`,
            orderImageUrl: originalOrder.orderImageUrl,
            ...cutoffSlot,
          },
        });

        await createInvoiceFromOrder({
          orderId: createdOrder.id,
          markPaid: true,
          tx,
        });
      }

      await tx.returnRequest.update({
        where: { id },
        data: {
          status: ReturnRequestStatus.AWAITING_MATERIAL,
          reviewedByAdminId: session.userId,
          assignedEmployeeId,
          decisionType: decision,
          stockDisposition: stockDisposition!,
          replacementBatchId,
          adminRemarks: remarks || null,
        },
      });
      await appendReturnTimelineEvent(tx, {
        returnRequestId: id,
        actorUserId: session.userId,
        eventType: "APPROVED_REPLACEMENT",
        message:
          remarks ||
          `Approved as replacement. Assigned to ${assignedEmployeeLabel}.`,
      });
    });

    const auditCtx = buildAuditRequestContext(req);
    await recordAuditEvent(prisma, {
      action: AuditAction.RETURN_DECISION,
      module: AuditModule.RETURN,
      entityType: "ReturnRequest",
      entityId: id,
      actor: actorFromSession(session),
      request: auditCtx,
      context: {
        decision,
        stockDisposition: stockDisposition ?? null,
        requestNumber: request.requestNumber,
      },
      relatedRefs: { returnId: id, orderId: request.primaryOrderId },
      activityMessage: `Return ${decision} — ${request.requestNumber}`,
    });

    if (decision === "CREDIT") {
      await recordAuditEvent(prisma, {
        action: AuditAction.CREDIT_NOTE_ISSUED,
        module: AuditModule.FINANCE,
        entityType: "ReturnRequest",
        entityId: id,
        actor: actorFromSession(session),
        request: auditCtx,
        context: {
          approvedAmount:
            approvedAmountRaw === undefined ||
            approvedAmountRaw === null ||
            approvedAmountRaw === ""
              ? null
              : Number(approvedAmountRaw),
          requestNumber: request.requestNumber,
        },
        relatedRefs: { returnId: id },
        activityMessage: `Credit note issued for return ${request.requestNumber}`,
      });
    }

    const refreshed = await getReturnRequestWithRelations(id);
    if (refreshed) {
      await notifyCustomerOfReturnDecision(
        refreshed.customerId,
        refreshed.requestNumber,
        refreshed.status,
        refreshed.rejectionReason || refreshed.adminRemarks,
        refreshed.primaryOrderId
      );

      if (assignedEmployeeId && decision !== "REJECT") {
        await notifyEmployeeOfReturnAssigned(
          assignedEmployeeId,
          refreshed.requestNumber,
          remarks || null,
          refreshed.primaryOrderId
        );
      }
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
