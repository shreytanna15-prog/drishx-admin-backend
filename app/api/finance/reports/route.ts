import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session-auth";
import { prisma } from "@/app/lib/prisma";
import { financialYearBounds, getFinancialYear } from "@/app/lib/finance/financial-year";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || (session.role !== "ADMIN" && session.role !== "EMPLOYEE")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const report = searchParams.get("report") || "gst-summary";
  const fy = searchParams.get("fy") || getFinancialYear();
  const { start, end } = financialYearBounds(fy);

  if (report === "gst-summary") {
    const invoices = await prisma.invoice.findMany({
      where: {
        issuedAt: { gte: start, lte: end },
        status: { notIn: ["CANCELLED", "VOID"] },
      },
      select: {
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        isInterState: true,
      },
    });
    const purchases = await prisma.purchaseBill.findMany({
      where: {
        billDate: { gte: start, lte: end },
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
      select: {
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
      },
    });

    const output = invoices.reduce(
      (acc, i) => {
        acc.taxable += Number(i.taxableAmount);
        acc.cgst += Number(i.cgstAmount);
        acc.sgst += Number(i.sgstAmount);
        acc.igst += Number(i.igstAmount);
        return acc;
      },
      { taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    );
    const input = purchases.reduce(
      (acc, i) => {
        acc.taxable += Number(i.taxableAmount);
        acc.cgst += Number(i.cgstAmount);
        acc.sgst += Number(i.sgstAmount);
        acc.igst += Number(i.igstAmount);
        return acc;
      },
      { taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    );
    const outputGst = output.cgst + output.sgst + output.igst;
    const inputGst = input.cgst + input.sgst + input.igst;

    return NextResponse.json({
      financialYear: fy,
      output: { ...output, totalGst: outputGst },
      input: { ...input, totalGst: inputGst },
      netGstPayable: outputGst - inputGst,
    });
  }

  if (report === "hsn") {
    const lines = await prisma.invoiceLine.findMany({
      where: {
        invoice: {
          issuedAt: { gte: start, lte: end },
          status: { notIn: ["CANCELLED", "VOID"] },
        },
      },
      select: {
        hsnCode: true,
        description: true,
        quantity: true,
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
      },
    });
    const map = new Map<
      string,
      { hsn: string; description: string; qty: number; taxable: number; gst: number }
    >();
    for (const l of lines) {
      const hsn = l.hsnCode || "UNKNOWN";
      const cur = map.get(hsn) || {
        hsn,
        description: l.description,
        qty: 0,
        taxable: 0,
        gst: 0,
      };
      cur.qty += Number(l.quantity);
      cur.taxable += Number(l.taxableAmount);
      cur.gst +=
        Number(l.cgstAmount) + Number(l.sgstAmount) + Number(l.igstAmount);
      map.set(hsn, cur);
    }
    return NextResponse.json({ financialYear: fy, rows: [...map.values()] });
  }

  if (report === "power-wise") {
    const lines = await prisma.invoiceLine.findMany({
      where: {
        invoice: {
          issuedAt: { gte: start, lte: end },
          status: { notIn: ["CANCELLED", "VOID"] },
        },
      },
      select: {
        powerLabel: true,
        quantity: true,
        taxableAmount: true,
        lineTotal: true,
        unitPrice: true,
      },
    });
    const map = new Map<
      string,
      { power: string; qty: number; sales: number }
    >();
    for (const l of lines) {
      const power = l.powerLabel || "Unspecified";
      const cur = map.get(power) || { power, qty: 0, sales: 0 };
      cur.qty += Number(l.quantity);
      cur.sales += Number(l.lineTotal);
      map.set(power, cur);
    }
    return NextResponse.json({
      financialYear: fy,
      rows: [...map.values()].sort((a, b) => b.sales - a.sales),
    });
  }

  return NextResponse.json({ error: "Unknown report." }, { status: 400 });
}
