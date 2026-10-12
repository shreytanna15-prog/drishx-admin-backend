/** Same aging buckets as /api/finance/receivables. */
export function agingBucket(
  issuedAt: Date | null,
  now: Date = new Date()
): "0-30" | "31-60" | "61-90" | "90+" {
  if (!issuedAt) return "0-30";
  const days = Math.floor(
    (now.getTime() - issuedAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}
