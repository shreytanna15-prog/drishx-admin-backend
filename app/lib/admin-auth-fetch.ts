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

let refreshPromise: Promise<boolean> | null = null;
let onAuthFailure: (() => void) | null = null;

export function registerAuthFailureHandler(handler: () => void) {
  onAuthFailure = handler;
}

function resolveAccessToken(data: RefreshResponse) {
  return data.accessToken ?? data.token ?? null;
}

export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return false;

      const data = (await res.json()) as RefreshResponse;
      const nextToken = resolveAccessToken(data);
      if (!nextToken) return false;

      setAccessToken(nextToken);
      if (data.user) {
        setSession(nextToken, data.user);
      }
      return true;
    } catch {
      return false;
    } finally {
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

  const refreshed = await refreshAccessToken();
  if (!refreshed) {
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
