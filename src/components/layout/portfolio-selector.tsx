"use client";

import { useId, useState, type FormEvent } from "react";

import { portfolioStrings as labels } from "@/lib/i18n/portfolios";
import type { CurrentPortfolio } from "@/lib/supabase/auth";

type Props = { activeId: string; options: CurrentPortfolio[] };

export function PortfolioSelector({ activeId, options }: Props) {
  const id = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const portfolioId = new FormData(event.currentTarget).get("portfolio_id");
    if (portfolioId === activeId) return;
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/v1/portfolio/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolio_id: portfolioId }),
      });
      if (response.status !== 204) throw new Error();
      window.location.replace("/");
    } catch {
      setPending(false);
      setError(true);
    }
  }

  if (options.length === 1) {
    return <p className="px-2 text-sm text-text-secondary">{labels.active}: {options[0].portfolio.name} · {labels.roles[options[0].role]}</p>;
  }

  return (
    <form onSubmit={submit} method="post" action="/api/v1/portfolio/active" className="flex flex-wrap items-end gap-2 px-2">
      <div className="grid min-w-0 flex-1 gap-1 sm:max-w-xs">
        <label htmlFor={id} className="text-sm font-medium text-text-secondary">{labels.active}</label>
        <select id={id} name="portfolio_id" defaultValue={activeId} disabled={pending}
          className="min-h-12 w-full rounded-xl border border-border-default bg-surface px-3 text-base text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring">
          {options.map(({ portfolioId, portfolio, role }) => (
            <option key={portfolioId} value={portfolioId}>{portfolio.name} · {labels.roles[role]}</option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-surface-muted px-3 text-sm font-semibold text-text-primary hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring">
        {pending ? labels.changing : labels.change}
      </button>
      {error && <p role="alert" className="w-full text-sm text-text-secondary">{labels.membershipError}</p>}
    </form>
  );
}
