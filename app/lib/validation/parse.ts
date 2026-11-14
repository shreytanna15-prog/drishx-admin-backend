import type { ZodTypeAny, z } from "zod";

export type ParseOk<T> = { ok: true; data: T };
export type ParseFail = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseFail;

/** Safe-parse with a single human-readable error string (first issue). */
export function parseOrError<S extends ZodTypeAny>(
  schema: S,
  data: unknown
): ParseResult<z.output<S>> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const first = result.error.issues[0];
  return {
    ok: false,
    error: first?.message ?? "Invalid request.",
  };
}
