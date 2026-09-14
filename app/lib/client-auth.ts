export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  isApproved: boolean;
  approvalStatus: string;
};

const ACCESS_TOKEN_KEY = "drishx_admin_access_token";
const LEGACY_TOKEN_KEY = "drishx_admin_token";
const USER_KEY = "drishx_admin_user";

let memoryAccessToken: string | null = null;

function readSessionStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionStorage(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function migrateLegacyToken(): string | null {
  if (typeof window === "undefined") return null;
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (!legacy) return null;
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  setAccessToken(legacy);
  return legacy;
}

export function getAccessToken(): string | null {
  if (memoryAccessToken) return memoryAccessToken;
  const stored = readSessionStorage(ACCESS_TOKEN_KEY);
  if (stored) {
    memoryAccessToken = stored;
    return stored;
  }
  return migrateLegacyToken();
}

/** @deprecated Use getAccessToken */
export function getToken(): string | null {
  return getAccessToken();
}

export function setAccessToken(token: string | null) {
  memoryAccessToken = token;
  writeSessionStorage(ACCESS_TOKEN_KEY, token);
  if (typeof window !== "undefined") {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser) {
  setAccessToken(token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  setAccessToken(null);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function isAdminUser(user: AuthUser | null): boolean {
  return user?.role === "ADMIN";
}
