import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import {
  TradeFormInput,
  TradeListQuery,
  normalizeTradeUsdValues,
  serializeTradeDTO,
} from "@/lib/validations/trades";
import type { CreateTradeInput } from "@/lib/validations/trades";
import { badRequest, validationError, serverError } from "@/lib/api/errors";
import { fetchTradesPage } from "@/lib/trades/queries";
import { createYahooProvider } from "@/lib/market-data/yahoo";
import { candidateYahooSymbols } from "@/lib/market-data/symbols";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const auth = await requireApiUserWithPortfolio();
  if (auth.response) return auth.response;
  const { supabase, portfolio } = auth;

  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = TradeListQuery.safeParse(searchParams);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const result = await fetchTradesPage(supabase, portfolio.portfolioId, parsed.data);

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error) {
      return badRequest(err.message);
    }
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUserWithPortfolio(undefined, { writeAccess: true, request });
  if (auth.response) return auth.response;
  const { supabase, user, portfolio } = auth;

  try {
    const body = await request.json();
    const parsed = TradeFormInput.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const input = parsed.data;
    const { data: broker, error: brokerError } = await supabase
      .from("brokers")
      .select("id")
      .eq("code", input.broker_code)
      .single();

    if (brokerError || !broker) {
      return badRequest("Bróker no encontrado: " + input.broker_code);
    }

    const { data: existingAsset } = await supabase
      .from("assets")
      .select("id")
      .eq("ticker", input.ticker)
      .limit(1)
      .maybeSingle();

    let asset_id: string;
    let newlyCreatedAsset = false;
    if (existingAsset) {
      asset_id = existingAsset.id;
    } else {
      const { data: newAsset, error: assetError } = await supabase
        .from("assets")
        .insert({
          ticker: input.ticker,
          asset_type: "STOCK",
          currency: input.currency_original,
          name: input.ticker,
        })
        .select("id")
        .single();

      if (assetError || !newAsset) {
        return badRequest("No se pudo crear el activo: " + input.ticker);
      }
      asset_id = newAsset.id;
      newlyCreatedAsset = true;
    }

    if (newlyCreatedAsset) {
      const profileProvider = createYahooProvider();
      try {
        const candidates = candidateYahooSymbols({
          ticker: input.ticker,
          yahooSymbol: null,
          currency: input.currency_original,
        });
        const result = await profileProvider.fetchProfileWithCandidates(
          candidates,
        );
        if (result.status === "ok") {
          const updates: Record<string, string> = {};
          if (result.profile.sector) updates.sector = result.profile.sector;
          if (result.profile.country) updates.country = result.profile.country;
          if (Object.keys(updates).length > 0) {
            await supabase.from("assets").update(updates).eq("id", asset_id);
          }
        }
      } catch (err) {
        logger.warn(
          "trades",
          `Failed to enrich asset metadata for ${input.ticker}:`,
          err,
        );
      }
    }

    const tradeInput: CreateTradeInput = {
      ...input,
      portfolio_id: portfolio.portfolioId,
      broker_id: broker.id,
      asset_id,
      source: "MANUAL",
    };
    const usdValues = normalizeTradeUsdValues(tradeInput);

    const { data: trade, error: tradeError } = await supabase
      .from("trades")
      .insert({
        portfolio_id: portfolio.portfolioId,
        broker_id: broker.id,
        asset_id,
        trade_date: input.trade_date,
        trade_type: input.trade_type,
        quantity: input.quantity,
        price_original: input.price_original,
        currency_original: input.currency_original,
        commission_original: input.commission_original,
        fx_rate_to_usd: input.fx_rate_to_usd,
        source: "MANUAL",
        ...usdValues,
      })
      .select()
      .single();

    if (tradeError) {
      return badRequest(tradeError.message);
    }

    await supabase.from("audit_events").insert({
      actor_user_id: user.id,
      portfolio_id: trade.portfolio_id,
      entity_type: "trade",
      entity_id: trade.id,
      action: "CREATE",
      after_json: trade,
    });

    revalidatePath("/");
    revalidatePath("/avanzado");
    revalidateTag("market-prices", "max");

    return NextResponse.json(serializeTradeDTO(trade), { status: 201 });
  } catch {
    return serverError();
  }
}
