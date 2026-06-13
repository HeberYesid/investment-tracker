"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { authStrings } from "@/lib/i18n/auth";

type Props = {
  signedIn: React.ReactNode;
  signedOut: React.ReactNode;
};

export function UserChip({ signedIn, signedOut }: Props) {
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

  if (!resolved) {
    return <div aria-hidden="true" className="h-[68px] w-full rounded-3xl bg-white/40 ring-1 ring-slate-200" />;
  }

  if (!email) {
    return <>{signedOut}</>;
  }

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

  return (
    <div className="flex flex-col items-stretch gap-2 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {authStrings.userMenu.signedInAs}
        </p>
        <p className="truncate text-sm font-medium text-slate-950">{email}</p>
      </div>
      {signedIn}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleSignOut}
        disabled={isSigningOut}
      >
        {authStrings.nav.signOut}
      </Button>
    </div>
  );
}
