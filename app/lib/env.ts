import { z } from "zod";

const boolish = z
  .union([z.string(), z.undefined()])
  .transform((value) => {
    const v = value?.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  });

const optionalTrimmed = z
  .union([z.string(), z.undefined()])
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required." })
    .trim()
    .min(1, "DATABASE_URL is required."),
  DATABASE_POOL_MAX: optionalTrimmed,

  JWT_SECRET: z
    .string({ required_error: "JWT_SECRET is required." })
    .trim()
    .min(1, "JWT_SECRET is required."),
  REFRESH_TOKEN_SECRET: optionalTrimmed,
  ADMIN_CREATION_SECRET: optionalTrimmed,

  OTP_DEV_MODE: boolish,
  OTP_DEV_CODE: optionalTrimmed,
  TWOFACTOR_API_KEY: optionalTrimmed,
  TWOFACTOR_BASE_URL: optionalTrimmed,
  TWOFACTOR_TEMPLATE: optionalTrimmed,
  EMAIL_OTP_PROVIDER: optionalTrimmed,
  EMAIL_OTP_API_KEY: optionalTrimmed,

  GSTIN_CLOUD_API_KEY: optionalTrimmed,
  GSTIN_CLOUD_BASE_URL: optionalTrimmed,
  GSTIN_CLOUD_DEV_MODE: optionalTrimmed,

  SUPABASE_URL: optionalTrimmed,
  SUPABASE_SERVICE_ROLE_KEY: optionalTrimmed,
  SUPABASE_ORDER_IMAGES_BUCKET: optionalTrimmed,
  SUPABASE_PROCUREMENT_BUCKET: optionalTrimmed,

  CRON_SECRET: optionalTrimmed,
  AUDIT_RETENTION_DAYS: optionalTrimmed,

  REORDER_SEED_DRY_RUN: optionalTrimmed,
  REORDER_SEED_AUTO_PROCURE: optionalTrimmed,
});

export type ServerEnv = z.infer<typeof serverEnvSchema> & {
  refreshTokenSecret: string;
};

let cached: ServerEnv | null = null;

function formatEnvError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.join(".") || "env";
    return `  - ${path}: ${issue.message}`;
  });
  return `Invalid environment configuration:\n${lines.join("\n")}`;
}

/** Parse and cache process.env. Throws with a clear multi-line message on failure. */
export function getEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
    JWT_SECRET: process.env.JWT_SECRET,
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
    ADMIN_CREATION_SECRET: process.env.ADMIN_CREATION_SECRET,
    OTP_DEV_MODE: process.env.OTP_DEV_MODE,
    OTP_DEV_CODE: process.env.OTP_DEV_CODE,
    TWOFACTOR_API_KEY: process.env.TWOFACTOR_API_KEY,
    TWOFACTOR_BASE_URL: process.env.TWOFACTOR_BASE_URL,
    TWOFACTOR_TEMPLATE: process.env.TWOFACTOR_TEMPLATE,
    EMAIL_OTP_PROVIDER: process.env.EMAIL_OTP_PROVIDER,
    EMAIL_OTP_API_KEY: process.env.EMAIL_OTP_API_KEY,
    GSTIN_CLOUD_API_KEY: process.env.GSTIN_CLOUD_API_KEY,
    GSTIN_CLOUD_BASE_URL: process.env.GSTIN_CLOUD_BASE_URL,
    GSTIN_CLOUD_DEV_MODE: process.env.GSTIN_CLOUD_DEV_MODE,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ORDER_IMAGES_BUCKET: process.env.SUPABASE_ORDER_IMAGES_BUCKET,
    SUPABASE_PROCUREMENT_BUCKET: process.env.SUPABASE_PROCUREMENT_BUCKET,
    CRON_SECRET: process.env.CRON_SECRET,
    AUDIT_RETENTION_DAYS: process.env.AUDIT_RETENTION_DAYS,
    REORDER_SEED_DRY_RUN: process.env.REORDER_SEED_DRY_RUN,
    REORDER_SEED_AUTO_PROCURE: process.env.REORDER_SEED_AUTO_PROCURE,
  });

  if (!parsed.success) {
    throw new Error(formatEnvError(parsed.error));
  }

  const data = parsed.data;
  cached = {
    ...data,
    refreshTokenSecret: data.REFRESH_TOKEN_SECRET ?? data.JWT_SECRET,
  };
  return cached;
}

/** Boot-time assert used from instrumentation. */
export function assertEnv(): ServerEnv {
  return getEnv();
}
