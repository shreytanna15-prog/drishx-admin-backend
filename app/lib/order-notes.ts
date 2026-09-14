/** Max length for customer order notes (cart / POST /api/orders). */
export const ORDER_NOTES_MAX_LENGTH = 2000;

export function validateOrderNotes(raw: unknown): { ok: true; notes: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, notes: null };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: 'notes must be a string.' };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, notes: null };
  }
  if (trimmed.length > ORDER_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: `Order notes must be at most ${ORDER_NOTES_MAX_LENGTH} characters.`,
    };
  }
  return { ok: true, notes: trimmed };
}
