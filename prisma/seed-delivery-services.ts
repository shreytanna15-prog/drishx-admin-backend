/**
 * Seed Delivery Service master (Sri Raj Land / Air + Customer Pickup).
 * Run: npx tsx prisma/seed-delivery-services.ts
 */
import { prisma } from "../app/lib/prisma";

const SERVICES = [
  {
    courierCompany: "Sri Raj Courier",
    serviceName: "Sri Raj Courier — Land",
    serviceType: "LAND",
    customerRate: 50,
    internalCostRate: 35,
    weightRounding: "NEXT_1KG",
    minWeight: 1,
    etaText: "1–2 days",
  },
  {
    courierCompany: "Sri Raj Courier",
    serviceName: "Sri Raj Courier — Air",
    serviceType: "AIR",
    customerRate: 120,
    internalCostRate: 100,
    weightRounding: "NEXT_1KG",
    minWeight: 1,
    etaText: "Same / next day",
  },
  {
    courierCompany: "Self",
    serviceName: "Customer Pickup",
    serviceType: "PICKUP",
    customerRate: 0,
    internalCostRate: 0,
    billingMethod: "FLAT",
    flatCharge: 0,
    weightRounding: "ACTUAL",
    minWeight: 0,
    etaText: "Pickup",
  },
];

async function main() {
  for (const s of SERVICES) {
    const existing = await prisma.deliveryService.findFirst({
      where: { serviceName: s.serviceName },
    });
    if (existing) {
      await prisma.deliveryService.update({ where: { id: existing.id }, data: { ...s, isActive: true } });
      console.log("updated:", s.serviceName);
    } else {
      await prisma.deliveryService.create({ data: s });
      console.log("created:", s.serviceName);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
