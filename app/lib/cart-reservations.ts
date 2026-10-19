import { LensType, Prisma, type CartReservation, type Prisma as PrismaTypes } from "@prisma/client";
import { CartLineType } from "./cart-line-type";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { resolveLensForOrder } from "./resolve-lens-stock";
import { getLensQuantity, logStockDelta } from "./audit";

/** Cart lines expire after 7 days (cleanup only — no stock is held). */
export const CART_LINE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function reservationExpiresAt(from = Date.now()): Date {
  return new Date(from + CART_LINE_TTL_MS);
}

export async function decrementLensStock(
  lensType: LensType,
  lensId: string,
  quantity: number,
  audit?: {
    actorUserId?: string;
    actorName?: string;
    orderId?: string;
    movementType?: "STOCK_PICKED" | "STOCK_DECREMENTED";
    request?: import("./audit").AuditRequestContext | null;
  }
) {
  if (quantity <= 0) return;
  const before = (await getLensQuantity(prisma, lensType, lensId)) ?? 0;
  if (lensType === LensType.SINGLE_VISION) {
    await prisma.singleVisionLens.update({
      where: { id: lensId },
      data: { quantity: { decrement: quantity } },
    });
  } else if (lensType === LensType.KRYPTOK) {
    await prisma.kryptokLens.update({
      where: { id: lensId },
      data: { quantity: { decrement: quantity } },
    });
  } else if (lensType === LensType.PROGRESSIVE) {
    await prisma.progressiveLens.update({
      where: { id: lensId },
      data: { quantity: { decrement: quantity } },
    });
  }

  if (audit) {
    await logStockDelta({
      lensType,
      lensId,
      quantityDelta: -quantity,
      quantityBefore: before,
      quantityAfter: before - quantity,
      movementType: audit.movementType ?? "STOCK_DECREMENTED",
      actorUserId: audit.actorUserId,
      actorName: audit.actorName,
      orderId: audit.orderId,
      request: audit.request,
    });
  }
}

export async function incrementLensStock(
  lensType: LensType,
  lensId: string,
  quantity: number,
  audit?: {
    actorUserId?: string;
    actorName?: string;
    orderId?: string;
    movementType?: "STOCK_RESTORED" | "STOCK_INCREMENTED" | "STOCK_RECEIVED";
    referenceId?: string;
    request?: import("./audit").AuditRequestContext | null;
  },
  db: typeof prisma | import("@prisma/client").Prisma.TransactionClient = prisma
) {
  if (quantity <= 0) return;
  const before = (await getLensQuantity(db, lensType, lensId)) ?? 0;
  if (lensType === LensType.SINGLE_VISION) {
    await db.singleVisionLens.update({
      where: { id: lensId },
      data: { quantity: { increment: quantity } },
    });
  } else if (lensType === LensType.KRYPTOK) {
    await db.kryptokLens.update({
      where: { id: lensId },
      data: { quantity: { increment: quantity } },
    });
  } else if (lensType === LensType.PROGRESSIVE) {
    await db.progressiveLens.update({
      where: { id: lensId },
      data: { quantity: { increment: quantity } },
    });
  }

  if (audit) {
    await logStockDelta({
      lensType,
      lensId,
      quantityDelta: quantity,
      quantityBefore: before,
      quantityAfter: before + quantity,
      movementType: audit.movementType ?? "STOCK_INCREMENTED",
      actorUserId: audit.actorUserId,
      actorName: audit.actorName,
      orderId: audit.orderId,
      referenceId: audit.referenceId,
      request: audit.request,
      // Keep stock movement + audit inside the same cancel/archive transaction.
      client: db,
    });
  }
}

/** Release legacy cart stock holds and delete the row. */
export async function releaseCartReservation(
  reservation: Pick<CartReservation, "lensType" | "lensId" | "reservedQuantity">
) {
  if (reservation.reservedQuantity <= 0) {
    return;
  }

  try {
    await incrementLensStock(
      reservation.lensType,
      reservation.lensId,
      reservation.reservedQuantity
    );
  } catch (error) {
    const isMissingLens =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025";

    if (isMissingLens) {
      console.warn(
        "releaseCartReservation: lens missing, skipping stock restore",
        reservation.lensType,
        reservation.lensId
      );
      return;
    }

    throw error;
  }
}

export async function releaseExpiredReservations(): Promise<number> {
  const now = new Date();
  const expired = await prisma.cartReservation.findMany({
    where: { expiresAt: { lt: now } },
  });

  for (const row of expired) {
    await releaseCartReservation(row);
  }

  if (expired.length > 0) {
    await prisma.cartReservation.deleteMany({
      where: { id: { in: expired.map((row) => row.id) } },
    });
  }

  return expired.length;
}

export async function releaseUserReservations(userId: string) {
  const rows = await prisma.cartReservation.findMany({
    where: { userId },
    select: {
      id: true,
      lensType: true,
      lensId: true,
      reservedQuantity: true,
    },
  });

  for (const row of rows) {
    try {
      await releaseCartReservation(row);
    } catch (error) {
      console.warn("releaseUserReservations: failed to release row", row.id, error);
    }
  }

  await prisma.cartReservation.deleteMany({ where: { userId } });
}

export type UpsertCartReservationInput = {
  userId: string;
  lensType: LensType;
  lensId: string;
  cartLineKey: string;
  quantity: number;
  unitPrice: number;
  lineType?: CartLineType;
  wholesaleSpec?: Prisma.InputJsonValue | null;
  sph?: number | null;
  cyl?: number | null;
  add?: number | null;
  axis?: number | null;
  eye?: string | null;
  brand?: string | null;
  coating?: string | null;
  item?: string | null;
  lensTypeLabel?: string | null;
};

/** Persist a cart line without reserving or decrementing inventory. */
export async function upsertCartReservation(input: UpsertCartReservationInput): Promise<CartReservation> {
  const [row] = await bulkUpsertCartReservations([input], { releaseExpired: true });
  return row!;
}

/** Fast path for a single wholesale batch — skips global expiry sweep and bulk wrapper. */
export async function upsertWholesaleCartReservation(
  input: UpsertCartReservationInput
): Promise<CartReservation> {
  const expiresAt = reservationExpiresAt();
  return upsertCartReservationDirect(input.userId, input, expiresAt);
}

function buildCartReservationPayload(
  input: UpsertCartReservationInput,
  expiresAt: Date
): Omit<PrismaTypes.CartReservationCreateInput, "user"> {
  const {
    lensType,
    lensId,
    cartLineKey,
    quantity,
    unitPrice,
    lineType,
    wholesaleSpec,
    sph,
    cyl,
    add,
    axis,
    eye,
    brand,
    coating,
    item,
    lensTypeLabel,
  } = input;

  return {
    lensType,
    lensId,
    cartLineKey,
    lineType: lineType ?? CartLineType.RETAIL,
    wholesaleSpec: wholesaleSpec ?? undefined,
    quantity,
    reservedQuantity: 0,
    unitPrice,
    sph: sph ?? null,
    cyl: cyl ?? null,
    add: add ?? null,
    axis: axis ?? null,
    eye: eye ?? null,
    brand: brand ?? null,
    coating: coating ?? null,
    item: item ?? null,
    lensTypeLabel: lensTypeLabel ?? null,
    expiresAt,
  };
}

async function upsertCartReservationDirect(
  userId: string,
  input: UpsertCartReservationInput,
  expiresAt: Date
): Promise<CartReservation> {
  const payload = buildCartReservationPayload(input, expiresAt);

  try {
    return await prisma.cartReservation.upsert({
      where: { userId_cartLineKey: { userId, cartLineKey: input.cartLineKey } },
      create: {
        ...payload,
        user: { connect: { id: userId } },
      },
      update: payload,
    });
  } catch (error) {
    const isUniqueViolation =
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002";

    if (!isUniqueViolation) {
      throw error;
    }

    return prisma.cartReservation.update({
      where: { userId_cartLineKey: { userId, cartLineKey: input.cartLineKey } },
      data: payload,
    });
  }
}

/** One SQL round-trip for many cart lines (wholesale grids). */
async function bulkSqlUpsertCartReservations(
  userId: string,
  lines: UpsertCartReservationInput[],
  expiresAt: Date
): Promise<void> {
  const now = new Date();
  const tuples = lines.map((line) => {
    const payload = buildCartReservationPayload(line, expiresAt);
    return Prisma.sql`(
      ${randomUUID()},
      ${userId},
      ${line.lensType}::"LensType",
      ${line.lensId},
      ${line.cartLineKey},
      ${payload.lineType}::"CartLineType",
      ${payload.wholesaleSpec ?? null},
      ${payload.quantity},
      ${0},
      ${payload.unitPrice},
      ${payload.sph},
      ${payload.cyl},
      ${payload.add},
      ${payload.axis},
      ${payload.eye},
      ${payload.brand},
      ${payload.coating},
      ${payload.item},
      ${payload.lensTypeLabel},
      ${payload.expiresAt},
      ${now},
      ${now}
    )`;
  });

  await prisma.$executeRaw`
    INSERT INTO "CartReservation" (
      "id",
      "userId",
      "lensType",
      "lensId",
      "cartLineKey",
      "lineType",
      "wholesaleSpec",
      "quantity",
      "reservedQuantity",
      "unitPrice",
      "sph",
      "cyl",
      "add",
      "axis",
      "eye",
      "brand",
      "coating",
      "item",
      "lensTypeLabel",
      "expiresAt",
      "createdAt",
      "updatedAt"
    )
    VALUES ${Prisma.join(tuples)}
    ON CONFLICT ("userId", "cartLineKey") DO UPDATE SET
      "lensType" = EXCLUDED."lensType",
      "lensId" = EXCLUDED."lensId",
      "lineType" = EXCLUDED."lineType",
      "wholesaleSpec" = EXCLUDED."wholesaleSpec",
      "quantity" = EXCLUDED."quantity",
      "reservedQuantity" = 0,
      "unitPrice" = EXCLUDED."unitPrice",
      "sph" = EXCLUDED."sph",
      "cyl" = EXCLUDED."cyl",
      "add" = EXCLUDED."add",
      "axis" = EXCLUDED."axis",
      "eye" = EXCLUDED."eye",
      "brand" = EXCLUDED."brand",
      "coating" = EXCLUDED."coating",
      "item" = EXCLUDED."item",
      "lensTypeLabel" = EXCLUDED."lensTypeLabel",
      "expiresAt" = EXCLUDED."expiresAt",
      "updatedAt" = EXCLUDED."updatedAt"
  `;
}

export const BULK_CART_MAX_LINES = 200;

export async function bulkUpsertCartReservations(
  lines: UpsertCartReservationInput[],
  options?: { releaseExpired?: boolean; skipReturnRows?: boolean }
): Promise<CartReservation[]> {
  if (lines.length === 0) {
    return [];
  }

  if (lines.length > BULK_CART_MAX_LINES) {
    throw new Error(`Cannot add more than ${BULK_CART_MAX_LINES} cart lines at once.`);
  }

  const userId = lines[0]!.userId;
  if (!lines.every((line) => line.userId === userId)) {
    throw new Error("All cart lines must belong to the same user.");
  }

  for (const line of lines) {
    if (line.quantity <= 0) {
      throw new Error("Quantity must be at least 1.");
    }
  }

  if (options?.releaseExpired !== false) {
    await releaseExpiredReservations();
  }

  const lensRefs = new Map<string, { lensType: LensType; lensId: string; quantity: number }>();
  for (const line of lines) {
    const key = `${line.lensType}:${line.lensId}`;
    const existing = lensRefs.get(key);
    if (!existing || line.quantity > existing.quantity) {
      lensRefs.set(key, {
        lensType: line.lensType,
        lensId: line.lensId,
        quantity: line.quantity,
      });
    }
  }

  for (const ref of lensRefs.values()) {
    const lens = await resolveLensForOrder(ref.lensType, 1, ref.lensId);
    if (!lens) {
      throw new Error("Lens not found.");
    }
  }

  const expiresAt = reservationExpiresAt();
  const cartLineKeys = lines.map((line) => line.cartLineKey);

  const existingRows = await prisma.cartReservation.findMany({
    where: { userId, cartLineKey: { in: cartLineKeys } },
    select: {
      lensType: true,
      lensId: true,
      reservedQuantity: true,
    },
  });

  for (const existing of existingRows) {
    if (existing.reservedQuantity > 0) {
      await releaseCartReservation(existing);
    }
  }

  if (lines.length === 1) {
    return [await upsertCartReservationDirect(userId, lines[0]!, expiresAt)];
  }

  await bulkSqlUpsertCartReservations(userId, lines, expiresAt);

  if (options?.skipReturnRows) {
    return [];
  }

  return prisma.cartReservation.findMany({
    where: { userId, cartLineKey: { in: cartLineKeys } },
  });
}

export function lensOnHandKey(lensType: LensType, lensId: string): string {
  return `${lensType}:${lensId}`;
}

/** Batch-fetch on-hand quantities for cart display (avoids N+1 per line). */
export async function batchGetLensOnHand(
  refs: Array<{ lensType: LensType; lensId: string }>
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const svIds = new Set<string>();
  const kryptokIds = new Set<string>();
  const progressiveIds = new Set<string>();

  for (const ref of refs) {
    if (ref.lensType === LensType.SINGLE_VISION) {
      svIds.add(ref.lensId);
    } else if (ref.lensType === LensType.KRYPTOK) {
      kryptokIds.add(ref.lensId);
    } else if (ref.lensType === LensType.PROGRESSIVE) {
      progressiveIds.add(ref.lensId);
    }
  }

  if (svIds.size > 0) {
    const rows = await prisma.singleVisionLens.findMany({
      where: { id: { in: [...svIds] } },
      select: { id: true, quantity: true },
    });
    for (const row of rows) {
      map.set(lensOnHandKey(LensType.SINGLE_VISION, row.id), Math.max(0, row.quantity));
    }
  }

  if (kryptokIds.size > 0) {
    const rows = await prisma.kryptokLens.findMany({
      where: { id: { in: [...kryptokIds] } },
      select: { id: true, quantity: true },
    });
    for (const row of rows) {
      map.set(lensOnHandKey(LensType.KRYPTOK, row.id), Math.max(0, row.quantity));
    }
  }

  if (progressiveIds.size > 0) {
    const rows = await prisma.progressiveLens.findMany({
      where: { id: { in: [...progressiveIds] } },
      select: { id: true, quantity: true },
    });
    for (const row of rows) {
      map.set(lensOnHandKey(LensType.PROGRESSIVE, row.id), Math.max(0, row.quantity));
    }
  }

  return map;
}

export async function deleteCartReservation(userId: string, cartLineKey: string): Promise<boolean> {
  const existing = await prisma.cartReservation.findUnique({
    where: { userId_cartLineKey: { userId, cartLineKey } },
  });
  if (!existing) {
    return false;
  }

  try {
    await releaseCartReservation(existing);
  } catch (error) {
    console.warn("deleteCartReservation: failed to release stock", cartLineKey, error);
  }

  await prisma.cartReservation.delete({ where: { id: existing.id } });
  return true;
}

/** Remove cart line after checkout — no stock change. */
export async function consumeCartReservation(userId: string, cartLineKey: string) {
  await prisma.cartReservation.deleteMany({
    where: { userId, cartLineKey },
  });
}

export function mapReservationToCartItem(row: CartReservation, lensOnHand = 0) {
  return {
    id: row.lensId,
    cartLineId: row.cartLineKey,
    cartLineKey: row.cartLineKey,
    lineType: row.lineType,
    wholesaleSpec: row.wholesaleSpec,
    cartQuantity: row.quantity,
    reservedQuantity: 0,
    isBackorder: false,
    price: Number(row.unitPrice),
    sph: row.sph !== null ? Number(row.sph) : 0,
    cyl: row.cyl !== null ? Number(row.cyl) : null,
    add: row.add !== null ? Number(row.add) : null,
    axis: row.axis,
    eye: row.eye,
    brand: row.brand,
    item: row.item,
    coating: row.coating,
    lensType: row.lensTypeLabel,
    quantity: lensOnHand,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getLensOnHand(lensType: LensType, lensId: string): Promise<number> {
  const map = await batchGetLensOnHand([{ lensType, lensId }]);
  return map.get(lensOnHandKey(lensType, lensId)) ?? 0;
}
