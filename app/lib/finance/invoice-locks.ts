/**
 * Deterministic invoice row locks for payment / credit concurrency safety.
 * Sort IDs before locking to avoid deadlocks when two txs touch overlapping sets.
 */

import type { Prisma } from "@prisma/client";

/** Lock invoices in sorted id order (transaction-scoped FOR UPDATE). */
export async function lockInvoicesForUpdate(
  tx: Prisma.TransactionClient,
  invoiceIds: string[]
): Promise<void> {
  const unique = [...new Set(invoiceIds.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  for (const id of unique) {
    await tx.$executeRaw`
      SELECT 1 FROM "Invoice" WHERE id = ${id} FOR UPDATE
    `;
  }
}

/** Pure helper — sorted unique ids (unit-testable deadlock-avoidance order). */
export function sortedUniqueInvoiceIds(invoiceIds: string[]): string[] {
  return [...new Set(invoiceIds.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}
