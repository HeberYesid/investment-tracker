import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";
import { authStrings } from "@/lib/i18n/auth";
import { getCurrentUser } from "@/lib/supabase/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Iniciar sesión · Investment Tracker",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">
          {authStrings.login.title}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {authStrings.login.subtitle}
        </p>
      </header>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
