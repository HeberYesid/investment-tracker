import Link from "next/link";
import { getNavigationLabels } from "@/lib/i18n/dictionary";
import { authStrings } from "@/lib/i18n/auth";
import { UserChip } from "@/features/auth/user-chip";

export function MainNavigation() {
  const links = getNavigationLabels("es");

  return (
    <nav aria-label="Navegación principal" className="flex w-full flex-col gap-3">
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
      <UserChip
        signedIn={<SignedInMarker />}
        signedOut={
          <Link
            href="/login"
            className="rounded-3xl bg-white px-4 py-3 text-center text-sm font-semibold text-slate-950 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            {authStrings.nav.signIn}
          </Link>
        }
      />
    </nav>
  );
}

function SignedInMarker() {
  return <div data-user-chip="signed-in" className="hidden" aria-hidden="true" />;
}
