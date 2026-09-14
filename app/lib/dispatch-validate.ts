/**
 * Courier dispatch field validation.
 * Shared by the dedicated dispatch API and the legacy PUT route so both
 * enforce the same rules (min length, allowed characters, no obvious junk).
 */

export const COURIER_NAME_MAX_LENGTH = 120;
export const TRACKING_NUMBER_MAX_LENGTH = 200;
export const TRACKING_NUMBER_MIN_LENGTH = 4;

const TRACKING_ALLOWED = /^[A-Za-z0-9\-_/.:]+$/;
/** Reject placeholder / placeholder-looking strings. */
const JUNK_TRACKING =
  /^(?:tracking|track|awb|number|abc|test|asdf|asdasd|n\/a|n\.a\.|na|none|nil|null|tbd|todo|pending|unknown|undefined)$/i;
/** Reject 4+ of the same character, e.g. "xxxx", "nnnn". */
const REPEATED_CHAR = /^(.)\1{3,}$/;

export function validateCourierName(
  value: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "Courier name is required to dispatch." };
  }
  const trimmed = value.trim();
  if (trimmed.length > COURIER_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Courier name must be ${COURIER_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, value: trimmed };
}

export function validateTrackingNumber(
  value: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "Tracking number is required to dispatch." };
  }
  const trimmed = value.trim();
  if (trimmed.length < TRACKING_NUMBER_MIN_LENGTH) {
    return {
      ok: false,
      error: `Tracking number must be at least ${TRACKING_NUMBER_MIN_LENGTH} characters.`,
    };
  }
  if (trimmed.length > TRACKING_NUMBER_MAX_LENGTH) {
    return {
      ok: false,
      error: `Tracking number must be ${TRACKING_NUMBER_MAX_LENGTH} characters or fewer.`,
    };
  }
  if (!TRACKING_ALLOWED.test(trimmed)) {
    return {
      ok: false,
      error: "Tracking number can only contain letters, numbers, and - _ / . :",
    };
  }
  if (JUNK_TRACKING.test(trimmed) || REPEATED_CHAR.test(trimmed)) {
    return {
      ok: false,
      error: "Tracking number looks like a placeholder. Enter the real AWB number.",
    };
  }
  return { ok: true, value: trimmed };
}