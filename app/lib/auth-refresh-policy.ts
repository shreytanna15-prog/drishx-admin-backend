/**
 * Grace window where presenting a just-rotated refresh token is treated as a
 * concurrent race (do not wipe the family) rather than token theft.
 */
export const REFRESH_ROTATION_GRACE_MS = 30_000;

/**
 * Result of refresh-token rotation.
 * - `rotated`: new raw refresh token issued (caller must Set-Cookie / return body token)
 * - `concurrent`: another request won rotation; issue access token only — do NOT
 *   clear or overwrite the refresh cookie (winner already set / will set it)
 * - failure with `clearCookie: true`: definitive auth failure
 * - failure with `retryable: true`: race in progress — keep cookie, client retries
 */
export type RotateRefreshResult =
  | {
      ok: true;
      kind: "rotated";
      userId: string;
      rawToken: string;
      familyId: string;
      expiresAt: Date;
    }
  | {
      ok: true;
      kind: "concurrent";
      userId: string;
      familyId: string;
    }
  | {
      ok: false;
      code: "TOKEN_INVALID" | "TOKEN_EXPIRED";
      clearCookie: boolean;
      retryable?: boolean;
    };

/** Pure decision helper for revoked-token presentation (unit-tested). */
export function decideRevokedRefreshPresentation(input: {
  revokedAt: Date;
  now?: Date;
  hasActiveSuccessor: boolean;
  userId: string;
  familyId: string;
  graceMs?: number;
}):
  | { action: "concurrent"; userId: string; familyId: string }
  | { action: "retryable" }
  | { action: "reject_reuse" } {
  const now = input.now ?? new Date();
  const graceMs = input.graceMs ?? REFRESH_ROTATION_GRACE_MS;
  const ageMs = now.getTime() - input.revokedAt.getTime();

  if (ageMs < graceMs) {
    if (input.hasActiveSuccessor) {
      return {
        action: "concurrent",
        userId: input.userId,
        familyId: input.familyId,
      };
    }
    // Winner may still be committing the successor — keep cookie and retry.
    return { action: "retryable" };
  }

  return { action: "reject_reuse" };
}

/** Whether the refresh HTTP handler should clear the browser refresh cookie. */
export function shouldClearRefreshCookie(result: RotateRefreshResult): boolean {
  if (result.ok) return false;
  if (result.retryable) return false;
  return result.clearCookie;
}

/** Whether the refresh HTTP handler should Set-Cookie a new refresh token. */
export function shouldSetNewRefreshCookie(result: RotateRefreshResult): boolean {
  return result.ok && result.kind === "rotated";
}
