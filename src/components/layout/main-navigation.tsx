import Link from "next/link";

import { getCurrentUser } from "@/lib/supabase/auth";
import { getNavigationLabels } from "@/lib/i18n/dictionary";
import { authStrings } from "@/lib/i18n/auth";

import { SignOutButton } from "./sign-out-button";

export async function MainNavigation() {
  const links = getNavigationLabels("es");
  const user = await getCurrentUser();
  const signedIn = user !== null;
  const itemCount = links.length + (signedIn ? 1 : 0);
  const smGridColsClass = {
    5: "sm:grid-cols-5",
    6: "sm:grid-cols-6",
  }[itemCount] ?? "sm:grid-cols-5";

  return (
    <nav aria-label="Navegación principal" className="flex w-full flex-col gap-3">
      <ul
        className={`grid grid-cols-2 gap-2 rounded-3xl bg-surface/80 p-2 shadow-sm ring-1 ring-border-subtle backdrop-blur ${smGridColsClass}`}
      >
        {links.map((link) => (
          <li key={link.href}>
            <Link
              className="flex min-h-11 items-center justify-center rounded-2xl px-2 text-center text-xs font-semibold text-text-secondary hover:bg-surface-muted hover:text-text-primary sm:text-sm"
              href={link.href}
            >
              {link.label}
            </Link>
          </li>
        ))}
        {signedIn && (
          <li>
            <SignOutButton />
          </li>
        )}
      </ul>
      {!signedIn && (
        <Link
          href="/login"
          className="rounded-3xl bg-surface px-4 py-3 text-center text-sm font-semibold text-text-primary shadow-sm ring-1 ring-border-subtle hover:bg-surface-soft"
        >
          {authStrings.nav.signIn}
        </Link>
      )}
    </nav>
  );
}
