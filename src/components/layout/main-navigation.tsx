"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getNavigationLabels } from "@/lib/i18n/dictionary";
import { authStrings } from "@/lib/i18n/auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function MainNavigation() {
  const links = getNavigationLabels("es");
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserSupabaseClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled) return;
        setEmail(data.user?.email ?? null);
        setResolved(true);
      })
      .catch(() => {
        if (cancelled) return;
        setResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await fetch("/api/v1/auth/signout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  const signedIn = resolved && email !== null;

  return (
    <nav aria-label="Navegación principal" className="flex w-full flex-col gap-3">
      <ul className="grid grid-cols-2 gap-2 rounded-3xl bg-white/80 p-2 shadow-sm ring-1 ring-slate-200 backdrop-blur sm:grid-cols-5">
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
        {signedIn && (
          <li>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="flex w-full min-h-11 items-center justify-center rounded-2xl px-2 text-center text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-50 sm:text-sm"
            >
              {authStrings.nav.signOut}
            </button>
          </li>
        )}
      </ul>
      {resolved && !signedIn && (
        <Link
          href="/login"
          className="rounded-3xl bg-white px-4 py-3 text-center text-sm font-semibold text-slate-950 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
        >
          {authStrings.nav.signIn}
        </Link>
      )}
    </nav>
  );
}
