/**
 * Stock S2b — freeze helpers.
 * A leaf is frozen while it appears on any OPEN or SUBMITTED stock-check session.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";

const ACTIVE_CHECK_STATUSES = ["OPEN", "SUBMITTED"] as const;

export class CatalogStockFreezeError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(
    message: string,
    status = 409,
    code = "LEAF_FROZEN",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CatalogStockFreezeError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type DbClient = Prisma.TransactionClient | typeof prisma;

export function isActiveStockCheckStatus(
  status: string
): status is (typeof ACTIVE_CHECK_STATUSES)[number] {
  return (ACTIVE_CHECK_STATUSES as readonly string[]).includes(status);
}

/** Returns power ids that are currently frozen (optionally excluding one session). */
export async function findFrozenCatalogPowerIds(
  powerIds: string[],
  opts?: { exceptSessionId?: string | null; client?: DbClient }
): Promise<string[]> {
  if (powerIds.length === 0) return [];
  const db = opts?.client ?? prisma;
  const lines = await db.catalogStockCheckLine.findMany({
    where: {
      lensProductPowerId: { in: powerIds },
      session: {
        status: { in: [...ACTIVE_CHECK_STATUSES] },
        ...(opts?.exceptSessionId
          ? { id: { not: opts.exceptSessionId } }
          : {}),
      },
    },
    select: { lensProductPowerId: true },
    distinct: ["lensProductPowerId"],
  });
  return lines.map((l) => l.lensProductPowerId);
}

export async function assertCatalogPowersNotFrozen(
  powerIds: string[],
  opts?: { exceptSessionId?: string | null; client?: DbClient }
): Promise<void> {
  const frozen = await findFrozenCatalogPowerIds(powerIds, opts);
  if (frozen.length === 0) return;
  throw new CatalogStockFreezeError(
    `Stock leaf is frozen by an open stock check. Finish or cancel the count before changing on-hand.`,
    409,
    "LEAF_FROZEN",
    { powerIds: frozen }
  );
}

export async function getActiveFreezeForPower(
  powerId: string,
  client: DbClient = prisma
): Promise<{ sessionId: string; publicId: string; status: string } | null> {
  const line = await client.catalogStockCheckLine.findFirst({
    where: {
      lensProductPowerId: powerId,
      session: { status: { in: [...ACTIVE_CHECK_STATUSES] } },
    },
    select: {
      session: { select: { id: true, publicId: true, status: true } },
    },
  });
  if (!line) return null;
  return {
    sessionId: line.session.id,
    publicId: line.session.publicId,
    status: line.session.status,
  };
}
