import { prisma } from "@/app/lib/prisma";
import { agingBucket } from "./aging";
import type { ReportTablePayload } from "./types";

export { agingBucket };

type AgingKey = "0-30" | "31-60" | "61-90" | "90+";

export async function computeOutstandingCustomersReport(): Promise<ReportTablePayload> {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      amountOutstanding: { gt: 0 },
    },
    select: {
      amountOutstanding: true,
      issuedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          businessName: true,
        },
      },
    },
    orderBy: { issuedAt: "asc" },
  });

  const now = new Date();
  const byCustomer = new Map<
    string,
    {
      customer: string;
      email: string;
      invoiceCount: number;
      outstanding: number;
      aging0_30: number;
      aging31_60: number;
      aging61_90: number;
      aging90plus: number;
    }
  >();

  const agingTotals: Record<AgingKey, number> = {
    "0-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  };
  let totalOutstanding = 0;

  for (const inv of invoices) {
    const amt = Number(inv.amountOutstanding);
    totalOutstanding += amt;
    const bucket = agingBucket(inv.issuedAt, now);
    agingTotals[bucket] += amt;

    const user = inv.user;
    const key = user.id;
    const cur = byCustomer.get(key) ?? {
      customer:
        user.businessName?.trim() ||
        user.name?.trim() ||
        user.email,
      email: user.email,
      invoiceCount: 0,
      outstanding: 0,
      aging0_30: 0,
      aging31_60: 0,
      aging61_90: 0,
      aging90plus: 0,
    };
    cur.invoiceCount += 1;
    cur.outstanding += amt;
    if (bucket === "0-30") cur.aging0_30 += amt;
    else if (bucket === "31-60") cur.aging31_60 += amt;
    else if (bucket === "61-90") cur.aging61_90 += amt;
    else cur.aging90plus += amt;
    byCustomer.set(key, cur);
  }

  const money = (n: number) => Math.round(n * 100) / 100;
  const rows = [...byCustomer.values()]
    .sort((a, b) => b.outstanding - a.outstanding)
    .map((r) => ({
      customer: r.customer,
      email: r.email,
      invoiceCount: r.invoiceCount,
      outstanding: money(r.outstanding),
      aging0_30: money(r.aging0_30),
      aging31_60: money(r.aging31_60),
      aging61_90: money(r.aging61_90),
      aging90plus: money(r.aging90plus),
    }));

  return {
    kind: "table",
    columns: [
      { key: "customer", label: "Customer" },
      { key: "email", label: "Email" },
      { key: "invoiceCount", label: "Invoices", align: "right" },
      { key: "outstanding", label: "Outstanding", align: "right" },
      { key: "aging0_30", label: "0–30", align: "right" },
      { key: "aging31_60", label: "31–60", align: "right" },
      { key: "aging61_90", label: "61–90", align: "right" },
      { key: "aging90plus", label: "90+", align: "right" },
    ],
    rows,
    summary: {
      customerCount: rows.length,
      invoiceCount: invoices.length,
      totalOutstanding: money(totalOutstanding),
      aging0_30: money(agingTotals["0-30"]),
      aging31_60: money(agingTotals["31-60"]),
      aging61_90: money(agingTotals["61-90"]),
      aging90plus: money(agingTotals["90+"]),
    },
  };
}
