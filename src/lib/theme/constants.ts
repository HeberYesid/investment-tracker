export const THEME_STORAGE_KEY = "it-theme";

export const THEMES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEMES)[number];
export type ResolvedTheme = "light" | "dark";

export const DEFAULT_THEME: ThemeMode = "system";

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === "system") return systemPrefersDark ? "dark" : "light";
  return mode;
}

export function nextThemeMode(current: ThemeMode): ThemeMode {
  const idx = THEMES.indexOf(current);
  return THEMES[(idx + 1) % THEMES.length];
}
