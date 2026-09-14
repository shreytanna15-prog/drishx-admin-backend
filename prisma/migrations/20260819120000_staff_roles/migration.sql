-- Staff job roles (separate from User.role account type).
CREATE TABLE IF NOT EXISTS "StaffRole" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffRole_slug_key" ON "StaffRole"("slug");
CREATE INDEX IF NOT EXISTS "StaffRole_isSystem_idx" ON "StaffRole"("isSystem");

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffRoleId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_staffRoleId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_staffRoleId_fkey"
      FOREIGN KEY ("staffRoleId") REFERENCES "StaffRole"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "User_staffRoleId_idx" ON "User"("staffRoleId");
