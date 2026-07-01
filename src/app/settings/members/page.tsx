import { redirect } from "next/navigation";

import { MainNavigation } from "@/components/layout/main-navigation";
import { requireCurrentPortfolio } from "@/lib/supabase/auth";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { listMembers } from "@/lib/api/portfolio-members";
import { getMemberLabels } from "@/lib/i18n/members";

import { MembersManagementClient } from "@/features/settings/members-management-client";
import { type Member } from "@/features/settings/members-types";

const labels = getMemberLabels();

export default async function MembersPage() {
  const portfolio = await requireCurrentPortfolio();
  if (portfolio.role !== "OWNER") {
    redirect("/");
  }

  const supabase = await createUserSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rawMembers = await listMembers(supabase, portfolio);
  const initialMembers: Member[] = rawMembers.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    email: m.email,
    created_at: m.created_at,
  }));

  return (
    <main className="min-h-screen bg-background text-text-primary">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-surface px-4 py-5 sm:px-6 lg:px-8">
        <MainNavigation />

        <section className="rounded-[2rem] bg-surface p-5 shadow-sm ring-1 ring-border-subtle sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            {labels.pageTitle}
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {labels.pageDescription}
          </p>
        </section>

        <MembersManagementClient
          initialMembers={initialMembers}
          currentUserId={user?.id ?? ""}
        />
      </div>
    </main>
  );
}
