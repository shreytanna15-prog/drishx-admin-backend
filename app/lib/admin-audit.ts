import { adminFetch } from "./admin-api";

export type AuditEventRow = {
  id: string;
  publicId: string;
  occurredAt: string;
  actorType: string;
  actorUserId: string | null;
  actorName: string | null;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  severity: string;
  isHighRisk: boolean;
  source: string;
  reasonCode: string | null;
  reasonText: string | null;
  result: string;
  changes: unknown;
  context: unknown;
  message: string | null;
};

export type SecurityEventRow = {
  id: string;
  occurredAt: string;
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  ipAddress: string | null;
  result: string;
  message: string | null;
};

export type SystemErrorRow = {
  id: string;
  occurredAt: string;
  route: string | null;
  method: string | null;
  statusCode: number | null;
  message: string;
  correlationId: string | null;
};

export type AuditOverview = {
  todayTotal: number;
  highRiskToday: number;
  stockAdjustmentsToday: number;
  financeToday: number;
  failedSecurityToday: number;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export function formatAuditDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function formatAuditAction(action: string) {
  return action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function fetchAuditOverview() {
  return adminFetch<AuditOverview>("/api/audit/overview");
}

export async function fetchAuditEvents(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return adminFetch<Paginated<AuditEventRow>>(`/api/audit/events${qs ? `?${qs}` : ""}`);
}

export async function fetchAuditTimeline(entityType: string, entityId: string) {
  const qs = new URLSearchParams({ entityType, entityId });
  return adminFetch<{ items: AuditEventRow[] }>(`/api/audit/timeline?${qs}`);
}

export async function fetchSecurityEvents(page = 1) {
  return adminFetch<Paginated<SecurityEventRow>>(`/api/audit/security?page=${page}`);
}

export async function fetchSystemErrors(page = 1) {
  return adminFetch<Paginated<SystemErrorRow>>(`/api/audit/errors?page=${page}`);
}

export function auditExportUrl(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  return `/api/audit/events/export?${search.toString()}`;
}
