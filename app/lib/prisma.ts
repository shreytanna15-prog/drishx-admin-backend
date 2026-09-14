import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type PoolConfig } from "pg";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  pgPool?: Pool;
  pgPoolKey?: string;
};

/**
 * Prefer Supabase transaction pooler (:6543) for app runtime.
 * Session mode (:5432) hard-caps ~15 clients (EMAXCONNSESSION).
 * Use string replace — do NOT rebuild via `new URL().toString()`, which can
 * drop/alter password characters and cause:
 * "SASL: client password must be a string".
 */
function normalizeDatabaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.includes("pooler.supabase.com") ||
      trimmed.includes("pooler.supabase.co")) &&
    trimmed.includes(":5432/")
  ) {
    return trimmed.replace(":5432/", ":6543/");
  }
  return trimmed;
}

/**
 * Parse a postgres URL into pg PoolConfig with an explicit string password.
 * Avoids pg receiving `password: undefined` from a missing/broken connectionString.
 */
function poolConfigFromDatabaseUrl(rawUrl: string): PoolConfig {
  const connectionString = normalizeDatabaseUrl(rawUrl);
  const match = connectionString.match(
    /^postgres(?:ql)?:\/\/([^:\/?#]+):([^@\/?#]*)@([^:\/?#]+)(?::(\d+))?\/([^?]*)/i
  );

  if (!match) {
    // Fall back to connectionString only when it looks parseable by pg.
    return {
      connectionString,
      ssl: connectionString.includes("supabase")
        ? { rejectUnauthorized: false }
        : undefined,
    };
  }

  const [, user, passwordEnc, host, port, database] = match;
  const password = decodeURIComponent(passwordEnc ?? "");
  if (typeof password !== "string") {
    throw new Error("DATABASE_URL password must be a string.");
  }

  const isSupabase = host.includes("supabase.com") || host.includes("supabase.co");

  return {
    user: decodeURIComponent(user),
    password,
    host,
    port: port ? Number(port) : 5432,
    database: decodeURIComponent(database || "postgres"),
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  };
}

function createPgPool(rawUrl: string): Pool {
  const base = poolConfigFromDatabaseUrl(rawUrl);
  const isSupabase = Boolean(
    base.host?.includes("supabase") ||
      base.connectionString?.includes("supabase")
  );

  const defaultMax = isSupabase ? 2 : 5;
  const max = Number(process.env.DATABASE_POOL_MAX ?? defaultMax);

  const nextPool = new Pool({
    ...base,
    max: Number.isFinite(max) && max > 0 ? max : defaultMax,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 20_000,
    allowExitOnIdle: true,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  nextPool.on("error", (error) => {
    console.warn("[pg pool] idle client error:", error.message);
  });

  return nextPool;
}

const rawDatabaseUrl = process.env.DATABASE_URL?.trim();
if (!rawDatabaseUrl) {
  throw new Error(
    "DATABASE_URL is missing. Add it to Drishx-admin-and-backend/.env and restart the server."
  );
}

const poolKey = normalizeDatabaseUrl(rawDatabaseUrl);

// Recreate pool if URL changed (avoids hot-reload keeping a broken undefined-password pool).
if (globalForPrisma.pgPool && globalForPrisma.pgPoolKey !== poolKey) {
  void globalForPrisma.pgPool.end().catch(() => undefined);
  globalForPrisma.pgPool = undefined;
  globalForPrisma.prisma = undefined;
}

// Drop HMR-cached client when schema gained models (stale clients miss delegates
// like catalogProductLine → "Cannot read properties of undefined (reading 'findMany')").
if (
  globalForPrisma.prisma &&
  (typeof (globalForPrisma.prisma as { catalogProductLine?: unknown })
    .catalogProductLine === "undefined" ||
    typeof (globalForPrisma.prisma as { staffRole?: unknown }).staffRole ===
      "undefined")
) {
  void globalForPrisma.prisma.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

const pool = globalForPrisma.pgPool ?? createPgPool(rawDatabaseUrl);
const adapter = new PrismaPg(pool);
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
  globalForPrisma.pgPoolKey = poolKey;
}

function isTransientDbError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("connection terminated") ||
    message.includes("connection timeout") ||
    message.includes("timeout exceeded when trying to connect") ||
    message.includes("cannot reach database server") ||
    message.includes("server closed the connection") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("emaxconnsession") ||
    message.includes("max clients reached") ||
    message.includes("too many clients") ||
    message.includes("eai_again") ||
    message.includes("getaddrinfo")
  );
}

/** Retry once/twice on transient Supabase pooler disconnects. */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}
