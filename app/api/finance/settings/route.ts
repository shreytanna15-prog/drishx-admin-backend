import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { prisma } from "@/app/lib/prisma";
import {
  getCompanyFinanceSettings,
} from "@/app/lib/finance/company-settings";
import { AuditAction, AuditModule, recordAuditEvent } from "@/app/lib/audit";

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if ((session.role !== "ADMIN" && session.role !== "EMPLOYEE")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const settings = await getCompanyFinanceSettings();
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const body = await req.json();
  const settings = await prisma.companyFinanceSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      legalName: body.legalName ?? "DrishX",
      tradeName: body.tradeName ?? null,
      addressLine1: body.addressLine1 ?? null,
      addressLine2: body.addressLine2 ?? null,
      city: body.city ?? null,
      state: body.state ?? "Gujarat",
      stateCode: body.stateCode ?? "24",
      pincode: body.pincode ?? null,
      gstin: body.gstin ?? null,
      pan: body.pan ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      invoiceSeriesPrefix: body.invoiceSeriesPrefix ?? "INV",
      defaultHsnCode: body.defaultHsnCode ?? "9001",
      defaultGstRatePercent: body.defaultGstRatePercent ?? 5,
      paymentTermsDays: body.paymentTermsDays ?? 30,
      bankName: body.bankName ?? null,
      bankAccountName: body.bankAccountName ?? null,
      bankAccountNumber: body.bankAccountNumber ?? null,
      bankIfsc: body.bankIfsc ?? null,
      invoiceFooterNotes: body.invoiceFooterNotes ?? null,
    },
    update: {
      legalName: body.legalName,
      tradeName: body.tradeName,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      city: body.city,
      state: body.state,
      stateCode: body.stateCode,
      pincode: body.pincode,
      gstin: body.gstin,
      pan: body.pan,
      phone: body.phone,
      email: body.email,
      invoiceSeriesPrefix: body.invoiceSeriesPrefix,
      defaultHsnCode: body.defaultHsnCode,
      defaultGstRatePercent: body.defaultGstRatePercent,
      paymentTermsDays: body.paymentTermsDays,
      bankName: body.bankName,
      bankAccountName: body.bankAccountName,
      bankAccountNumber: body.bankAccountNumber,
      bankIfsc: body.bankIfsc,
      invoiceFooterNotes: body.invoiceFooterNotes,
    },
  });

  await recordAuditEvent(prisma, {
    action: AuditAction.SETTINGS_UPDATED,
    module: AuditModule.FINANCE,
    entityType: "CompanyFinanceSettings",
    entityId: "default",
    actor: {
      actorType: "HUMAN",
      actorUserId: session.userId,
      actorName: null,
    },
    message: "Company finance settings updated",
  }).catch(() => undefined);

  return NextResponse.json(settings);
}
