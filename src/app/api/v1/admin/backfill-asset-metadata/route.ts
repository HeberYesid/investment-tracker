import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, forbidden, serverError, validationError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { createYahooProvider } from "@/lib/market-data/yahoo";
import { candidateYahooSymbols } from "@/lib/market-data/symbols";

const BackfillInput = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
});

const DEFAULT_LIMIT = 10;
const CONCURRENCY = 5;

type TickerOutcome =
  | { ticker: string; status: "succeeded"; resolvedSymbol: string }
  | { ticker: string; status: "not_found"; tried: string[] }
  | { ticker: string; status: "error"; tried: string[]; message: string };

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = BackfillInput.safeParse(body ?? {});
  if (!parsed.success) return validationError(parsed.error.issues);

  const limit = parsed.data.limit ?? DEFAULT_LIMIT;
  const offset = parsed.data.offset ?? 0;

  const portfolio = await getCurrentPortfolio();
  if (!portfolio) return badRequest("No se encontró un portafolio.");
  if (portfolio.role !== "OWNER") {
    return forbidden("Solo los propietarios pueden ejecutar el backfill de metadatos.");
  }

  const { data: assets, count, error } = await supabase
    .from("assets")
    .select("id, ticker, yahoo_symbol, currency", { count: "exact" })
    .is("sector", null)
    .is("country", null)
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return serverError(`Error al leer activos: ${error.message}`);
  }

  if (!assets || assets.length === 0) {
    return NextResponse.json({
      processed: 0,
      succeeded: 0,
      notFound: 0,
      failed: 0,
      tickers: [] as TickerOutcome[],
      nextOffset: null,
      totalRemaining: 0,
    });
  }

  const profileProvider = createYahooProvider();
  let succeeded = 0;
  let notFound = 0;
  let failed = 0;
  const tickers: TickerOutcome[] = [];

  for (let i = 0; i < assets.length; i += CONCURRENCY) {
    const slice = assets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (asset): Promise<TickerOutcome> => {
        const candidates = candidateYahooSymbols({
          ticker: asset.ticker,
          yahooSymbol: asset.yahoo_symbol,
          currency: asset.currency,
        });
        if (candidates.length === 0) {
          return { ticker: asset.ticker, status: "not_found", tried: [] };
        }
        try {
          const result = await profileProvider.fetchProfileWithCandidates(
            candidates,
          );
          if (result.status === "ok") {
            const updates: Record<string, string> = {};
            if (result.profile.sector) updates.sector = result.profile.sector;
            if (result.profile.country) updates.country = result.profile.country;
            if (Object.keys(updates).length === 0) {
              return {
                ticker: asset.ticker,
                status: "not_found",
                tried: candidates,
              };
            }
            const { error: updateError } = await supabase
              .from("assets")
              .update(updates)
              .eq("id", asset.id);
            if (updateError) {
              console.warn(
                `[backfill-asset-metadata] update failed for ${asset.ticker} (${result.resolvedSymbol}):`,
                updateError.message,
              );
              return {
                ticker: asset.ticker,
                status: "error",
                tried: candidates,
                message: updateError.message,
              };
            }
            return {
              ticker: asset.ticker,
              status: "succeeded",
              resolvedSymbol: result.resolvedSymbol,
            };
          }
          if (result.status === "not_found") {
            return {
              ticker: asset.ticker,
              status: "not_found",
              tried: candidates,
            };
          }
          return {
            ticker: asset.ticker,
            status: "error",
            tried: candidates,
            message: result.message,
          };
        } catch (err) {
          console.warn(
            `[backfill-asset-metadata] fetch failed for ${asset.ticker}:`,
            err,
          );
          return {
            ticker: asset.ticker,
            status: "error",
            tried: candidates,
            message: err instanceof Error ? err.message : "unknown",
          };
        }
      }),
    );
    for (const outcome of results) {
      tickers.push(outcome);
      if (outcome.status === "succeeded") succeeded++;
      else if (outcome.status === "not_found") notFound++;
      else failed++;
    }
  }

  const processed = assets.length;
  const total = count ?? 0;
  const nextOffsetCandidate = offset + processed;
  const nextOffset = nextOffsetCandidate < total ? nextOffsetCandidate : null;
  const totalRemaining = Math.max(0, total - nextOffsetCandidate);

  console.log(
    `[backfill-asset-metadata] offset=${offset} limit=${limit} processed=${processed} succeeded=${succeeded} notFound=${notFound} failed=${failed} total=${total}`,
  );
  for (const t of tickers) {
    if (t.status === "succeeded") {
      console.log(
        `[backfill-asset-metadata]   ${t.ticker} -> ok via ${t.resolvedSymbol}`,
      );
    } else if (t.status === "not_found") {
      console.log(
        `[backfill-asset-metadata]   ${t.ticker} -> not_found (tried: ${t.tried.join(", ") || "none"})`,
      );
    } else {
      console.log(
        `[backfill-asset-metadata]   ${t.ticker} -> error: ${t.message} (tried: ${t.tried.join(", ") || "none"})`,
      );
    }
  }

  return NextResponse.json({
    processed,
    succeeded,
    notFound,
    failed,
    tickers,
    nextOffset,
    totalRemaining,
  });
}
