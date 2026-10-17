import { NextRequest, NextResponse } from "next/server";
import { PaymentMode, PurchaseBillStatus } from "@prisma/client";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { prisma } from "@/app/lib/prisma";
import { getCompanyFinanceSettings } from "@/app/lib/finance/company-settings";
import { nextPurchaseBillNumber, nextSupplierPaymentNumber } from "@/app/lib/finance/invoice-number";
import { resolvePlaceOfSupply } from "@/app/lib/finance/place-of-supply";
import { calculateInvoiceTotals, roundMoney } from "@/app/lib/finance/tax-calc";
import { postPurchaseBillJournal } from "@/app/lib/finance/journal";
import { AuditAction, AuditModule, recordAuditEvent } from "@/app/lib/audit";
import { PartyLedgerEntryType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if ((session.role !== "ADMIN" && session.role !== "EMPLOYEE")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const resource = searchParams.get("resource") || "bills";

  if (resource === "suppliers") {
    const suppliers = await prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(suppliers);
  }

  const pageRaw = Number(searchParams.get("page") ?? "1");
  const limitRaw = Number(searchParams.get("limit") ?? "30");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Math.min(
    100,
    Math.max(1, Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 30)
  );
  const skip = (page - 1) * limit;

  if (resource === "payables") {
    const payableWhere = {
      status: { in: ["POSTED", "PARTIALLY_PAID"] as PurchaseBillStatus[] },
      amountOutstanding: { gt: 0 },
    };
    const [agg, totalCount, bills] = await Promise.all([
      prisma.purchaseBill.aggregate({
        where: payableWhere,
        _sum: { amountOutstanding: true },
      }),
      prisma.purchaseBill.count({ where: payableWhere }),
      prisma.purchaseBill.findMany({
        where: payableWhere,
        include: { supplier: true },
        orderBy: { billDate: "asc" },
        skip,
        take: limit,
      }),
    ]);
    return NextResponse.json({
      totalPayable: Number(agg._sum.amountOutstanding ?? 0),
      bills,
      items: bills,
      page,
      limit,
      hasMore: skip + bills.length < totalCount,
      total: totalCount,
    });
  }

  const [total, bills] = await Promise.all([
    prisma.purchaseBill.count(),
    prisma.purchaseBill.findMany({
      include: { supplier: true },
      orderBy: { billDate: "desc" },
      skip,
      take: limit,
    }),
  ]);
  return NextResponse.json({
    items: bills,
    page,
    limit,
    hasMore: skip + bills.length < total,
    total,
  });
}

export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const body = await req.json();
  const action = body.action as string;

  try {
    if (action === "create-supplier") {
      const supplier = await prisma.supplier.create({
        data: {
          name: body.name,
          tradeName: body.tradeName,
          gstin: body.gstin,
          state: body.state,
          stateCode: body.stateCode,
          address: body.address,
          phone: body.phone,
          email: body.email,
        },
      });
      return NextResponse.json(supplier, { status: 201 });
    }

    if (action === "create-bill") {
      const settings = await getCompanyFinanceSettings();
      const supplier = await prisma.supplier.findUniqueOrThrow({
        where: { id: body.supplierId },
      });
      const pos = resolvePlaceOfSupply({
        companyState: settings.state,
        companyStateCode: settings.stateCode,
        customerBillingState: supplier.state,
      });
      const lineInputs = (body.lines as Array<{
        description: string;
        sku?: string;
        hsnCode?: string;
        quantity: number;
        unitPrice: number;
        discountAmount?: number;
        gstRatePercent?: number;
      }>).map((l) => ({
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        discountAmount: Number(l.discountAmount || 0),
        gstRatePercent: Number(
          l.gstRatePercent ?? settings.defaultGstRatePercent
        ),
        meta: l,
      }));
      const totals = calculateInvoiceTotals(
        lineInputs.map(({ quantity, unitPrice, discountAmount, gstRatePercent }) => ({
          quantity,
          unitPrice,
          discountAmount,
          gstRatePercent,
        })),
        pos.isInterState
      );
      const { number: billNumber, financialYear } = await nextPurchaseBillNumber();
      const post = body.post === true;
      const bill = await prisma.purchaseBill.create({
        data: {
          billNumber,
          supplierBillNumber: body.supplierBillNumber,
          supplierId: supplier.id,
          status: post ? PurchaseBillStatus.POSTED : PurchaseBillStatus.DRAFT,
          financialYear,
          placeOfSupplyState: pos.placeOfSupplyState,
          isInterState: pos.isInterState,
          poReference: body.poReference,
          grnReference: body.grnReference,
          mismatchWarning: body.mismatchWarning,
          grossAmount: totals.grossAmount,
          discountAmount: totals.discountAmount,
          taxableAmount: totals.taxableAmount,
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          igstAmount: totals.igstAmount,
          roundingAdjustment: totals.roundingAdjustment,
          totalAmount: totals.grandTotal,
          amountOutstanding: post ? totals.grandTotal : 0,
          notes: body.notes,
          lines: {
            create: totals.lines.map((l, i) => ({
              lineNumber: i + 1,
              description: lineInputs[i]!.meta.description,
              sku: lineInputs[i]!.meta.sku,
              hsnCode: lineInputs[i]!.meta.hsnCode || settings.defaultHsnCode,
              quantity: lineInputs[i]!.quantity,
              unitPrice: lineInputs[i]!.unitPrice,
              discountAmount: l.discountAmount,
              taxableAmount: l.taxableAmount,
              gstRatePercent: l.gstRatePercent,
              cgstAmount: l.cgstAmount,
              sgstAmount: l.sgstAmount,
              igstAmount: l.igstAmount,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { lines: true, supplier: true },
      });

      if (post) {
        const prev = await prisma.supplierLedgerEntry.findFirst({
          where: { supplierId: supplier.id },
          orderBy: { occurredAt: "desc" },
        });
        const balanceAfter = roundMoney(
          Number(prev?.balanceAfter ?? 0) + totals.grandTotal
        );
        await prisma.supplierLedgerEntry.create({
          data: {
            supplierId: supplier.id,
            entryType: PartyLedgerEntryType.INVOICE,
            debitAmount: 0,
            creditAmount: totals.grandTotal,
            balanceAfter,
            description: `Purchase bill ${billNumber}`,
            purchaseBillId: bill.id,
          },
        });
        await postPurchaseBillJournal({
          billId: bill.id,
          taxable: totals.taxableAmount,
          inputGst: totals.cgstAmount + totals.sgstAmount + totals.igstAmount,
          total: totals.grandTotal,
        });
        await recordAuditEvent(prisma, {
          action: AuditAction.PURCHASE_BILL_POSTED,
          module: AuditModule.FINANCE,
          entityType: "PurchaseBill",
          entityId: bill.id,
          actor: {
            actorType: "HUMAN",
            actorUserId: session.userId,
            actorName: null,
          },
        }).catch(() => undefined);
      }

      const fresh = await prisma.purchaseBill.findUnique({
        where: { id: bill.id },
        include: { lines: true, supplier: true },
      });
      return NextResponse.json(fresh, { status: 201 });
    }

    if (action === "supplier-payment") {
      const amount = roundMoney(Number(body.amount));
      const { number: paymentNumber } = await nextSupplierPaymentNumber();
      let remaining = amount;
      const billIds: string[] = body.purchaseBillIds || [];
      const allocations: Array<{ purchaseBillId: string; amount: number }> = [];

      for (const billId of billIds) {
        if (remaining <= 0) break;
        const bill = await prisma.purchaseBill.findFirst({
          where: { id: billId, supplierId: body.supplierId },
        });
        if (!bill) continue;
        const apply = roundMoney(
          Math.min(Number(bill.amountOutstanding), remaining)
        );
        allocations.push({ purchaseBillId: bill.id, amount: apply });
        remaining = roundMoney(remaining - apply);
      }

      const payment = await prisma.$transaction(async (tx) => {
        const p = await tx.supplierPayment.create({
          data: {
            paymentNumber,
            supplierId: body.supplierId,
            amount,
            mode: (body.mode as PaymentMode) || PaymentMode.BANK,
            reference: body.reference,
            notes: body.notes,
            unallocatedAmount: remaining,
            recordedById: session.userId,
            allocations: {
              create: allocations.map((a) => ({
                purchaseBillId: a.purchaseBillId,
                amount: a.amount,
              })),
            },
          },
        });
        for (const a of allocations) {
          const bill = await tx.purchaseBill.findUniqueOrThrow({
            where: { id: a.purchaseBillId },
          });
          const amountPaid = roundMoney(Number(bill.amountPaid) + a.amount);
          const amountOutstanding = roundMoney(
            Math.max(0, Number(bill.totalAmount) - amountPaid)
          );
          await tx.purchaseBill.update({
            where: { id: bill.id },
            data: {
              amountPaid,
              amountOutstanding,
              status:
                amountOutstanding <= 0.009
                  ? PurchaseBillStatus.PAID
                  : PurchaseBillStatus.PARTIALLY_PAID,
            },
          });
        }
        const prev = await tx.supplierLedgerEntry.findFirst({
          where: { supplierId: body.supplierId },
          orderBy: { occurredAt: "desc" },
        });
        await tx.supplierLedgerEntry.create({
          data: {
            supplierId: body.supplierId,
            entryType: PartyLedgerEntryType.PAYMENT,
            debitAmount: amount,
            creditAmount: 0,
            balanceAfter: roundMoney(Number(prev?.balanceAfter ?? 0) - amount),
            description: `Supplier payment ${paymentNumber}`,
            supplierPaymentId: p.id,
          },
        });
        return p;
      });
      return NextResponse.json(payment, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
