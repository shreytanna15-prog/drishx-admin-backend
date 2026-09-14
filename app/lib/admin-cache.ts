"use client";

/**
 * Lightweight stale-while-revalidate cache for admin list data.
 * Lists render instantly from the last snapshot while a background
 * fetch refreshes them.
 */

const memoryCache = new Map<string, unknown>();

const STORAGE_PREFIX = "drishx-admin-cache:";

export function readListCache<T>(key: string): T | null {
  if (memoryCache.has(key)) {
    return memoryCache.get(key) as T;
  }
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writeListCache<T>(key: string, data: T): void {
  memoryCache.set(key, data);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
  } catch {
    // Quota exceeded or unavailable — memory cache still works.
  }
}

export function invalidateListCache(key: string): void {
  memoryCache.delete(key);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // Ignore storage failures.
  }
}

export function clearListCache(): void {
  memoryCache.clear();
  if (typeof window === "undefined") return;
  try {
    const stale: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) stale.push(key);
    }
    stale.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Ignore storage failures.
  }
}
