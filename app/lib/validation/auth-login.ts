import { z } from "zod";

export const authLoginBodySchema = z
  .object({
    email: z.unknown(),
    password: z.unknown(),
  })
  .transform((body, ctx) => {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "").trim();
    if (!email || !password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email and password are required.",
      });
      return z.NEVER;
    }
    return { email, password };
  });

export type AuthLoginBody = z.infer<typeof authLoginBodySchema>;
