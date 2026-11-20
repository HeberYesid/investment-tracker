export type Locale = "es";

export type NavigationLabel = {
  href: string;
  label: string;
};

export const navigationStrings = {
  name: "Navegación principal",
  brand: "Investment Tracker",
} as const;

const navigationLabels: Record<Locale, NavigationLabel[]> = {
  es: [
    { href: "/", label: "Resumen" },
    { href: "/avanzado", label: "Avanzado" },
    { href: "/trades", label: "Operaciones" },
    { href: "/import", label: "Importar" },
    { href: "/settings/members", label: "Ajustes" },
  ],
};

export function getNavigationLabels(locale: Locale): NavigationLabel[] {
  return navigationLabels[locale];
}
