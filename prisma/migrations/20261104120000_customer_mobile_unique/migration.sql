-- RW-12: unique mobile among CUSTOMER rows that have a number (NULLs allowed).
CREATE UNIQUE INDEX IF NOT EXISTS "User_customer_mobileNumber_key"
ON "User" ("mobileNumber")
WHERE role = 'CUSTOMER' AND "mobileNumber" IS NOT NULL;