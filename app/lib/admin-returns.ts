export type AdminReturnStatus =
  | "SUBMITTED"
  | "MORE_INFO_REQUIRED"
  | "ESCALATED_TO_ADMIN"
  | "AWAITING_MATERIAL"
  | "APPROVED_CREDIT"
  | "APPROVED_REPLACEMENT"
  | "REJECTED"
  | "CLOSED";

export type AdminReturnRequest = {
  id: string;
  requestNumber: string;
  requestType: "RETURN" | "REPLACEMENT";
  status: AdminReturnStatus;
  customerRemarks?: string | null;
  employeeRemarks?: string | null;
  adminRemarks?: string | null;
  rejectionReason?: string | null;
  approvedAmount?: number | null;
  replacementBatchId?: string | null;
  createdAt: string;
  customer: {
    id: string;
    name: string | null;
    email: string;
    businessName?: string | null;
    role?: string | null;
  };
  assignedEmployee?: {
    id: string;
    name: string | null;
    email: string;
    role?: string | null;
  } | null;
  items: Array<{
    id: string;
    originalOrderId: string;
    lensLabel: string;
    quantity: number;
    eye?: string | null;
    reason: string;
    itemRemarks?: string | null;
    originalSph?: number | null;
    originalCyl?: number | null;
    originalAxis?: number | null;
    originalAdd?: number | null;
    requestedSph?: number | null;
    requestedCyl?: number | null;
    requestedAxis?: number | null;
    requestedAdd?: number | null;
  }>;
  images: Array<{
    id: string;
    imageUrl: string;
    createdAt: string;
  }>;
  timelineEvents: Array<{
    id: string;
    eventType: string;
    message: string;
    createdAt: string;
    actorUser?: {
      id: string;
      name: string | null;
      email: string;
      role?: string | null;
    } | null;
  }>;
  creditNote?: {
    id: string;
    creditNoteNumber: string;
    amount: number;
  } | null;
};

export function formatReturnStatus(status: string) {
  const labels: Record<string, string> = {
    SUBMITTED: "Pending Admin Review",
    MORE_INFO_REQUIRED: "More Info Needed",
    ESCALATED_TO_ADMIN: "Pending Admin Review",
    AWAITING_MATERIAL: "Replacement Approved",
    APPROVED_CREDIT: "Credit Approved",
    APPROVED_REPLACEMENT: "Replacement Approved",
    REJECTED: "Rejected",
    CLOSED: "Closed",
  };
  if (labels[status]) return labels[status];
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatReturnReason(reason: string) {
  return reason
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatReturnPowerLine(parts: {
  sph?: number | null;
  cyl?: number | null;
  add?: number | null;
  axis?: number | null;
}): string {
  const format = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    if (rounded === 0) return "0.00";
    const sign = rounded > 0 ? "+" : "";
    return `${sign}${rounded.toFixed(2)}`;
  };
  const labels = [
    parts.sph != null ? `SPH ${format(parts.sph)}` : null,
    parts.cyl != null ? `CYL ${format(parts.cyl)}` : null,
    parts.add != null ? `ADD ${format(parts.add)}` : null,
    parts.axis != null ? `AXIS ${parts.axis}` : null,
  ].filter(Boolean);
  return labels.length > 0 ? labels.join(" · ") : "—";
}

export function formatReturnDate(value: string) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function returnStatusBadgeClass(status: AdminReturnStatus) {
  switch (status) {
    case "SUBMITTED":
      return "border-amber-400/50 bg-amber-500/15 text-amber-100";
    case "MORE_INFO_REQUIRED":
      return "border-sky-400/50 bg-sky-500/15 text-sky-100";
    case "ESCALATED_TO_ADMIN":
      return "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100";
    case "AWAITING_MATERIAL":
      return "border-indigo-400/50 bg-indigo-500/15 text-indigo-100";
    case "APPROVED_CREDIT":
    case "APPROVED_REPLACEMENT":
      return "border-emerald-400/50 bg-emerald-500/15 text-emerald-100";
    case "REJECTED":
      return "border-rose-400/50 bg-rose-500/15 text-rose-100";
    case "CLOSED":
      return "border-slate-400/50 bg-slate-500/15 text-slate-100";
  }
}
