"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  applyThemePreference,
  readStoredThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "../lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  resolvedTheme: "light" | "dark";
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = readStoredThemePreference();
    setPreferenceState(stored);

    if (pathname === "/login") {
      applyThemePreference("system");
      setResolvedTheme(getSystemTheme());
      return;
    }

    applyThemePreference(stored);
    setResolvedTheme(stored === "system" ? getSystemTheme() : stored);
  }, [pathname]);

  useEffect(() => {
    if (pathname === "/login") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => setResolvedTheme(media.matches ? "dark" : "light");
      onChange();
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }

    if (preference !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolvedTheme(media.matches ? "dark" : "light");
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference, pathname]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      localStorage.setItem(THEME_STORAGE_KEY, next);
      if (pathname !== "/login") {
        applyThemePreference(next);
        setResolvedTheme(next === "system" ? getSystemTheme() : next);
      }
    },
    [pathname]
  );

  const value = useMemo(
    () => ({ preference, setPreference, resolvedTheme }),
    [preference, setPreference, resolvedTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
