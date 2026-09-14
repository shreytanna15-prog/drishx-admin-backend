import { getAccessToken } from "@/app/lib/client-auth";
import { adminAuthFetch } from "@/app/lib/admin-auth-fetch";

export class AdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

export async function adminFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    throw new AdminApiError("Not signed in.", 401);
  }

  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await adminAuthFetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      typeof data?.error === "string" ? data.error : "Request failed.";
    throw new AdminApiError(message, res.status);
  }

  return data as T;
}
