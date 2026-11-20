import { ArrowUpRight, ChartNoAxesCombined } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { getCurrentUser, getPortfolioContext } from "@/lib/supabase/auth";
import { navigationStrings } from "@/lib/i18n/dictionary";
import { authStrings } from "@/lib/i18n/auth";

import { SignOutButton } from "./sign-out-button";
import { PortfolioSelector } from "./portfolio-selector";
import { NavigationLinks } from "./navigation-links";

export async function MainNavigation() {
  const user = await getCurrentUser();
  const signedIn = user !== null;
  const context = signedIn ? await getPortfolioContext() : null;

  return (
    <header className="w-full">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-border-subtle pb-2 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-5 lg:pb-3">
        <Link href="/" className="inline-flex min-h-11 w-fit max-w-full items-center gap-2 rounded-lg text-sm font-semibold tracking-tight text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-white dark:text-background">
            <ChartNoAxesCombined className="size-4" aria-hidden="true" />
          </span>
          <span className="wrap-anywhere">{navigationStrings.brand}</span>
        </Link>
        <div className="justify-self-end lg:col-start-3 lg:row-start-1">
          {signedIn ? <SignOutButton /> : (
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-default bg-surface px-2.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-reduce:transition-none sm:px-3 sm:text-sm"
            >
              {authStrings.nav.signIn}
              <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
            </Link>
          )}
        </div>
        <nav aria-label={navigationStrings.name} className="col-span-2 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:justify-self-center">
          <Suspense fallback={<NavigationLinks fallback />}>
            <NavigationLinks />
          </Suspense>
        </nav>
      </div>
      {context?.kind === "active" && (
        <div className="pt-3">
          <PortfolioSelector key={context.portfolio.portfolioId} activeId={context.portfolio.portfolioId} options={context.options} />
        </div>
      )}
    </header>
  );
}
