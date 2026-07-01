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

import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  THEMES,
  isThemeMode,
  nextThemeMode,
  resolveTheme,
  type ResolvedTheme,
  type ThemeMode,
} from "./constants";

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  cycle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
  } catch {
    // localStorage may be unavailable (private mode, quota); fall back to default.
  }
  return DEFAULT_THEME;
}

function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_THEME);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(false);

  useEffect(() => {
    const initial = readStoredMode();
    const initialSystem = getSystemPrefersDark();
    setModeState(initial);
    setSystemPrefersDark(initialSystem);
    applyResolvedTheme(resolveTheme(initial, initialSystem));
  }, []);

  useEffect(() => {
    if (mode !== "system") return;
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
      applyResolvedTheme(event.matches ? "dark" : "light");
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore quota/private-mode errors; the next render still works.
    }
    const system = next === "system" ? getSystemPrefersDark() : systemPrefersDark;
    applyResolvedTheme(resolveTheme(next, system));
  }, [systemPrefersDark]);

  const cycle = useCallback(() => {
    setModeState((current) => {
      const next = nextThemeMode(current);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Ignore storage errors; cycle still works in-memory.
      }
      const system = next === "system" ? getSystemPrefersDark() : systemPrefersDark;
      applyResolvedTheme(resolveTheme(next, system));
      return next;
    });
  }, [systemPrefersDark]);

  const resolvedTheme = resolveTheme(mode, systemPrefersDark);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolvedTheme, setMode, cycle }),
    [mode, resolvedTheme, setMode, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      mode: DEFAULT_THEME,
      resolvedTheme: "light",
      setMode: () => {},
      cycle: () => {},
    };
  }
  return ctx;
}

export { THEMES };
