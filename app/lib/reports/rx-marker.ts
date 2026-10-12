/** Same marker as admin `isRxOrder` — do not invent photo/RX variants. */
export const RX_ORDER_NOTES_MARKER = "[RX Order]";

export function notesIsRxOrder(notes: string | null | undefined): boolean {
  return notes?.includes(RX_ORDER_NOTES_MARKER) ?? false;
}
