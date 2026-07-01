export const themeLabels = {
  es: {
    toggleToLight: "Cambiar a tema claro",
    toggleToDark: "Cambiar a tema oscuro",
    toggleToSystem: "Usar tema del sistema",
    currentLight: "Tema claro activo",
    currentDark: "Tema oscuro activo",
    currentSystem: "Tema del sistema activo",
  },
} as const;

export type ThemeLabels = (typeof themeLabels)["es"];

export function getThemeLabels(): ThemeLabels {
  return themeLabels.es;
}
