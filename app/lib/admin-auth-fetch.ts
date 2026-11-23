import {
  clearSession,
  getAccessToken,
  setAccessToken,
  setSession,
} from "./client-auth";

type AuthErrorCode =
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALID"
  | "TOKEN_MISSING"
  | "ACCOUNT_PENDING"
  | "ACCOUNT_INACTIVE"
  | "MISSING_PERMISSION"
  | "FORBIDDEN";

type RefreshResponse = {
  accessToken?: string;
  token?: string;
  user?: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    isActive: boolean;
    isApproved: boolean;
    approvalStatus: string;
  };
};

/** Account / permission failures must not trigger silent refresh (RW-01). */
const NON_REFRESHABLE_401_CODES: AuthErrorCode[] = [
  "ACCOUNT_PENDING",
  "ACCOUNT_INACTIVE",
  "MISSING_PERMISSION",
  "FORBIDDEN",
];

/** Refresh when access JWT is within this window of expiry (proactive). */
const PROACTIVE_REFRESH_MS = 2 * 60 * 1000;

const ADMIN_CLIENT_HEADERS = { "X-Client": "admin" } as const;

async function responseAuthCode(res: Response): Promise<AuthErrorCode | null> {
  try {
    const data = (await res.clone().json()) as { code?: AuthErrorCode };
    return data.code ?? null;
  } catch {
    return null;
  }
}

/** Outcome of a refresh attempt — transient failures must not force logout. */
export type RefreshOutcome =
  | { status: "refreshed" }
  | { status: "auth_failed" }
  | { status: "transient" };

const REFRESH_TIMEOUT_MS = 15_000;

let refreshPromise: Promise<RefreshOutcome> | null = null;
let onAuthFailure: (() => void) | null = null;

export function registerAuthFailureHandler(handler: () => void) {
  onAuthFailure = handler;
}

function resolveAccessToken(data: RefreshResponse) {
  return data.accessToken ?? data.token ?? null;
}

function isTransientRefreshStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Read JWT `exp` without verifying — used only for proactive refresh timing. */
export function accessTokenExpiresAtMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2 || !parts[1]) return null;
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function accessTokenNeedsRefresh(token: string | null): boolean {
  if (!token) return false;
  const expMs = accessTokenExpiresAtMs(token);
  if (expMs == null) return false;
  return expMs - Date.now() <= PROACTIVE_REFRESH_MS;
}

export async function refreshAccessToken(): Promise<RefreshOutcome> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...ADMIN_CLIENT_HEADERS,
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        if (isTransientRefreshStatus(res.status)) {
          return { status: "transient" };
        }
        return { status: "auth_failed" };
      }

      const data = (await res.json()) as RefreshResponse;
      const nextToken = resolveAccessToken(data);
      if (!nextToken) return { status: "auth_failed" };

      setAccessToken(nextToken);
      if (data.user) {
        setSession(nextToken, data.user);
      }
      return { status: "refreshed" };
    } catch {
      return { status: "transient" };
    } finally {
      clearTimeout(timer);
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function logoutSession(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...ADMIN_CLIENT_HEADERS,
      },
    });
  } catch {
    // best effort
  } finally {
    clearSession();
  }
}

function mergeAdminHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  headers.set("X-Client", "admin");
  return headers;
}

export async function adminAuthFetch(
  path: string,
  init?: RequestInit,
  allowRetry = true
): Promise<Response> {
  // Proactive refresh before the access JWT expires so mutations are less
  // likely to hit 401 + cookie rotation races mid-click.
  if (accessTokenNeedsRefresh(getAccessToken())) {
    const proactive = await refreshAccessToken();
    if (proactive.status === "transient") {
      await new Promise((r) => setTimeout(r, 400));
      await refreshAccessToken();
    }
  }

  const headers = mergeAdminHeaders(init);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // Do not force Content-Type for FormData — browser must set multipart boundary.
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res = await fetch(path, { ...init, headers, credentials: "include" });

  if (res.status !== 401 || !allowRetry) {
    return res;
  }

  const authCode = await responseAuthCode(res);
  if (authCode && NON_REFRESHABLE_401_CODES.includes(authCode)) {
    return res;
  }

  let outcome = await refreshAccessToken();
  // RW-01: one short backoff + second refresh before surfacing 401 (no logout).
  if (outcome.status === "transient") {
    await new Promise((r) => setTimeout(r, 400));
    outcome = await refreshAccessToken();
  }
  if (outcome.status === "transient") {
    return res;
  }
  if (outcome.status !== "refreshed") {
    clearSession();
    onAuthFailure?.();
    return res;
  }

  const retryHeaders = mergeAdminHeaders(init);
  const nextToken = getAccessToken();
  if (nextToken) retryHeaders.set("Authorization", `Bearer ${nextToken}`);
  if (init?.body && !(init.body instanceof FormData) && !retryHeaders.has("Content-Type")) {
    retryHeaders.set("Content-Type", "application/json");
  }

  res = await fetch(path, { ...init, headers: retryHeaders, credentials: "include" });
  if (res.status === 401) {
    clearSession();
    onAuthFailure?.();
  }
  return res;
}
