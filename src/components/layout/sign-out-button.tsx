"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authStrings } from "@/lib/i18n/auth";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

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
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-default bg-surface px-2.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none sm:px-3 sm:text-sm"
    >
      {authStrings.nav.signOut}
      <LogOut className="size-3.5 shrink-0" aria-hidden="true" />
    </button>
  );
}
