"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { emailSchema } from "@/lib/validations/auth";
import { authStrings } from "@/lib/i18n/auth";

type Status =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "success" };

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setStatus({
        kind: "error",
        message: parsed.error.issues[0]?.message ?? authStrings.login.genericError,
      });
      return;
    }

    setIsSubmitting(true);
    setStatus({ kind: "idle" });
    try {
      const supabase = createBrowserSupabaseClient();
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email: parsed.data,
        options: {
          emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        setStatus({ kind: "error", message: error.message });
        return;
      }
      setStatus({ kind: "success" });
    } catch {
      setStatus({ kind: "error", message: authStrings.login.genericError });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status.kind === "success") {
    return (
      <div
        className="rounded-3xl bg-surface p-6 shadow-sm ring-1 ring-border-subtle"
        role="status"
      >
        <h2 className="text-lg font-semibold text-text-primary">
          {authStrings.login.successTitle}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {authStrings.login.successBody}
        </p>
        <button
          type="button"
          className="mt-4 text-sm font-semibold text-text-primary underline"
          onClick={() => {
            setStatus({ kind: "idle" });
            setEmail("");
          }}
        >
          {authStrings.login.backToLogin}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl bg-surface p-6 shadow-sm ring-1 ring-border-subtle"
      noValidate
    >
      <label
        htmlFor="email"
        className="block text-sm font-semibold text-text-secondary"
      >
        {authStrings.login.emailLabel}
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        placeholder={authStrings.login.emailPlaceholder}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={isSubmitting}
        className="mt-2 block w-full rounded-2xl border-0 bg-surface-soft px-4 py-3 text-base text-text-primary ring-1 ring-border-subtle placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-focus-ring disabled:opacity-60"
      />
      {status.kind === "error" ? (
        <p
          role="alert"
          className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-400"
        >
          {status.message}
        </p>
      ) : null}
      <Button
        type="submit"
        className="mt-4 w-full"
        disabled={isSubmitting}
      >
        {isSubmitting
          ? authStrings.login.submitting
          : authStrings.login.submit}
      </Button>
    </form>
  );
}
