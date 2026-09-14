import type { NextRequest } from "next/server";
import type { AuditSource } from "@prisma/client";
import type { SessionPayload } from "../auth";

export type AuditRequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
  source: AuditSource;
  correlationId: string;
  clientRequestId: string | null;
  isOfflineReplay: boolean;
};

function resolveSource(req: NextRequest): AuditSource {
  const client = req.headers.get("x-client")?.toLowerCase();
  if (client === "mobile") return "MOBILE";
  if (client === "web") return "WEB";
  const referer = req.headers.get("referer") ?? "";
  if (referer.includes("/admin") || referer.includes(":3000/orders")) {
    return "ADMIN";
  }
  const host = req.headers.get("host") ?? "";
  if (host.includes("admin") || req.nextUrl.pathname.startsWith("/api/admin")) {
    return "ADMIN";
  }
  return "API";
}

export function buildAuditRequestContext(req: NextRequest): AuditRequestContext {
  const forwarded = req.headers.get("x-forwarded-for");
  const ipAddress =
    forwarded?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const clientRequestId = req.headers.get("x-request-id");
  const correlationId = clientRequestId ?? crypto.randomUUID();

  return {
    ipAddress,
    userAgent: req.headers.get("user-agent"),
    source: resolveSource(req),
    correlationId,
    clientRequestId,
    isOfflineReplay: req.headers.get("x-offline-replay") === "true",
  };
}

export type AuditActor = {
  actorType: "HUMAN" | "SYSTEM" | "AUTOMATION" | "INTEGRATION";
  actorUserId?: string | null;
  actorName?: string | null;
};

export function actorFromSession(
  session: SessionPayload | null,
  userName?: string | null
): AuditActor {
  if (!session) {
    return { actorType: "SYSTEM", actorUserId: null, actorName: "System" };
  }
  return {
    actorType: "HUMAN",
    actorUserId: session.userId,
    actorName: userName ?? null,
  };
}

export function systemActor(): AuditActor {
  return { actorType: "SYSTEM", actorUserId: null, actorName: "System" };
}
