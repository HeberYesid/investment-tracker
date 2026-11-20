"use client";

import { ArrowLeftRight, ChartNoAxesCombined, LayoutDashboard, Settings2, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { getNavigationLabels } from "@/lib/i18n/dictionary";

const links = getNavigationLabels("es");
const icons = {
  "/": LayoutDashboard,
  "/avanzado": ChartNoAxesCombined,
  "/trades": ArrowLeftRight,
  "/import": Upload,
  "/settings/members": Settings2,
};

export function NavigationLinks({ fallback = false }: { fallback?: boolean }) {
  return fallback ? <NavigationItems /> : <CurrentNavigationItems />;
}

function CurrentNavigationItems() {
  return <NavigationItems pathname={usePathname()} />;
}

function NavigationItems({ pathname }: { pathname?: string }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {links.map(({ href, label }) => {
        const Icon = icons[href as keyof typeof icons];
        const current = pathname === href ? "page" : href !== "/" && pathname?.startsWith(`${href}/`) ? "location" : undefined;
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current}
              className="relative inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-soft hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring aria-[current]:bg-accent-soft aria-[current]:font-semibold aria-[current]:text-accent aria-[current]:after:absolute aria-[current]:after:inset-x-3 aria-[current]:after:bottom-1 aria-[current]:after:h-0.5 aria-[current]:after:rounded-full aria-[current]:after:bg-current motion-reduce:transition-none sm:px-3 sm:text-sm"
            >
              {Icon && <Icon className="hidden size-4 shrink-0 md:block" aria-hidden="true" />}
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
