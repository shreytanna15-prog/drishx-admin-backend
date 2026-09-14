"use client";

import { useTheme } from "./theme-provider";
import type { ThemePreference } from "../lib/theme";

const OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "Auto" },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {OPTIONS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className={`theme-toggle__btn${preference === id ? " theme-toggle__btn--active" : ""}`}
          onClick={() => setPreference(id)}
          aria-pressed={preference === id}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
