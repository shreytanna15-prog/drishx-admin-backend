import {
  LensType,
  OrderStatus,
  TransactionStatus,
  TransactionType,
  LedgerEntryType,
  Prisma,
  type CartReservation,
} from "@prisma/client";
import { CartLineType } from "./cart-line-type";
import { orderTotalFromPairPrice } from "./lens-pricing";
import { getCommittedQuantity } from "./order-inventory";
import { generateUniqueOrderNumbers } from "./order-numbers";
import { dispatchSlotForNow } from "./dispatch-cutoff";
import { prisma } from "./prisma";
import { resolveLensForOrder } from "./resolve-lens-stock";
import { notifyStaffOfNewOrder } from "./staff-notifications";
import {
  assignmentCreateFields,
  resolveOrderAssigneeId,
} from "./assign-order-to-employee";
import type { WholesaleExpandedLine } from "./wholesale-cart";
import { createInvoiceFromOrder } from "./finance/create-invoice-from-order";
import {
  applyOrderRedemption,
  resolveCheckoutRedemption,
} from "./loyalty/redeem";

export type WholesaleCheckoutBatchInput = {
  cartRows: CartReservation[];
  expanded?: WholesaleExpandedLine[] | null;
};

export type WholesaleCheckoutContext = {
  actingUserId: string;
  resolvedUserId: string;
  checkoutBatchId: string;
  orderNotes: string | null;
  customerLabel: string;
  /** X Points to redeem against the first order in this checkout batch. */
  redeemPoints?: number | null;
  deliveryServiceId?: string | null;
};

export type WholesaleCheckoutBatchResult = {
  successCount: number;
  procurementCount: number;
  lineItemCount: number;
  failures: string[];
  firstOrderId: string | null;
  consumedCartLineKeys: string[];
};

type PreparedLine = {
  powerKey: string;
  lensType: LensType;
  resolvedLensId: string;
  unitPrice: number;
  quantity: number;
  reservedQuantity: number;
  needsProcurement: boolean;
  totalAmount: number;
  sph: number;
  cyl: number | null;
  axis: number | null;
  add: number | null;
  label: string;
};

type PreparedBatch = {
  cartRows: CartReservation[];
  lines: PreparedLine[];
  totalQuantity: number;
  totalReservedQuantity: number;
  totalAmount: number;
  hasProcurement: boolean;
};

function lensFk(
  lensType: LensType,
  resolvedLensId: string
): {
  singleVisionLensId: string | null;
  kryptokLensId: string | null;
  progressiveLensId: string | null;
} {
  return {
    singleVisionLensId: lensType === LensType.SINGLE_VISION ? resolvedLensId : null,
    kryptokLensId: lensType === LensType.KRYPTOK ? resolvedLensId : null,
    progressiveLensId: lensType === LensType.PROGRESSIVE ? resolvedLensId : null,
  };
}

async function prepareLegacyBatchLines(
  cartRow: CartReservation,
  expanded: WholesaleExpandedLine[]
): Promise<{ lines: PreparedLine[]; failures: string[] }> {
  const failures: string[] = [];
  const lens = await resolveLensForOrder(cartRow.lensType, 1, cartRow.lensId);
  if (!lens) {
    return {
      lines: [],
      failures: [`${cartRow.brand ?? "Product"}: lens not found.`],
    };
  }

  const resolvedLensId = lens.id;
  const unitPrice = Number(lens.price);
  const onHand = Math.max(0, lens.quantity);
  const committed = await getCommittedQuantity(cartRow.lensType, resolvedLensId);
  let runningReserved = 0;

  const lines: PreparedLine[] = [];

  for (const line of expanded) {
    const quantity = line.pieces;
    const available = Math.max(0, onHand - committed - runningReserved);
    const reservedQuantity = Math.min(quantity, available);
    const needsProcurement = reservedQuantity < quantity;
    runningReserved += reservedQuantity;

    lines.push({
      powerKey: line.key,
      lensType: cartRow.lensType,
      resolvedLensId,
      unitPrice,
      quantity,
      reservedQuantity,
      needsProcurement,
      totalAmount: orderTotalFromPairPrice(unitPrice, quantity),
      sph: line.sph,
      cyl: line.cyl,
      axis: line.axis,
      add: line.add,
      label: `${cartRow.brand ?? "Product"} SPH ${line.sph} CYL ${line.cyl ?? "—"}`,
    });
  }

  return { lines, failures };
}

async function prepareGroupedCartRows(
  cartRows: CartReservation[]
): Promise<{ lines: PreparedLine[]; failures: string[] }> {
  const firstRow = cartRows[0];
  if (!firstRow) {
    return { lines: [], failures: ["Wholesale cart rows are missing."] };
  }

  const lens = await resolveLensForOrder(firstRow.lensType, 1, firstRow.lensId);
  if (!lens) {
    return {
      lines: [],
      failures: [`${firstRow.brand ?? "Product"}: lens not found.`],
    };
  }

  const resolvedLensId = lens.id;
  const unitPrice = Number(lens.price);
  const onHand = Math.max(0, lens.quantity);
  const committed = await getCommittedQuantity(firstRow.lensType, resolvedLensId);
  let runningReserved = 0;

  const lines: PreparedLine[] = [];
  for (const row of cartRows) {
    const quantity = row.quantity;
    const available = Math.max(0, onHand - committed - runningReserved);
    const reservedQuantity = Math.min(quantity, available);
    const needsProcurement = reservedQuantity < quantity;
    runningReserved += reservedQuantity;

    lines.push({
      powerKey: row.cartLineKey,
      lensType: row.lensType,
      resolvedLensId,
      unitPrice,
      quantity,
      reservedQuantity,
      needsProcurement,
      totalAmount: orderTotalFromPairPrice(unitPrice, quantity),
      sph: row.sph !== null ? Number(row.sph) : 0,
      cyl: row.cyl !== null ? Number(row.cyl) : null,
      axis: row.axis !== null ? Number(row.axis) : null,
      add: row.add !== null ? Number(row.add) : null,
      label: `${row.brand ?? "Product"} SPH ${row.sph ?? "0"} CYL ${row.cyl ?? "—"}`,
    });
  }

  return { lines, failures: [] };
}

export async function placeWholesaleCheckoutBatches(
  batches: WholesaleCheckoutBatchInput[],
  context: WholesaleCheckoutContext
): Promise<WholesaleCheckoutBatchResult> {
  const preparedBatches: PreparedBatch[] = [];
  const failures: string[] = [];
  const consumedCartLineKeys: string[] = [];

  const prepResults = await Promise.all(
    batches.map((batch) => {
      if (batch.expanded?.length) {
        return prepareLegacyBatchLines(batch.cartRows[0]!, batch.expanded);
      }
      return prepareGroupedCartRows(batch.cartRows);
    })
  );

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index]!;
    const { lines, failures: prepFailures } = prepResults[index]!;
    if (prepFailures.length > 0 || lines.length === 0) {
      failures.push(...prepFailures);
      continue;
    }

    preparedBatches.push({
      cartRows: batch.cartRows,
      lines,
      totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
      totalReservedQuantity: lines.reduce(
        (sum, line) => sum + line.reservedQuantity,
        0
      ),
      totalAmount: lines.reduce((sum, line) => sum + line.totalAmount, 0),
      hasProcurement: lines.some((line) => line.needsProcurement),
    });
    consumedCartLineKeys.push(...batch.cartRows.map((row) => row.cartLineKey));
  }

  if (preparedBatches.length === 0) {
    return {
      successCount: 0,
      procurementCount: 0,
      lineItemCount: 0,
      failures,
      firstOrderId: null,
      consumedCartLineKeys: [],
    };
  }

  const orderNumbers = await generateUniqueOrderNumbers(preparedBatches.length);
  const batchReference = `ORD-BATCH-${Date.now()}`;
  let firstOrderId: string | null = null;
  let successCount = 0;
  let procurementCount = 0;
  let lineItemCount = 0;
  const assignedToId = await resolveOrderAssigneeId({
    checkoutBatchId: context.checkoutBatchId,
  });
  const cutoffSlot = await dispatchSlotForNow();

  await prisma.$transaction(
    async (tx) => {
      for (let index = 0; index < preparedBatches.length; index += 1) {
        const batch = preparedBatches[index]!;
        const orderNumber = orderNumbers[index]!;
        const orderReference = `${batchReference}-${index + 1}`;
        const primaryRow = batch.cartRows[0]!;
        const wholesaleSpecValue = primaryRow.wholesaleSpec;

        const newTransaction = await tx.transaction.create({
          data: {
            reference: orderReference,
            amount: batch.totalAmount,
            currency: "INR",
            type: TransactionType.CREDIT,
            status: TransactionStatus.COMPLETED,
            description: `Sale for order: ${orderReference}`,
            userId: context.actingUserId,
          },
        });

        await tx.ledgerEntry.create({
          data: {
            transactionId: newTransaction.id,
            entryType: LedgerEntryType.CREDIT,
            amount: batch.totalAmount,
            description: `Sale for order: ${orderReference}`,
          },
        });

        const orderData: Prisma.OrderUncheckedCreateInput = {
          orderNumber,
          checkoutBatchId: context.checkoutBatchId,
          userId: context.resolvedUserId,
          ...assignmentCreateFields(assignedToId),
          lineType: CartLineType.WHOLESALE,
          wholesaleSpec:
            wholesaleSpecValue === null || wholesaleSpecValue === undefined
              ? Prisma.JsonNull
              : (wholesaleSpecValue as Prisma.InputJsonValue),
          lensType: primaryRow.lensType,
          ...lensFk(primaryRow.lensType, batch.lines[0]!.resolvedLensId),
          quantity: batch.totalQuantity,
          reservedQuantity: batch.totalReservedQuantity,
          pickedQuantity: 0,
          unitPrice: Number(primaryRow.unitPrice),
          totalAmount: batch.totalAmount,
          sph: null,
          cyl: null,
          axis: null,
          add: null,
          eye: null,
          status: batch.hasProcurement
            ? OrderStatus.AWAITING_PROCUREMENT
            : OrderStatus.PENDING,
          notes: context.orderNotes,
          transactionId: newTransaction.id,
          deliveryServiceId: context.deliveryServiceId ?? null,
          ...cutoffSlot,
        };

        const newOrder = await tx.order.create({
          data: orderData,
        });

        await tx.wholesaleOrderLineItem.createMany({
          data: batch.lines.map((line) => ({
            orderId: newOrder.id,
            powerKey: line.powerKey,
            quantity: line.quantity,
            reservedQuantity: line.reservedQuantity,
            unitPrice: line.unitPrice,
            totalAmount: line.totalAmount,
            sph: line.sph,
            cyl: line.cyl,
            axis: line.axis,
            add: line.add,
            needsProcurement: line.needsProcurement,
          })),
        });

        const applyRedemption = index === 0;
        const redemption = applyRedemption
          ? await resolveCheckoutRedemption({
              customerId: context.resolvedUserId,
              redeemPoints: context.redeemPoints,
              orderGross: batch.totalAmount,
              db: tx,
            })
          : { loyaltyDiscount: 0 };
        if (redemption.error) {
          throw new Error(redemption.error);
        }

        const { invoiceId } = await createInvoiceFromOrder({
          orderId: newOrder.id,
          markPaid: newOrder.status === OrderStatus.COMPLETED,
          loyaltyDiscount: redemption.loyaltyDiscount,
          tx,
        });

        await applyOrderRedemption({
          customerId: context.resolvedUserId,
          orderId: newOrder.id,
          invoiceId,
          loyaltyDiscount: redemption.loyaltyDiscount,
          db: tx,
        });

        if (!firstOrderId) {
          firstOrderId = newOrder.id;
        }
        successCount += 1;
        procurementCount += batch.lines.filter((line) => line.needsProcurement).length;
        lineItemCount += batch.lines.length;
      }
    },
    {
      maxWait: 30_000,
      timeout: 120_000,
    }
  );

  if (firstOrderId) {
    await notifyStaffOfNewOrder(
      firstOrderId,
      `${context.customerLabel} (wholesale batch)`,
      assignedToId
    );
  }

  return {
    successCount,
    procurementCount,
    lineItemCount,
    failures,
    firstOrderId,
    consumedCartLineKeys,
  };
}
