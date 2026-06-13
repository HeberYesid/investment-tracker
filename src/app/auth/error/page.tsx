import Link from "next/link";
import { authStrings } from "@/lib/i18n/auth";

type SearchParams = { reason?: string };

export const metadata = {
  title: "Error de inicio de sesión · Investment Tracker",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { reason } = await searchParams;
  const message =
    reason === "expired" || reason === "invalid" || reason === "missing_code"
      ? authStrings.error.expired
      : authStrings.error.generic;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-bold text-slate-950">
          {authStrings.error.title}
        </h1>
        <p className="mt-3 text-sm text-slate-600">{message}</p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm font-semibold text-slate-950 underline"
        >
          {authStrings.error.backToLogin}
        </Link>
      </div>
    </main>
  );
}
