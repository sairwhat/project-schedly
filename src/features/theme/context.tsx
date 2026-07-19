"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { THEME_PRESETS, DEFAULT_THEME_ID, type ThemePreset } from "./presets";

type ThemeContextValue = {
  activeId: string;
  activePreset: ThemePreset;
  setTheme: (id: string) => void;
  themeVars: React.CSSProperties;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "schedly-theme";

function getStoredId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEME_PRESETS.some((p) => p.id === stored)) return stored;
  } catch {}
  return DEFAULT_THEME_ID;
}

function presetToVars(preset: ThemePreset): React.CSSProperties {
  return Object.fromEntries(Object.entries(preset.vars)) as React.CSSProperties;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [activeId, setActiveId] = useState<string>(() => getStoredId());

  const setTheme = useCallback((id: string) => {
    const preset = THEME_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setActiveId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  }, []);

  const activePreset = useMemo(
    () => THEME_PRESETS.find((p) => p.id === activeId) ?? THEME_PRESETS[0]!,
    [activeId],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      activeId,
      activePreset,
      setTheme,
      themeVars: presetToVars(activePreset),
    }),
    [activeId, activePreset, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeConfig() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeConfig must be used within ThemeProvider");
  return ctx;
}
