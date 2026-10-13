import { getAccessToken } from "@/app/lib/client-auth";
import { adminAuthFetch } from "@/app/lib/admin-auth-fetch";

export class AdminApiError extends Error {
  status: number;
  /** Stable error `code` from the API body, when present. */
  code: string | null;
  /** Full JSON error body (e.g. cellErrors, lensIds) for richer UI handling. */
  details: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.details = details;
    this.code = typeof details.code === "string" ? details.code : null;
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
    throw new AdminApiError(
      message,
      res.status,
      data && typeof data === "object" ? (data as Record<string, unknown>) : {}
    );
  }

  return data as T;
}
