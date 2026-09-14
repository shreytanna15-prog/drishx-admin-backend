-- Admin-managed coating filter chips for shop/wholesale product lists.
CREATE TABLE IF NOT EXISTS "CoatingFilterLabel" (
    "id" TEXT NOT NULL,
    "lensType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoatingFilterLabel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CoatingFilterLabel_lensType_name_key"
ON "CoatingFilterLabel"("lensType", "name");

CREATE INDEX IF NOT EXISTS "CoatingFilterLabel_lensType_isActive_sortOrder_idx"
ON "CoatingFilterLabel"("lensType", "isActive", "sortOrder");
