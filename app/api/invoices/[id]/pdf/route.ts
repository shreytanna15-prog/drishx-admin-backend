import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session-auth";
import { prisma } from "@/app/lib/prisma";
import { getCompanyFinanceSettings } from "@/app/lib/finance/company-settings";

/** Simple HTML tax invoice — browsers can print / save as PDF. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { lineNumber: "asc" } },
      user: true,
      order: { select: { orderNumber: true, id: true } },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (session.role === "CUSTOMER" && invoice.userId !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const company = await getCompanyFinanceSettings();
  const money = (n: unknown) =>
    `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const linesHtml = invoice.lines
    .map(
      (l) => `
      <tr>
        <td>${l.lineNumber}</td>
        <td>${escapeHtml(l.description)}${l.powerLabel ? `<br/><small>${escapeHtml(l.powerLabel)}</small>` : ""}</td>
        <td>${escapeHtml(l.hsnCode || "")}</td>
        <td>${Number(l.quantity)}</td>
        <td>${money(l.unitPrice)}</td>
        <td>${Number(l.gstRatePercent)}%</td>
        <td>${money(l.taxableAmount)}</td>
        <td>${money(l.cgstAmount)}</td>
        <td>${money(l.sgstAmount)}</td>
        <td>${money(l.igstAmount)}</td>
        <td>${money(l.lineTotal)}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(invoice.invoiceNumber)}</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;color:#111;margin:24px;}
  h1{font-size:20px;margin:0 0 4px;}
  .muted{color:#555;font-size:12px;}
  table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px;}
  th,td{border:1px solid #ccc;padding:6px;text-align:left;}
  th{background:#f3f3f3;}
  .totals{margin-top:12px;width:280px;margin-left:auto;}
  .totals td{border:none;padding:3px 6px;}
  @media print{.no-print{display:none}}
</style></head><body>
<button class="no-print" onclick="window.print()">Print / Save PDF</button>
<div style="display:flex;justify-content:space-between;gap:24px;">
  <div>
    <h1>${escapeHtml(company.legalName)}</h1>
    <div class="muted">${escapeHtml([company.addressLine1, company.city, company.state, company.pincode].filter(Boolean).join(", "))}</div>
    <div class="muted">GSTIN: ${escapeHtml(company.gstin || invoice.companyGstin || "—")} · State: ${escapeHtml(company.state)} (${escapeHtml(company.stateCode)})</div>
  </div>
  <div style="text-align:right;">
    <h1>Tax Invoice</h1>
    <div><strong>${escapeHtml(invoice.invoiceNumber)}</strong></div>
    <div class="muted">Date: ${invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString("en-IN") : "—"}</div>
    <div class="muted">Order: ${invoice.order?.orderNumber ?? invoice.orderId.slice(-8)}</div>
    <div class="muted">Status: ${invoice.status}</div>
  </div>
</div>
<div style="margin-top:16px;display:flex;gap:32px;">
  <div>
    <strong>Bill To</strong>
    <div>${escapeHtml(invoice.customerLegalName || invoice.user.businessName || invoice.user.name || "")}</div>
    <div class="muted">GSTIN: ${escapeHtml(invoice.customerGstin || invoice.user.gstNumber || "—")}</div>
    <div class="muted">Place of supply: ${escapeHtml(invoice.placeOfSupplyState || "—")} (${escapeHtml(invoice.placeOfSupplyCode || "")})</div>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th>#</th><th>Description</th><th>HSN</th><th>Qty</th><th>Rate</th><th>GST%</th>
      <th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th>
    </tr>
  </thead>
  <tbody>${linesHtml || `<tr><td colspan="11">No lines — legacy invoice ${money(invoice.amount)}</td></tr>`}</tbody>
</table>
<table class="totals">
  <tr><td>Taxable</td><td style="text-align:right">${money(invoice.taxableAmount)}</td></tr>
  <tr><td>CGST</td><td style="text-align:right">${money(invoice.cgstAmount)}</td></tr>
  <tr><td>SGST</td><td style="text-align:right">${money(invoice.sgstAmount)}</td></tr>
  <tr><td>IGST</td><td style="text-align:right">${money(invoice.igstAmount)}</td></tr>
  <tr><td>Rounding</td><td style="text-align:right">${money(invoice.roundingAdjustment)}</td></tr>
  <tr><td><strong>Grand Total</strong></td><td style="text-align:right"><strong>${money(invoice.amount)}</strong></td></tr>
  <tr><td>Paid</td><td style="text-align:right">${money(invoice.amountPaid)}</td></tr>
  <tr><td>Outstanding</td><td style="text-align:right">${money(invoice.amountOutstanding)}</td></tr>
</table>
${company.bankName ? `<p class="muted" style="margin-top:24px">Bank: ${escapeHtml(company.bankName)} · A/c ${escapeHtml(company.bankAccountNumber || "")} · IFSC ${escapeHtml(company.bankIfsc || "")}</p>` : ""}
${company.invoiceFooterNotes ? `<p class="muted">${escapeHtml(company.invoiceFooterNotes)}</p>` : ""}
</body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${invoice.invoiceNumber.replace(/\//g, "-")}.html"`,
    },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
