import type { ResolvedTheme } from "./constants";

export type ChartPalette = {
  text: string;
  axis: string;
  grid: string;
  surface: string;
  surfaceBorder: string;
  primary: string;
  primaryFillFrom: string;
  primaryFillTo: string;
  benchmark: string;
  benchmarkDash: string;
  tooltipBg: string;
  tooltipBorder: string;
  pieSlices: string[];
  pieUnclassified: string;
  fallbackSwatch: string;
};

const PIE_LIGHT = [
  "#2563eb",
  "#ea580c",
  "#7c3aed",
  "#059669",
  "#dc2626",
  "#0891b2",
  "#ca8a04",
  "#db2777",
  "#57534e",
  "#0d9488",
];

const PIE_DARK = [
  "#60a5fa",
  "#fb923c",
  "#a78bfa",
  "#34d399",
  "#f87171",
  "#22d3ee",
  "#facc15",
  "#f472b6",
  "#a8a29e",
  "#2dd4bf",
];

export const lightChartPalette: ChartPalette = {
  text: "#0f172a",
  axis: "#64748b",
  grid: "#e2e8f0",
  surface: "#ffffff",
  surfaceBorder: "#e2e8f0",
  primary: "#0f172a",
  primaryFillFrom: "#0f172a",
  primaryFillTo: "#0f172a",
  benchmark: "#10b981",
  benchmarkDash: "4 2",
  tooltipBg: "#ffffff",
  tooltipBorder: "#e2e8f0",
  pieSlices: PIE_LIGHT,
  pieUnclassified: "#cbd5e1",
  fallbackSwatch: "#0f172a",
};

export const darkChartPalette: ChartPalette = {
  text: "#f1f5f9",
  axis: "#94a3b8",
  grid: "#1e293b",
  surface: "#131a26",
  surfaceBorder: "#1e293b",
  primary: "#f1f5f9",
  primaryFillFrom: "#f1f5f9",
  primaryFillTo: "#f1f5f9",
  benchmark: "#34d399",
  benchmarkDash: "4 2",
  tooltipBg: "#1a2230",
  tooltipBorder: "#334155",
  pieSlices: PIE_DARK,
  pieUnclassified: "#475569",
  fallbackSwatch: "#f1f5f9",
};

export function getChartPalette(theme: ResolvedTheme): ChartPalette {
  return theme === "dark" ? darkChartPalette : lightChartPalette;
}
