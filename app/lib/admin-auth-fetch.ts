import {
  clearSession,
  getAccessToken,
  setAccessToken,
  setSession,
} from "./client-auth";

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

export async function refreshAccessToken(): Promise<RefreshOutcome> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // best effort
  } finally {
    clearSession();
  }
}

export async function adminAuthFetch(
  path: string,
  init?: RequestInit,
  allowRetry = true
): Promise<Response> {
  const headers = new Headers(init?.headers);
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

  const outcome = await refreshAccessToken();
  if (outcome.status === "transient") {
    return res;
  }
  if (outcome.status !== "refreshed") {
    clearSession();
    onAuthFailure?.();
    return res;
  }

  const retryHeaders = new Headers(init?.headers);
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
