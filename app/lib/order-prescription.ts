import type { CartReservation } from "@prisma/client";

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalInt(value: unknown): number | null {
  const parsed = parseOptionalNumber(value);
  if (parsed === null) {
    return null;
  }
  return Math.trunc(parsed);
}

type LensPrescriptionSource = {
  sph: unknown;
  cyl?: unknown | null;
  axis?: number | null;
  add?: unknown | null;
  eye?: string | null;
};

/** Prescription chosen at checkout — prefer cart reservation, then request body, then catalog lens. */
export function resolveOrderPrescription(
  reservation: Pick<
    CartReservation,
    "sph" | "cyl" | "add" | "axis" | "eye"
  > | null,
  body: Record<string, unknown>,
  lens: LensPrescriptionSource
): {
  sph: number;
  cyl: number | null;
  axis: number | null;
  add: number | null;
  eye: string | null;
} {
  const sph =
    reservation?.sph != null
      ? Number(reservation.sph)
      : (parseOptionalNumber(body.sph) ?? Number(lens.sph));

  const cyl =
    reservation !== null && reservation.cyl !== null && reservation.cyl !== undefined
      ? Number(reservation.cyl)
      : body.cyl !== undefined && body.cyl !== null
        ? parseOptionalNumber(body.cyl)
        : lens.cyl != null && lens.cyl !== undefined
          ? Number(lens.cyl)
          : null;

  const add =
    reservation?.add != null
      ? Number(reservation.add)
      : body.add !== undefined && body.add !== null
        ? parseOptionalNumber(body.add)
        : lens.add != null && lens.add !== undefined
          ? Number(lens.add)
          : null;

  const axis =
    reservation?.axis != null
      ? reservation.axis
      : body.axis !== undefined && body.axis !== null
        ? parseOptionalInt(body.axis)
        : lens.axis ?? null;

  const eyeRaw =
    reservation?.eye?.trim() ||
    (typeof body.eye === "string" ? body.eye.trim() : "") ||
    lens.eye?.trim() ||
    null;

  return {
    sph,
    cyl,
    axis,
    add,
    eye: eyeRaw,
  };
}
