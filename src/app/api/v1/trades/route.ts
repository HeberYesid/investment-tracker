import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import {
  TradeFormInput,
  TradeListQuery,
  normalizeTradeUsdValues,
} from "@/lib/validations/trades";
import type { CreateTradeInput } from "@/lib/validations/trades";
import { badRequest, validationError, serverError } from "@/lib/api/errors";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = TradeListQuery.safeParse(searchParams);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const {
      page,
      limit,
      ticker,
      broker_id,
      broker_code,
      trade_type,
      currency_original,
      source,
      date_from,
      date_to,
      min_total_usd,
    } = parsed.data;

    let resolvedBrokerId = broker_id;
    if (broker_code && !broker_id) {
      const { data: broker } = await supabase
        .from("brokers")
        .select("id")
        .eq("code", broker_code)
        .single();
      if (broker) {
        resolvedBrokerId = broker.id;
      }
    }

    let query = supabase
      .from("trades")
      .select("*, assets(ticker, name), brokers(name, code)", { count: "exact" })
      .is("deleted_at", null)
      .order("trade_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (ticker) {
      query = query.eq("assets.ticker", ticker);
    }
    if (resolvedBrokerId) {
      query = query.eq("broker_id", resolvedBrokerId);
    }
    if (trade_type) {
      query = query.eq("trade_type", trade_type);
    }
    if (currency_original) {
      query = query.eq("currency_original", currency_original);
    }
    if (source) {
      query = query.eq("source", source);
    }
    if (date_from) {
      query = query.gte("trade_date", date_from);
    }
    if (date_to) {
      query = query.lte("trade_date", date_to);
    }
    if (min_total_usd !== undefined && min_total_usd > 0) {
      query = query.or(
        `total_invested_usd.gte.${min_total_usd},total_invested_usd.lte.${-min_total_usd}`,
      );
    }

    const from = (page - 1) * limit;
    const to = page * limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return badRequest(error.message);
    }

    const flattened = (data ?? []).map((row) => {
      const assets = (row as { assets?: { ticker?: string; name?: string } })
        .assets;
      const brokers = (row as { brokers?: { name?: string; code?: string } })
        .brokers;
      const { assets: _assets, brokers: _brokers, ...rest } = row as Record<
        string,
        unknown
      > & {
        assets?: { ticker?: string; name?: string };
        brokers?: { name?: string; code?: string };
      };
      return {
        ...rest,
        ticker: assets?.ticker ?? null,
        asset_name: assets?.name ?? null,
        broker_name: brokers?.name ?? null,
        broker_code: brokers?.code ?? null,
      };
    });

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      data: flattened,
      meta: { page, limit, total, totalPages },
    });
  } catch {
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const body = await request.json();
    const parsed = TradeFormInput.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const input = parsed.data;
    const portfolio = await getCurrentPortfolio();
    if (!portfolio) {
      return badRequest("No se encontró un portafolio para el usuario.");
    }

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
      portfolio_id: trade.portfolio_id,
      entity_type: "trade",
      entity_id: trade.id,
      action: "CREATE",
      after_json: trade,
    });

    return NextResponse.json(trade, { status: 201 });
  } catch {
    return serverError();
  }
}
