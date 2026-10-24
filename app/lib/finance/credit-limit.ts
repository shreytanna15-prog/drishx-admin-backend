import { prisma } from "@/app/lib/prisma";
import { roundMoney } from "./tax-calc";
import {
  assessCheckoutCreditSync,
  creditLimitExceededMessage,
  type CheckoutCreditDenial,
  type CheckoutCreditFields,
} from "./credit-limit-gate";

export type { CheckoutCreditDenial, CheckoutCreditFields };
export { assessCheckoutCreditSync };

export async function checkCreditLimitWarning(
  customerId: string,
  additionalInvoiceAmount: number
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: customerId },
    select: { creditLimit: true, name: true, businessName: true },
  });
  if (user?.creditLimit == null) return null;

  const limit = Number(user.creditLimit);
  const outstandingAgg = await prisma.invoice.aggregate({
    where: {
      userId: customerId,
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE", "DRAFT"] },
    },
    _sum: { amountOutstanding: true },
  });
  const current = Number(outstandingAgg._sum.amountOutstanding ?? 0);
  const projected = roundMoney(current + additionalInvoiceAmount);
  if (projected <= limit) return null;

  return `Credit limit warning: projected outstanding ₹${projected.toLocaleString("en-IN")} exceeds limit ₹${limit.toLocaleString("en-IN")}.`;
}

export async function getCustomerOutstanding(customerId: string): Promise<number> {
  const agg = await prisma.invoice.aggregate({
    where: {
      userId: customerId,
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
    },
    _sum: { amountOutstanding: true },
  });
  return Number(agg._sum.amountOutstanding ?? 0);
}

/**
 * Phase D hard credit gate before committing an order that increases receivables.
 */
export async function assertHardCreditAtCheckout(
  customer: CheckoutCreditFields & { id: string },
  orderTotal: number
): Promise<{ ok: true } | CheckoutCreditDenial> {
  const sync = assessCheckoutCreditSync(customer, orderTotal);
  if (sync) return sync;

  const amount = roundMoney(Math.max(0, Number(orderTotal) || 0));
  const limit = Number(customer.creditLimit);
  const outstanding = await getCustomerOutstanding(customer.id);
  const projected = roundMoney(outstanding + amount);
  if (projected <= limit) return { ok: true };

  return creditLimitExceededMessage({
    outstanding,
    orderTotal: amount,
    limit,
  });
}
