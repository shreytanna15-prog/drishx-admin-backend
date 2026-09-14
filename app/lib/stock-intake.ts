import { prisma } from "./prisma";
import {
  AuditAction,
  AuditModule,
  recordAuditEvent,
} from "./audit";
import {
  ExpenseCategory,
  LedgerEntryType,
  LensType,
  Prisma,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";

type DbClient = Prisma.TransactionClient | typeof prisma;

const LENS_TYPES: LensType[] = [
  LensType.SINGLE_VISION,
  LensType.KRYPTOK,
  LensType.PROGRESSIVE,
];

export type StockIntakeItemInput = {
  lensType: LensType;
  lensId: string;
  quantityAdded: number;
  /** Total purchase amount for this line (procurement expense). */
  amount: number;
  /** Unit cost stored on the lens record. */
  costPrice: number;
  /** Customer selling price stored on the lens record. */
  sellingPrice: number;
  description?: string;
};

export async function applyStockIntake(
  lensType: LensType,
  lensId: string,
  quantityAdded: number,
  costPrice: number,
  sellingPrice: number,
  client: DbClient = prisma
) {
  if (quantityAdded <= 0) {
    throw new Error("quantityAdded must be greater than 0.");
  }
  if (!Number.isFinite(costPrice) || costPrice < 0) {
    throw new Error("costPrice must be a valid non-negative number.");
  }
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
    throw new Error("sellingPrice must be greater than 0.");
  }

  const priceData = {
    quantity: { increment: quantityAdded },
    costPrice,
    price: sellingPrice,
  };

  if (lensType === LensType.SINGLE_VISION) {
    const lens = await client.singleVisionLens.findUnique({ where: { id: lensId } });
    if (!lens) throw new Error("Lens not found.");
    return client.singleVisionLens.update({
      where: { id: lensId },
      data: priceData,
    });
  }

  if (lensType === LensType.KRYPTOK) {
    const lens = await client.kryptokLens.findUnique({ where: { id: lensId } });
    if (!lens) throw new Error("Lens not found.");
    return client.kryptokLens.update({
      where: { id: lensId },
      data: priceData,
    });
  }

  if (lensType === LensType.PROGRESSIVE) {
    const lens = await client.progressiveLens.findUnique({ where: { id: lensId } });
    if (!lens) throw new Error("Lens not found.");
    return client.progressiveLens.update({
      where: { id: lensId },
      data: priceData,
    });
  }

  throw new Error("Invalid lens type.");
}

/** @deprecated Use applyStockIntake — kept for single-item path compatibility */
export async function incrementLensStock(
  lensType: LensType,
  lensId: string,
  quantityAdded: number,
  client: DbClient = prisma
) {
  const lens =
    lensType === LensType.SINGLE_VISION
      ? await client.singleVisionLens.findUnique({ where: { id: lensId } })
      : lensType === LensType.KRYPTOK
        ? await client.kryptokLens.findUnique({ where: { id: lensId } })
        : await client.progressiveLens.findUnique({ where: { id: lensId } });

  if (!lens) throw new Error("Lens not found.");

  const cost = lens.costPrice !== null ? Number(lens.costPrice) : Number(lens.price);
  const sell = Number(lens.price);

  return applyStockIntake(lensType, lensId, quantityAdded, cost, sell, client);
}

export function validateStockIntakeItem(item: StockIntakeItemInput): string | null {
  if (!LENS_TYPES.includes(item.lensType)) {
    return "Invalid lensType.";
  }
  if (!item.lensId) {
    return "lensId is required.";
  }
  if (!Number.isInteger(item.quantityAdded) || item.quantityAdded <= 0) {
    return "quantityAdded must be a positive whole number.";
  }
  if (!Number.isFinite(item.amount) || item.amount <= 0) {
    return "amount must be greater than 0.";
  }
  if (!Number.isFinite(item.costPrice) || item.costPrice < 0) {
    return "costPrice must be a valid non-negative number.";
  }
  if (!Number.isFinite(item.sellingPrice) || item.sellingPrice <= 0) {
    return "sellingPrice must be greater than 0.";
  }
  return null;
}

export async function processStockIntakeBatch(
  items: StockIntakeItemInput[],
  userId: string,
  batchNotes?: string
) {
  for (const item of items) {
    const error = validateStockIntakeItem(item);
    if (error) {
      throw new Error(error);
    }
  }

  const batchRef = `PROC-BATCH-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  return prisma.$transaction(async (tx) => {
    const results: {
      transaction: Awaited<ReturnType<typeof tx.transaction.create>>;
      lens: Awaited<ReturnType<typeof applyStockIntake>>;
    }[] = [];

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const updatedLens = await applyStockIntake(
        item.lensType,
        item.lensId,
        item.quantityAdded,
        item.costPrice,
        item.sellingPrice,
        tx
      );
      const lensLabel = formatLensStockLabel(item.lensType, updatedLens);
      const lineDescription =
        item.description?.trim() ||
        `Stock intake: ${lensLabel} (+${item.quantityAdded} units, cost ₹${item.costPrice}/unit, sell ₹${item.sellingPrice}, new qty ${updatedLens.quantity})`;
      const expenseDescription = batchNotes?.trim()
        ? `${lineDescription} | ${batchNotes.trim()}`
        : lineDescription;

      const reference = items.length > 1 ? `${batchRef}-${index + 1}` : batchRef;

      const newTransaction = await tx.transaction.create({
        data: {
          reference,
          amount: item.amount,
          currency: "INR",
          type: TransactionType.DEBIT,
          status: TransactionStatus.COMPLETED,
          description: expenseDescription,
          category: ExpenseCategory.PROCUREMENT,
          userId,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          transactionId: newTransaction.id,
          entryType: LedgerEntryType.DEBIT,
          amount: item.amount,
          description: expenseDescription,
        },
      });

      results.push({ transaction: newTransaction, lens: updatedLens });
    }

    for (const item of items) {
      await recordAuditEvent(tx, {
        action: AuditAction.STOCK_RECEIVED,
        module: AuditModule.INVENTORY,
        entityType: "LensSku",
        entityId: item.lensId,
        actor: { actorType: "HUMAN", actorUserId: userId, actorName: null },
        context: {
          lensType: item.lensType,
          quantityAdded: item.quantityAdded,
          batchReference: batchRef,
        },
        relatedRefs: { batchReference: batchRef },
        activityMessage: `Stock intake +${item.quantityAdded} (${batchRef})`,
      });
    }

    return {
      batchReference: batchRef,
      totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
      itemCount: items.length,
      results,
    };
  });
}

export function formatLensStockLabel(
  lensType: LensType,
  lens: {
    brand?: string | null;
    coating?: string | null;
    item?: string | null;
    sph?: unknown | null;
    cyl?: unknown | null;
    crossPower?: unknown | null;
    eye?: string | null;
  }
): string {
  const crossPower =
    lens.crossPower !== null && lens.crossPower !== undefined ? Number(lens.crossPower) : null;
  const parts = [
    lensType.replace(/_/g, " "),
    lens.brand,
    lens.coating,
    crossPower !== null && Number.isFinite(crossPower)
      ? `cross ${crossPower}`
      : lens.sph !== null && lens.sph !== undefined
        ? `SPH ${lens.sph}`
        : null,
    lens.cyl !== null && lens.cyl !== undefined ? `CYL ${lens.cyl}` : null,
    lens.eye ? `Eye ${lens.eye}` : null,
  ].filter(Boolean);

  return parts.join(" · ");
}
