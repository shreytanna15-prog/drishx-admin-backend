-- Finance & GST Billing foundation

-- Customer tax classification + credit limit
CREATE TYPE "CustomerTaxType" AS ENUM ('REGISTERED', 'UNREGISTERED', 'COMPOSITION', 'OTHER');
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "customerType" "CustomerTaxType" NOT NULL DEFAULT 'UNREGISTERED';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "creditLimit" DECIMAL(65,30);

-- Invoice status: migrate UNPAID/PAID → new enum
CREATE TYPE "InvoiceStatus_new" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID');
ALTER TABLE "Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE TEXT USING ("status"::text);
UPDATE "Invoice" SET "status" = 'ISSUED' WHERE "status" = 'UNPAID';
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE "InvoiceStatus_new" USING ("status"::"InvoiceStatus_new");
DROP TYPE "InvoiceStatus";
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'ISSUED';

-- Invoice GST columns
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "financialYear" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "placeOfSupplyState" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "placeOfSupplyCode" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "isInterState" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "taxIncomplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "grossAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "taxableAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "sgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "igstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "roundingAdjustment" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "amountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "amountOutstanding" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "companyGstin" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "companyLegalName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "companyState" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "companyStateCode" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "customerGstin" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "customerLegalName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "customerBillingState" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "customerTypeSnapshot" "CustomerTaxType";

-- Backfill outstanding from amount for existing rows
UPDATE "Invoice" SET
  "grossAmount" = "amount",
  "taxableAmount" = "amount",
  "amountOutstanding" = CASE WHEN "status" = 'PAID' THEN 0 ELSE "amount" END,
  "amountPaid" = CASE WHEN "status" = 'PAID' THEN "amount" ELSE 0 END,
  "issuedAt" = COALESCE("issuedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "Invoice_userId_status_idx" ON "Invoice"("userId", "status");
CREATE INDEX IF NOT EXISTS "Invoice_status_issuedAt_idx" ON "Invoice"("status", "issuedAt");
CREATE INDEX IF NOT EXISTS "Invoice_financialYear_idx" ON "Invoice"("financialYear");

CREATE TABLE IF NOT EXISTS "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "sku" TEXT,
    "lensType" TEXT,
    "lensId" TEXT,
    "powerLabel" TEXT,
    "hsnCode" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(65,30) NOT NULL,
    "gstRatePercent" DECIMAL(65,30) NOT NULL,
    "cgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");
CREATE INDEX IF NOT EXISTS "InvoiceLine_hsnCode_idx" ON "InvoiceLine"("hsnCode");
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditNote" ADD COLUMN IF NOT EXISTS "taxableAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "CreditNote" ADD COLUMN IF NOT EXISTS "cgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "CreditNote" ADD COLUMN IF NOT EXISTS "sgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "CreditNote" ADD COLUMN IF NOT EXISTS "igstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;

ALTER TABLE "CatalogProductLine" ADD COLUMN IF NOT EXISTS "hsnCode" TEXT;
ALTER TABLE "CatalogProductLine" ADD COLUMN IF NOT EXISTS "gstRatePercent" DECIMAL(65,30);

CREATE TABLE IF NOT EXISTS "CompanyFinanceSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "legalName" TEXT NOT NULL DEFAULT 'DrishX',
    "tradeName" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT NOT NULL DEFAULT 'Gujarat',
    "stateCode" TEXT NOT NULL DEFAULT '24',
    "pincode" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "invoiceSeriesPrefix" TEXT NOT NULL DEFAULT 'INV',
    "creditNotePrefix" TEXT NOT NULL DEFAULT 'CN',
    "purchaseBillPrefix" TEXT NOT NULL DEFAULT 'PB',
    "defaultHsnCode" TEXT NOT NULL DEFAULT '9001',
    "defaultGstRatePercent" DECIMAL(65,30) NOT NULL DEFAULT 5,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "invoiceFooterNotes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyFinanceSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CompanyFinanceSettings" ("id", "legalName", "state", "stateCode", "updatedAt")
VALUES ('default', 'DrishX', 'Gujarat', '24', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'BANK', 'CARD', 'CHEQUE', 'OTHER', 'CREDIT');
CREATE TYPE "PaymentClaimStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');
CREATE TYPE "PartyLedgerEntryType" AS ENUM ('OPENING', 'INVOICE', 'PAYMENT', 'CREDIT_NOTE', 'DEBIT_NOTE', 'ADVANCE', 'ADJUSTMENT');

CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "unallocatedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "claimId" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_paymentNumber_key" ON "Payment"("paymentNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_claimId_key" ON "Payment"("claimId");
CREATE INDEX IF NOT EXISTS "Payment_customerId_paidAt_idx" ON "Payment"("customerId", "paidAt");

CREATE TABLE IF NOT EXISTS "PaymentClaim" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "status" "PaymentClaimStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentClaim_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PaymentClaim_customerId_status_idx" ON "PaymentClaim"("customerId", "status");
CREATE INDEX IF NOT EXISTS "PaymentClaim_status_createdAt_idx" ON "PaymentClaim"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "PaymentClaimItem" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(65,30),
    CONSTRAINT "PaymentClaimItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentClaimItem_claimId_invoiceId_key" ON "PaymentClaimItem"("claimId", "invoiceId");

CREATE TABLE IF NOT EXISTS "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAllocation_paymentId_invoiceId_key" ON "PaymentAllocation"("paymentId", "invoiceId");
CREATE INDEX IF NOT EXISTS "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

CREATE TABLE IF NOT EXISTS "CustomerLedgerEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "entryType" "PartyLedgerEntryType" NOT NULL,
    "debitAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(65,30),
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "creditNoteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CustomerLedgerEntry_customerId_occurredAt_idx" ON "CustomerLedgerEntry"("customerId", "occurredAt");
CREATE INDEX IF NOT EXISTS "CustomerLedgerEntry_invoiceId_idx" ON "CustomerLedgerEntry"("invoiceId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "PaymentClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentClaim" ADD CONSTRAINT "PaymentClaim_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentClaim" ADD CONSTRAINT "PaymentClaim_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentClaimItem" ADD CONSTRAINT "PaymentClaimItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "PaymentClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentClaimItem" ADD CONSTRAINT "PaymentClaimItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Purchases / payables
CREATE TYPE "PurchaseBillStatus" AS ENUM ('DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

CREATE TABLE IF NOT EXISTS "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeName" TEXT,
    "gstin" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Supplier_name_idx" ON "Supplier"("name");
CREATE INDEX IF NOT EXISTS "Supplier_gstin_idx" ON "Supplier"("gstin");

CREATE TABLE IF NOT EXISTS "PurchaseBill" (
    "id" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "supplierBillNumber" TEXT,
    "supplierId" TEXT NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PurchaseBillStatus" NOT NULL DEFAULT 'DRAFT',
    "financialYear" TEXT,
    "placeOfSupplyState" TEXT,
    "isInterState" BOOLEAN NOT NULL DEFAULT false,
    "poReference" TEXT,
    "grnReference" TEXT,
    "mismatchWarning" TEXT,
    "grossAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "roundingAdjustment" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amountOutstanding" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseBill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseBill_billNumber_key" ON "PurchaseBill"("billNumber");
CREATE INDEX IF NOT EXISTS "PurchaseBill_supplierId_status_idx" ON "PurchaseBill"("supplierId", "status");
CREATE INDEX IF NOT EXISTS "PurchaseBill_status_billDate_idx" ON "PurchaseBill"("status", "billDate");

CREATE TABLE IF NOT EXISTS "PurchaseBillLine" (
    "id" TEXT NOT NULL,
    "purchaseBillId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "sku" TEXT,
    "hsnCode" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(65,30) NOT NULL,
    "gstRatePercent" DECIMAL(65,30) NOT NULL,
    "cgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(65,30) NOT NULL,
    CONSTRAINT "PurchaseBillLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PurchaseBillLine_purchaseBillId_idx" ON "PurchaseBillLine"("purchaseBillId");

CREATE TABLE IF NOT EXISTS "SupplierPayment" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "unallocatedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierPayment_paymentNumber_key" ON "SupplierPayment"("paymentNumber");
CREATE INDEX IF NOT EXISTS "SupplierPayment_supplierId_paidAt_idx" ON "SupplierPayment"("supplierId", "paidAt");

CREATE TABLE IF NOT EXISTS "SupplierPaymentAllocation" (
    "id" TEXT NOT NULL,
    "supplierPaymentId" TEXT NOT NULL,
    "purchaseBillId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPaymentAllocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierPaymentAllocation_supplierPaymentId_purchaseBillId_key" ON "SupplierPaymentAllocation"("supplierPaymentId", "purchaseBillId");

CREATE TABLE IF NOT EXISTS "SupplierLedgerEntry" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "entryType" "PartyLedgerEntryType" NOT NULL,
    "debitAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(65,30),
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseBillId" TEXT,
    "supplierPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SupplierLedgerEntry_supplierId_occurredAt_idx" ON "SupplierLedgerEntry"("supplierId", "occurredAt");

ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_purchaseBillId_fkey" FOREIGN KEY ("purchaseBillId") REFERENCES "PurchaseBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_purchaseBillId_fkey" FOREIGN KEY ("purchaseBillId") REFERENCES "PurchaseBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_purchaseBillId_fkey" FOREIGN KEY ("purchaseBillId") REFERENCES "PurchaseBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cash & expenses
CREATE TYPE "CashAccountType" AS ENUM ('COMPANY', 'EMPLOYEE_FLOAT', 'BANK');
CREATE TYPE "ExpenseApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ExpenseDocType" AS ENUM ('WITH_BILL', 'NO_BILL');

CREATE TABLE IF NOT EXISTS "CashAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountType" "CashAccountType" NOT NULL,
    "employeeId" TEXT,
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CashAccount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CashAccount_accountType_idx" ON "CashAccount"("accountType");
CREATE INDEX IF NOT EXISTS "CashAccount_employeeId_idx" ON "CashAccount"("employeeId");

CREATE TABLE IF NOT EXISTS "CashLedgerEntry" (
    "id" TEXT NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "inAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "outAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(65,30) NOT NULL,
    "description" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CashLedgerEntry_cashAccountId_occurredAt_idx" ON "CashLedgerEntry"("cashAccountId", "occurredAt");

CREATE TABLE IF NOT EXISTS "ExpenseRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "merchant" TEXT,
    "billAvailable" BOOLEAN NOT NULL DEFAULT true,
    "docType" "ExpenseDocType" NOT NULL DEFAULT 'WITH_BILL',
    "noBillReason" TEXT,
    "attachmentUrl" TEXT,
    "status" "ExpenseApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "cashAccountId" TEXT,
    "postingClass" TEXT NOT NULL DEFAULT 'OPERATING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpenseRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ExpenseRequest_employeeId_status_idx" ON "ExpenseRequest"("employeeId", "status");
CREATE INDEX IF NOT EXISTS "ExpenseRequest_status_expenseDate_idx" ON "ExpenseRequest"("status", "expenseDate");

ALTER TABLE "CashAccount" ADD CONSTRAINT "CashAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashLedgerEntry" ADD CONSTRAINT "CashLedgerEntry_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CoA / journals / sequences
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY');

CREATE TABLE IF NOT EXISTS "ChartAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChartAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChartAccount_code_key" ON "ChartAccount"("code");

CREATE TABLE IF NOT EXISTS "JournalEntry" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memo" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_entryNumber_key" ON "JournalEntry"("entryNumber");
CREATE INDEX IF NOT EXISTS "JournalEntry_sourceType_sourceId_idx" ON "JournalEntry"("sourceType", "sourceId");

CREATE TABLE IF NOT EXISTS "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "description" TEXT,
    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");
CREATE INDEX IF NOT EXISTS "JournalLine_accountId_idx" ON "JournalLine"("accountId");

ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "InvoiceSequence" (
    "id" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceSequence_financialYear_prefix_key" ON "InvoiceSequence"("financialYear", "prefix");

CREATE TABLE IF NOT EXISTS "CashReconcileLog" (
    "id" TEXT NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "systemBalance" DECIMAL(65,30) NOT NULL,
    "countedBalance" DECIMAL(65,30) NOT NULL,
    "difference" DECIMAL(65,30) NOT NULL,
    "notes" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashReconcileLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CashReconcileLog_cashAccountId_createdAt_idx" ON "CashReconcileLog"("cashAccountId", "createdAt");

-- Seed minimal chart of accounts
INSERT INTO "ChartAccount" ("id", "code", "name", "accountType", "isSystem") VALUES
  ('coa_cash', '1000', 'Cash', 'ASSET', true),
  ('coa_bank', '1010', 'Bank', 'ASSET', true),
  ('coa_ar', '1100', 'Accounts Receivable', 'ASSET', true),
  ('coa_inventory', '1200', 'Inventory', 'ASSET', true),
  ('coa_input_gst', '1300', 'Input GST', 'ASSET', true),
  ('coa_ap', '2000', 'Accounts Payable', 'LIABILITY', true),
  ('coa_output_gst', '2100', 'Output GST', 'LIABILITY', true),
  ('coa_sales', '4000', 'Lens Sales', 'INCOME', true),
  ('coa_cogs', '5000', 'Cost of Goods Sold', 'EXPENSE', true),
  ('coa_opex', '5100', 'Operating Expenses', 'EXPENSE', true)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "CashAccount" ("id", "name", "accountType", "balance", "isActive", "createdAt", "updatedAt")
VALUES ('cash_company', 'Company Cash', 'COMPANY', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
