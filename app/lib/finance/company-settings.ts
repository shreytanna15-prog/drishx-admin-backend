import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";

export async function getCompanyFinanceSettings() {
  const existing = await prisma.companyFinanceSettings.findUnique({
    where: { id: "default" },
  });
  if (existing) return existing;
  return prisma.companyFinanceSettings.create({
    data: { id: "default" },
  });
}

export type TaxRateResolved = {
  hsnCode: string;
  gstRatePercent: number;
  fromDefault: boolean;
};

export async function resolveProductTax(input: {
  lensType?: string | null;
  productName?: string | null;
}): Promise<TaxRateResolved> {
  const settings = await getCompanyFinanceSettings();
  const defaultHsn = settings.defaultHsnCode || "9001";
  const defaultRate = Number(settings.defaultGstRatePercent) || 5;

  if (input.lensType && input.productName) {
    const line = await prisma.catalogProductLine.findFirst({
      where: {
        lensType: input.lensType,
        name: { equals: input.productName, mode: "insensitive" },
        isActive: true,
      },
    });
    if (line?.hsnCode || line?.gstRatePercent != null) {
      return {
        hsnCode: line.hsnCode || defaultHsn,
        gstRatePercent:
          line.gstRatePercent != null
            ? Number(line.gstRatePercent)
            : defaultRate,
        fromDefault: !(line.hsnCode && line.gstRatePercent != null),
      };
    }
  }

  return {
    hsnCode: defaultHsn,
    gstRatePercent: defaultRate,
    fromDefault: true,
  };
}

export function decimal(n: number): Prisma.Decimal {
  // Prisma accepts number/string; callers use Decimal fields via create data
  return n as unknown as Prisma.Decimal;
}
