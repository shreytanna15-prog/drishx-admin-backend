import { AdminApiError } from "@/app/lib/admin-api";

/** Normalize unknown throwables to Error for hook state / callbacks. */
export function toHookError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Auth failures are handled by adminAuthFetch (refresh / sign-out).
 * Hooks must not invoke UI onError for these (including missing token → 401).
 */
export function isAuthFailureError(error: unknown): boolean {
  return error instanceof AdminApiError && error.status === 401;
}

/** True when a request generation is no longer the latest (stale / unmounted). */
export function isStaleRequest(
  requestId: number,
  latestRequestId: number
): boolean {
  return requestId !== latestRequestId;
}
