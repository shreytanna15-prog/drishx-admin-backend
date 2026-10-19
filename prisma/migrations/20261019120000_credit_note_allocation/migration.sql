-- Phase 4A: durable per-invoice credit note allocations.
-- Historical CreditNote rows remain valid with zero allocation children (no backfill).

CREATE TABLE IF NOT EXISTS "CreditNoteAllocation" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "taxableAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNoteAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CreditNoteAllocation_creditNoteId_invoiceId_key"
  ON "CreditNoteAllocation"("creditNoteId", "invoiceId");

CREATE INDEX IF NOT EXISTS "CreditNoteAllocation_creditNoteId_idx"
  ON "CreditNoteAllocation"("creditNoteId");

CREATE INDEX IF NOT EXISTS "CreditNoteAllocation_invoiceId_idx"
  ON "CreditNoteAllocation"("invoiceId");

ALTER TABLE "CreditNoteAllocation"
  ADD CONSTRAINT "CreditNoteAllocation_creditNoteId_fkey"
  FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditNoteAllocation"
  ADD CONSTRAINT "CreditNoteAllocation_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
