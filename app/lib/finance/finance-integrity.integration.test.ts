/**
 * Isolated-PostgreSQL integration tests for Phase 1–4 finance integrity.
 *
 * Opt-in only — skipped unless both are set:
 *   DATABASE_URL=postgresql://...
 *   DRISHX_FINANCE_INTEGRATION=1
 *
 * Requires migrate + generate already applied (CreditNoteAllocation present).
 * Use a disposable local/CI database — not production.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLoyaltyReversePoints } from "@/app/lib/loyalty/reverse-policy";

const RUN =
  Boolean(process.env.DATABASE_URL) &&
  process.env.DRISHX_FINANCE_INTEGRATION === "1";

describe("finance integrity — repeated return ratio (pure, always on)", () => {
  it("two successive returns reverse full earn points without under-calc", () => {
    const originalTaxable = 1000;
    const earn = 100;
    const first = computeLoyaltyReversePoints({
      originalTaxable,
      priorReturnedTaxable: 0,
      returnedTaxable: 400,
      remainingPoints: earn,
    });
    const second = computeLoyaltyReversePoints({
      originalTaxable,
      priorReturnedTaxable: 400,
      returnedTaxable: 600,
      remainingPoints: earn - first,
    });
    assert.equal(first, 40);
    assert.equal(second, 60);
    assert.equal(first + second, 100);
    // Old bug: second = remaining × returned/original = 60×600/1000 = 36
    assert.notEqual(second, 36);
  });
});

describe("finance integrity (isolated PostgreSQL)", { skip: !RUN }, () => {
  async function seedCustomerInvoice(tag: string, amount: number, taxable: number) {
    const { prisma } = await import("@/app/lib/prisma");
    const { InvoiceStatus, OrderStatus, UserRole } = await import("@prisma/client");
    const suffix = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const customer = await prisma.user.create({
      data: {
        email: `fin-${suffix}@example.com`,
        password: "x",
        role: UserRole.CUSTOMER,
        name: "Finance Integration",
      },
    });

    const order = await prisma.order.create({
      data: {
        userId: customer.id,
        status: OrderStatus.COMPLETED,
        lensType: "SINGLE_VISION",
        quantity: 1,
        unitPrice: taxable,
        totalAmount: amount,
      },
    });

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-FIN-${suffix}`,
        orderId: order.id,
        userId: customer.id,
        amount,
        taxableAmount: taxable,
        cgstAmount: (amount - taxable) / 2,
        sgstAmount: (amount - taxable) / 2,
        igstAmount: 0,
        amountPaid: 0,
        amountOutstanding: amount,
        status: InvoiceStatus.ISSUED,
        issuedAt: new Date(),
      },
    });

    return { prisma, customer, order, invoice, suffix };
  }

  async function seedReturn(customerId: string, suffix: string) {
    const { prisma } = await import("@/app/lib/prisma");
    return prisma.returnRequest.create({
      data: {
        requestNumber: `RM-${suffix}`,
        customerId,
        requestType: "RETURN",
        status: "APPROVED_CREDIT",
      },
    });
  }

  it("concurrent payment + credit cannot drive outstanding negative", async () => {
    const { prisma, customer, invoice } = await seedCustomerInvoice("race", 210, 200);
    const { PaymentMode } = await import("@prisma/client");
    const { recordCustomerPayment } = await import("./payments");
    const { createCreditNoteForReturn } = await import("@/app/lib/returns");
    const returnReq = await seedReturn(customer.id, `race-${invoice.id.slice(-6)}`);

    const [payResult, creditResult] = await Promise.allSettled([
      recordCustomerPayment({
        customerId: customer.id,
        amount: 150,
        mode: PaymentMode.UPI,
        allocations: [{ invoiceId: invoice.id, amount: 150 }],
      }),
      prisma.$transaction(async (tx) =>
        createCreditNoteForReturn(tx, {
          returnRequestId: returnReq.id,
          userId: customer.id,
          amount: 150,
          reason: "integration race credit",
          allocations: [
            {
              invoiceId: invoice.id,
              amount: 150,
              taxableAmount: 142.86,
              cgstAmount: 3.57,
              sgstAmount: 3.57,
              igstAmount: 0,
            },
          ],
        })
      ),
    ]);

    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    const outstanding = Number(after.amountOutstanding);
    const paid = Number(after.amountPaid);
    assert.ok(outstanding >= -0.009, `outstanding negative: ${outstanding}`);
    assert.ok(paid >= -0.009);
    // Applied total cannot exceed invoice amount (within rounding).
    assert.ok(
      paid + (210 - outstanding) <= 210.02 + 0.01 ||
        outstanding + paid <= 210.02,
      `incoherent balances paid=${paid} outstanding=${outstanding}`
    );
    assert.equal(
      payResult.status === "fulfilled" || creditResult.status === "fulfilled",
      true
    );
  });

  it("multi-invoice credit allocations persist and reduce each outstanding", async () => {
    const a = await seedCustomerInvoice("A", 210, 200);
    const b = await seedCustomerInvoice("B", 105, 100);
    // Share one customer: move B's invoice/order under A's customer is heavy;
    // instead create both under same customer.
    const { prisma } = a;
    const { allocateReturnCreditAcrossInvoices } = await import(
      "@/app/lib/return-credit"
    );
    const { createCreditNoteForReturn } = await import("@/app/lib/returns");

    // Re-seed B under A's customer for a true multi-invoice CN.
    const { InvoiceStatus, OrderStatus } = await import("@prisma/client");
    const orderB = await prisma.order.create({
      data: {
        userId: a.customer.id,
        status: OrderStatus.COMPLETED,
        lensType: "SINGLE_VISION",
        quantity: 1,
        unitPrice: 100,
        totalAmount: 105,
      },
    });
    const invoiceB = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-FIN-B-${a.suffix}`,
        orderId: orderB.id,
        userId: a.customer.id,
        amount: 105,
        taxableAmount: 100,
        cgstAmount: 2.5,
        sgstAmount: 2.5,
        igstAmount: 0,
        amountPaid: 0,
        amountOutstanding: 105,
        status: InvoiceStatus.ISSUED,
        issuedAt: new Date(),
      },
    });

    const plan = allocateReturnCreditAcrossInvoices({
      approvedAmount: 250,
      eligibleByOrderId: new Map([
        [a.order.id, 210],
        [orderB.id, 105],
      ]),
      invoices: [
        {
          orderId: a.order.id,
          invoiceId: a.invoice.id,
          invoiceAmount: 210,
          amountOutstanding: 210,
          taxableAmount: 200,
          cgstAmount: 5,
          sgstAmount: 5,
          igstAmount: 0,
        },
        {
          orderId: orderB.id,
          invoiceId: invoiceB.id,
          invoiceAmount: 105,
          amountOutstanding: 105,
          taxableAmount: 100,
          cgstAmount: 2.5,
          sgstAmount: 2.5,
          igstAmount: 0,
        },
      ],
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;

    const returnReq = await seedReturn(a.customer.id, `multi-${a.suffix}`);
    await prisma.$transaction(async (tx) =>
      createCreditNoteForReturn(tx, {
        returnRequestId: returnReq.id,
        userId: a.customer.id,
        amount: plan.totalApplied,
        allocations: plan.allocations.map((x) => ({
          invoiceId: x.invoiceId,
          amount: x.amount,
          taxableAmount: x.taxableAmount,
          cgstAmount: x.cgstAmount,
          sgstAmount: x.sgstAmount,
          igstAmount: x.igstAmount,
        })),
      })
    );

    const invA = await prisma.invoice.findUniqueOrThrow({
      where: { id: a.invoice.id },
    });
    const invB = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceB.id },
    });
    assert.ok(Number(invA.amountOutstanding) < 210);
    assert.ok(Number(invB.amountOutstanding) < 105);

    const allocCount = await prisma.creditNoteAllocation.count({
      where: { creditNote: { returnRequestId: returnReq.id } },
    });
    assert.equal(allocCount, plan.allocations.length);

    // Silence unused seed B customer (created by helper; leave for GC / disposable DB).
    void b;
  });

  it("credit note creation rolls back invoice outstanding when later step throws", async () => {
    const { prisma, customer, invoice } = await seedCustomerInvoice("rb", 105, 100);
    const { createCreditNoteForReturn } = await import("@/app/lib/returns");
    const returnReq = await seedReturn(customer.id, `rb-${invoice.id.slice(-6)}`);

    await assert.rejects(
      () =>
        prisma.$transaction(async (tx) => {
          await createCreditNoteForReturn(tx, {
            returnRequestId: returnReq.id,
            userId: customer.id,
            amount: 50,
            allocations: [
              {
                invoiceId: invoice.id,
                amount: 50,
                taxableAmount: 47.62,
                cgstAmount: 1.19,
                sgstAmount: 1.19,
                igstAmount: 0,
              },
            ],
          });
          throw new Error("forced rollback after credit note");
        }),
      /forced rollback/
    );

    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    assert.equal(Number(after.amountOutstanding), 105);
    const cn = await prisma.creditNote.findUnique({
      where: { returnRequestId: returnReq.id },
    });
    assert.equal(cn, null);
  });
});
