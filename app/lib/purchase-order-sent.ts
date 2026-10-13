/**
 * Supplier dispatch ("sent") rules for Purchase Orders — pure, client-safe.
 *
 * DrishX has no outbound email service configured, so a PO is never marked
 * SENT automatically. An authorized user sends the PO from their own mail
 * client / WhatsApp / courier and then records the dispatch explicitly.
 */

export const PO_SENT_CHANNELS = [
  "EMAIL",
  "WHATSAPP",
  "COURIER",
  "HAND_DELIVERY",
  "PHONE",
  "OTHER",
] as const;

export type PoSentChannel = (typeof PO_SENT_CHANNELS)[number];

export const PO_SENT_CHANNEL_LABELS: Record<PoSentChannel, string> = {
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  COURIER: "Courier / post",
  HAND_DELIVERY: "Hand delivery",
  PHONE: "Phone (read out)",
  OTHER: "Other",
};

export function isPoSentChannel(value: unknown): value is PoSentChannel {
  return typeof value === "string" && (PO_SENT_CHANNELS as readonly string[]).includes(value);
}

/** Statuses from which a dispatch may be recorded (approved, not closed). */
export function canMarkPoSent(status: string, sentAt: string | Date | null | undefined): boolean {
  if (sentAt) return false;
  return status === "OPEN" || status === "PARTIALLY_RECEIVED";
}

/** Status label that keeps APPROVED/OPEN and SENT distinct. */
export function poDispatchState(status: string, sentAt: string | Date | null | undefined) {
  if (status === "DRAFT" || status === "PENDING_APPROVAL") return "NOT_APPROVED" as const;
  if (status === "CANCELLED") return "CANCELLED" as const;
  return sentAt ? ("SENT" as const) : ("NOT_SENT" as const);
}

/**
 * `mailto:` draft for the admin's own mail client. Opening it does NOT send
 * anything and does not change the PO status.
 */
export function buildPoEmailDraft(input: {
  publicId: string;
  supplierName: string;
  supplierEmail: string | null;
  contactPerson?: string | null;
  buyerName: string;
  expectedDelivery?: string | null;
  lineCount: number;
  totalQuantity: number;
}): { mailto: string | null; subject: string; body: string } {
  const subject = `Purchase Order ${input.publicId} from ${input.buyerName}`;
  const greeting = input.contactPerson?.trim()
    ? `Dear ${input.contactPerson.trim()},`
    : `Dear ${input.supplierName},`;
  const lines = [
    greeting,
    "",
    `Please find attached Purchase Order ${input.publicId} (${input.lineCount} line(s), ${input.totalQuantity} unit(s)).`,
    input.expectedDelivery
      ? `Expected delivery: ${input.expectedDelivery.slice(0, 10)}.`
      : null,
    "Kindly confirm receipt and share the dispatch details with a power-wise packing list (Excel) and the bill.",
    "",
    "Regards,",
    input.buyerName,
  ].filter((line): line is string => line !== null);
  const body = lines.join("\n");
  const email = input.supplierEmail?.trim();
  const mailto = email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;
  return { mailto, subject, body };
}
