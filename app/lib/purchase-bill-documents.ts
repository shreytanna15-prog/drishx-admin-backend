import { prisma } from "./prisma";
import {
  AuditAction,
  AuditModule,
  type AuditActor,
  type AuditRequestContext,
  recordAuditEvent,
} from "./audit";
import {
  displayDocumentName,
  persistDocumentsThenRecord,
  ProcurementDocumentError,
  validateProcurementDocument,
  type DocumentStorage,
} from "./procurement-documents";
import { buildProcurementObjectPath } from "./procurement-storage";

/**
 * Attach (or replace) the supplier bill document on a purchase bill — the
 * manual path for bills that do not come through a PO receipt. The file is
 * stored privately first; the bill row is only updated after a successful
 * upload. A replaced document is removed from storage afterwards (best effort).
 */
export async function attachPurchaseBillDocument(input: {
  purchaseBillId: string;
  file: { buffer: Uint8Array; fileName: string | null };
  storage: DocumentStorage;
  actor: AuditActor;
  request?: AuditRequestContext | null;
}) {
  const type = validateProcurementDocument({ kind: "bill", ...input.file });
  const bill = await prisma.purchaseBill.findUnique({
    where: { id: input.purchaseBillId },
    select: { id: true, billNumber: true, documentStoragePath: true },
  });
  if (!bill) throw new ProcurementDocumentError("Purchase bill not found.", 404, "BILL_NOT_FOUND");

  const fileName = displayDocumentName(input.file.fileName, type.extension);
  const updated = await persistDocumentsThenRecord({
    storage: input.storage,
    documents: [
      {
        kind: "bill",
        buffer: input.file.buffer,
        mimeType: type.mimeType,
        fileName,
        objectPath: buildProcurementObjectPath({
          scope: "purchase-bills",
          ownerId: bill.id,
          kind: "bill-manual",
          fileName: input.file.fileName,
          extension: type.extension,
        }),
      },
    ],
    onCleanupError: (error, paths) =>
      console.error("Orphaned purchase bill document could not be removed:", paths, error),
    writeRecord: async ([doc]) =>
      prisma.purchaseBill.update({
        where: { id: bill.id },
        data: {
          documentStoragePath: doc!.objectPath,
          documentFileName: doc!.fileName,
          documentMimeType: doc!.mimeType,
        },
        select: { id: true, billNumber: true, documentFileName: true },
      }),
  });

  if (bill.documentStoragePath) {
    // Keep receipt-linked originals: only delete objects this flow created.
    const stillReferenced = await prisma.goodsReceipt.findFirst({
      where: { billStoragePath: bill.documentStoragePath },
      select: { id: true },
    });
    if (!stillReferenced) {
      await input.storage.remove([bill.documentStoragePath]).catch((error) =>
        console.error("Old purchase bill document could not be removed:", error)
      );
    }
  }

  await recordAuditEvent(prisma, {
    action: AuditAction.PURCHASE_BILL_DOCUMENT_ATTACHED,
    module: AuditModule.FINANCE,
    entityType: "PurchaseBill",
    entityId: bill.id,
    actor: input.actor,
    request: input.request ?? null,
    context: { billNumber: bill.billNumber, fileName, replaced: String(Boolean(bill.documentStoragePath)) },
    activityMessage: `Supplier bill document attached to ${bill.billNumber}`,
  });

  return updated;
}

export async function getPurchaseBillDocumentRef(purchaseBillId: string) {
  const bill = await prisma.purchaseBill.findUnique({
    where: { id: purchaseBillId },
    select: { documentStoragePath: true, documentFileName: true, billNumber: true },
  });
  if (!bill) throw new ProcurementDocumentError("Purchase bill not found.", 404, "BILL_NOT_FOUND");
  if (!bill.documentStoragePath) {
    throw new ProcurementDocumentError("No document is attached to this bill.", 404, "DOCUMENT_NOT_STORED");
  }
  return {
    objectPath: bill.documentStoragePath,
    fileName: bill.documentFileName ?? `${bill.billNumber.replace(/[^A-Za-z0-9_-]+/g, "_")}.pdf`,
  };
}
