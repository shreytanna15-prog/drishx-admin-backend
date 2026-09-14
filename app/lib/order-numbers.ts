import { prisma } from "./prisma";

/** Generates a unique 6-digit numeric order number (100000–999999). */
export async function generateUniqueOrderNumber(): Promise<number> {
  const [orderNumber] = await generateUniqueOrderNumbers(1);
  return orderNumber!;
}

/** Allocate many unique order numbers with batched collision checks. */
export async function generateUniqueOrderNumbers(count: number): Promise<number[]> {
  if (count <= 0) {
    return [];
  }

  const result: number[] = [];
  const pending = new Set<number>();

  while (result.length < count) {
    while (pending.size < (count - result.length) * 2) {
      pending.add(Math.floor(100000 + Math.random() * 900000));
    }

    const candidates = [...pending];
    const existing = await prisma.order.findMany({
      where: { orderNumber: { in: candidates } },
      select: { orderNumber: true },
    });
    const taken = new Set(
      existing
        .map((row) => row.orderNumber)
        .filter((value): value is number => value !== null)
    );

    for (const candidate of candidates) {
      pending.delete(candidate);
      if (taken.has(candidate)) {
        continue;
      }
      result.push(candidate);
      if (result.length >= count) {
        break;
      }
    }
  }

  return result;
}
