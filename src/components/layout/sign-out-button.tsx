"use client";

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
      className="flex w-full min-h-11 items-center justify-center rounded-2xl px-2 text-center text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-50 sm:text-sm"
    >
      {authStrings.nav.signOut}
    </button>
  );
}
