/**
 * Pure return-request status constants + display labels
 * (no Prisma client / DATABASE_URL). Shared by returns-list filters and UI.
 */

export const ReturnRequestStatus = {
  SUBMITTED: "SUBMITTED",
  MORE_INFO_REQUIRED: "MORE_INFO_REQUIRED",
  ESCALATED_TO_ADMIN: "ESCALATED_TO_ADMIN",
  AWAITING_MATERIAL: "AWAITING_MATERIAL",
  APPROVED_CREDIT: "APPROVED_CREDIT",
  APPROVED_REPLACEMENT: "APPROVED_REPLACEMENT",
  REJECTED: "REJECTED",
  CLOSED: "CLOSED",
} as const;

export type ReturnRequestStatus =
  (typeof ReturnRequestStatus)[keyof typeof ReturnRequestStatus];

/** Canonical UI labels for return-request statuses (admin Returns screens). */
export const RETURN_REQUEST_STATUS_LABELS: Record<ReturnRequestStatus, string> =
  {
    SUBMITTED: "Pending Admin Review",
    MORE_INFO_REQUIRED: "More Info Needed",
    ESCALATED_TO_ADMIN: "Pending Admin Review",
    AWAITING_MATERIAL: "Replacement Approved",
    APPROVED_CREDIT: "Credit Approved",
    APPROVED_REPLACEMENT: "Replacement Approved",
    REJECTED: "Rejected",
    CLOSED: "Closed",
  };

function titleCaseEnum(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Display label for a return-request status enum (or unknown fallback). */
export function formatReturnRequestStatusLabel(status: string): string {
  const known = RETURN_REQUEST_STATUS_LABELS[status as ReturnRequestStatus];
  if (known) return known;
  return titleCaseEnum(status);
}

/**
 * Exact, case-insensitive, trimmed match of a UI label → all enum values
 * that share that label (e.g. "Pending Admin Review" → SUBMITTED + ESCALATED_TO_ADMIN).
 */
export function statusesMatchingDisplayLabel(
  query: string
): ReturnRequestStatus[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const matches: ReturnRequestStatus[] = [];
  for (const status of Object.values(ReturnRequestStatus)) {
    const label = RETURN_REQUEST_STATUS_LABELS[status].trim().toLowerCase();
    if (label === needle) matches.push(status);
  }
  return matches;
}

/** Exact enum token match (`submitted`, `SUBMITTED`). */
export function parseExactReturnRequestStatus(
  query: string
): ReturnRequestStatus | null {
  const token = query.trim().toUpperCase();
  if ((Object.values(ReturnRequestStatus) as string[]).includes(token)) {
    return token as ReturnRequestStatus;
  }
  return null;
}
