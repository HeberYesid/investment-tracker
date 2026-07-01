"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { getThemeLabels } from "@/lib/i18n/theme";
import {
  nextThemeMode,
  type ThemeMode,
} from "@/lib/theme/constants";
import { useTheme } from "@/lib/theme/theme-provider";

const labels = getThemeLabels();

function iconFor(mode: ThemeMode) {
  if (mode === "light") return Sun;
  if (mode === "dark") return Moon;
  return Monitor;
}

function labelFor(mode: ThemeMode) {
  if (mode === "light") return labels.toggleToLight;
  if (mode === "dark") return labels.toggleToDark;
  return labels.toggleToSystem;
}

function srLabelFor(mode: ThemeMode) {
  if (mode === "light") return labels.currentLight;
  if (mode === "dark") return labels.currentDark;
  return labels.currentSystem;
}

export function ThemeToggleFab() {
  const { mode, cycle } = useTheme();
  const next = nextThemeMode(mode);
  const Icon = iconFor(next);

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={labelFor(next)}
      title={labelFor(next)}
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-action-primary text-action-primary-fg shadow-lg ring-1 ring-border-subtle transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:bottom-6 sm:right-6"
      data-testid="theme-toggle-fab"
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="sr-only">{srLabelFor(mode)}</span>
    </button>
  );
}
