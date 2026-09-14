/**
 * Purge SystemErrorLog rows older than AUDIT_RETENTION_DAYS (default 90).
 * AuditEvent and SecurityEvent are never deleted.
 */
import { prisma } from "../app/lib/prisma";

const retentionDays = Number(process.env.AUDIT_RETENTION_DAYS ?? 90);
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - retentionDays);

async function main() {
  const result = await prisma.systemErrorLog.deleteMany({
    where: { occurredAt: { lt: cutoff } },
  });
  console.log(
    `Purged ${result.count} system error log row(s) older than ${retentionDays} days (before ${cutoff.toISOString()}).`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
