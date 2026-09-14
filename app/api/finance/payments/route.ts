import { NextRequest, NextResponse } from "next/server";
import { PaymentMode } from "@prisma/client";
import { getSession } from "@/app/lib/session-auth";
import {
  confirmPaymentClaim,
  recordCustomerPayment,
  rejectPaymentClaim,
  submitPaymentClaim,
} from "@/app/lib/finance/payments";
import { prisma } from "@/app/lib/prisma";
import { AuditAction, AuditModule, recordAuditEvent } from "@/app/lib/audit";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") || "payments";

  if (kind === "claims") {
    const where =
      session.role === "CUSTOMER"
        ? { customerId: session.userId }
        : searchParams.get("status")
          ? { status: searchParams.get("status") as "PENDING" | "CONFIRMED" | "REJECTED" }
          : {};
    const claims = await prisma.paymentClaim.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, email: true, businessName: true } },
        items: { include: { invoice: { select: { id: true, invoiceNumber: true, amount: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json(claims);
  }

  const where =
    session.role === "CUSTOMER" ? { customerId: session.userId } : {};
  const payments = await prisma.payment.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, email: true, businessName: true } },
      allocations: {
        include: { invoice: { select: { id: true, invoiceNumber: true } } },
      },
    },
    orderBy: { paidAt: "desc" },
    take: 100,
  });
  return NextResponse.json(payments);
}

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json();
  const action = body.action as string;

  try {
    if (action === "claim" || session.role === "CUSTOMER") {
      if (session.role !== "CUSTOMER" && action === "claim") {
        // admin creating claim on behalf not needed
      }
      if (session.role === "CUSTOMER" || action === "claim") {
        const customerId =
          session.role === "CUSTOMER" ? session.userId : body.customerId;
        if (!customerId) {
          return NextResponse.json({ error: "customerId required." }, { status: 400 });
        }
        const claim = await submitPaymentClaim({
          customerId,
          amount: Number(body.amount),
          mode: (body.mode as PaymentMode) || PaymentMode.UPI,
          reference: body.reference,
          notes: body.notes,
          invoiceIds: body.invoiceIds,
        });
        await recordAuditEvent(prisma, {
          action: AuditAction.PAYMENT_CLAIM_SUBMITTED,
          module: AuditModule.FINANCE,
          entityType: "PaymentClaim",
          entityId: claim.id,
          actor: {
            actorType: "HUMAN",
            actorUserId: session.userId,
            actorName: null,
          },
          message: `Payment claim ₹${body.amount}`,
        }).catch(() => undefined);
        return NextResponse.json(claim, { status: 201 });
      }
    }

    if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (action === "confirm-claim") {
      const payment = await confirmPaymentClaim({
        claimId: body.claimId,
        reviewerId: session.userId,
        allocations: body.allocations,
      });
      await recordAuditEvent(prisma, {
        action: AuditAction.PAYMENT_CLAIM_CONFIRMED,
        module: AuditModule.FINANCE,
        entityType: "PaymentClaim",
        entityId: body.claimId,
        actor: {
          actorType: "HUMAN",
          actorUserId: session.userId,
          actorName: null,
        },
      }).catch(() => undefined);
      return NextResponse.json(payment);
    }

    if (action === "reject-claim") {
      const claim = await rejectPaymentClaim({
        claimId: body.claimId,
        reviewerId: session.userId,
        reason: body.reason,
      });
      await recordAuditEvent(prisma, {
        action: AuditAction.PAYMENT_CLAIM_REJECTED,
        module: AuditModule.FINANCE,
        entityType: "PaymentClaim",
        entityId: body.claimId,
        actor: {
          actorType: "HUMAN",
          actorUserId: session.userId,
          actorName: null,
        },
      }).catch(() => undefined);
      return NextResponse.json(claim);
    }

    // Direct admin payment record
    const payment = await recordCustomerPayment({
      customerId: body.customerId,
      amount: Number(body.amount),
      mode: (body.mode as PaymentMode) || PaymentMode.CASH,
      reference: body.reference,
      notes: body.notes,
      recordedById: session.userId,
      allocations: body.allocations,
      auditActorUserId: session.userId,
    });
    return NextResponse.json(payment, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
