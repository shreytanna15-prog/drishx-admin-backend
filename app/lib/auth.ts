import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET ?? process.env.JWT_SECRET;

export const ACCESS_TOKEN_EXPIRY = "15m";
export const REFRESH_TOKEN_DAYS = 30;
export const REFRESH_COOKIE_NAME = "drishx_refresh";

export type SessionPayload = {
  userId: string;
  role: UserRole;
  typ?: "access";
};

export type AccessTokenPayload = SessionPayload & {
  typ: "access";
};

export type VerifyAccessResult =
  | { ok: true; payload: SessionPayload }
  | { ok: false; code: "TOKEN_EXPIRED" | "TOKEN_INVALID" };

function requireSecrets() {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is required.");
  }
  if (!REFRESH_TOKEN_SECRET) {
    throw new Error("REFRESH_TOKEN_SECRET or JWT_SECRET environment variable is required.");
  }
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(payload: SessionPayload) {
  requireSecrets();
  return jwt.sign(
    { userId: payload.userId, role: payload.role, typ: "access" as const },
    JWT_SECRET!,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/** @deprecated Use signAccessToken. Kept for backward compatibility during rollout. */
export function signToken(payload: SessionPayload) {
  return signAccessToken(payload);
}

export function verifyAccessToken(token: string): VerifyAccessResult {
  requireSecrets();
  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as AccessTokenPayload & SessionPayload;
    if (decoded.typ && decoded.typ !== "access") {
      return { ok: false, code: "TOKEN_INVALID" };
    }
    return { ok: true, payload: { userId: decoded.userId, role: decoded.role } };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return { ok: false, code: "TOKEN_EXPIRED" };
    }
    return { ok: false, code: "TOKEN_INVALID" };
  }
}

/** @deprecated Use verifyAccessToken. Kept for backward compatibility during rollout. */
export function verifyToken(token: string): SessionPayload | null {
  const result = verifyAccessToken(token);
  return result.ok ? result.payload : null;
}

function hashRefreshToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function generateRawRefreshToken() {
  return randomBytes(48).toString("base64url");
}

export async function createRefreshToken(userId: string, userAgent?: string | null) {
  const rawToken = generateRawRefreshToken();
  const tokenHash = hashRefreshToken(rawToken);
  const familyId = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      familyId,
      expiresAt,
      userAgent: userAgent ?? null,
    },
  });

  return { rawToken, familyId, expiresAt };
}

export type RotateRefreshResult =
  | {
      ok: true;
      userId: string;
      rawToken: string;
      familyId: string;
      expiresAt: Date;
    }
  | { ok: false; code: "TOKEN_INVALID" | "TOKEN_EXPIRED" };

/** Grace window where presenting a just-rotated refresh token is treated as a
 * concurrent race (do not wipe the family) rather than token theft. */
const REFRESH_ROTATION_GRACE_MS = 30_000;

export async function rotateRefreshToken(rawToken: string): Promise<RotateRefreshResult> {
  const tokenHash = hashRefreshToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    return { ok: false, code: "TOKEN_INVALID" };
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    if (!existing.revokedAt) {
      await prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: false, code: "TOKEN_EXPIRED" };
  }

  if (existing.revokedAt) {
    // Concurrent refresh: another request already rotated this token. If a
    // successor is still active within the grace window, do NOT revoke the
    // whole family (that would log out tabs that just refreshed successfully).
    const ageMs = Date.now() - existing.revokedAt.getTime();
    if (ageMs < REFRESH_ROTATION_GRACE_MS) {
      const successor = await prisma.refreshToken.findFirst({
        where: {
          familyId: existing.familyId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (successor) {
        return { ok: false, code: "TOKEN_INVALID" };
      }
    }
    await revokeRefreshFamily(existing.familyId);
    return { ok: false, code: "TOKEN_INVALID" };
  }

  // Atomic claim — only one concurrent rotator wins.
  const claimed = await prisma.refreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (claimed.count === 0) {
    // Lost the race; winner already issued a successor. Do not wipe family.
    return { ok: false, code: "TOKEN_INVALID" };
  }

  const rawNewToken = generateRawRefreshToken();
  const newHash = hashRefreshToken(rawNewToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId: existing.userId,
      tokenHash: newHash,
      familyId: existing.familyId,
      expiresAt,
      userAgent: existing.userAgent,
    },
  });

  return {
    ok: true,
    userId: existing.userId,
    rawToken: rawNewToken,
    familyId: existing.familyId,
    expiresAt,
  };
}

export async function revokeRefreshFamily(familyId: string) {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserRefreshTokens(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeRefreshToken(rawToken: string) {
  const tokenHash = hashRefreshToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing) return false;
  await revokeRefreshFamily(existing.familyId);
  return true;
}

export function buildRefreshCookie(rawToken: string, expiresAt: Date) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${REFRESH_COOKIE_NAME}=${rawToken}; HttpOnly${secure}; SameSite=Lax; Path=/api/auth; Max-Age=${maxAge}`;
}

export function clearRefreshCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${REFRESH_COOKIE_NAME}=; HttpOnly${secure}; SameSite=Lax; Path=/api/auth; Max-Age=0`;
}

export function parseRefreshCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(`${REFRESH_COOKIE_NAME}=`)) {
      return decodeURIComponent(part.slice(REFRESH_COOKIE_NAME.length + 1));
    }
  }
  return null;
}

export function isMobileClient(req: { headers: { get(name: string): string | null } }) {
  return req.headers.get("x-client")?.toLowerCase() === "mobile";
}
