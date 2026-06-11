import Link from "next/link";

import { getNavigationLabels } from "@/lib/i18n/dictionary";

export function MainNavigation() {
  const links = getNavigationLabels("es");

  return (
    <nav aria-label="Navegación principal" className="w-full">
      <ul className="grid grid-cols-4 gap-2 rounded-3xl bg-white/80 p-2 shadow-sm ring-1 ring-slate-200 backdrop-blur">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              className="flex min-h-11 items-center justify-center rounded-2xl px-2 text-center text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950 sm:text-sm"
              href={link.href}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
