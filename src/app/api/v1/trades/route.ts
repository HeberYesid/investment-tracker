import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  TradeFormInput,
  TradeListQuery,
  normalizeTradeUsdValues,
} from "@/lib/validations/trades";
import type { CreateTradeInput } from "@/lib/validations/trades";
import { badRequest, validationError, serverError } from "@/lib/api/errors";

export async function GET(request: NextRequest) {
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
      trade_type,
      currency_original,
      source,
      date_from,
      date_to,
    } = parsed.data;

    const supabase = createServerSupabaseClient();

    let query = supabase
      .from("trades")
      .select("*, assets(ticker, name)", { count: "exact" })
      .is("deleted_at", null)
      .order("trade_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (ticker) {
      query = query.eq("assets.ticker", ticker);
    }
    if (broker_id) {
      query = query.eq("broker_id", broker_id);
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

    const from = (page - 1) * limit;
    const to = page * limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return badRequest(error.message);
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      data,
      meta: { page, limit, total, totalPages },
    });
  } catch {
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = TradeFormInput.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const input = parsed.data;
    const supabase = createServerSupabaseClient();

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

    let portfolio_id: string;
    if (input.portfolio_id) {
      portfolio_id = input.portfolio_id;
    } else {
      const { data: existingPortfolio } = await supabase
        .from("portfolios")
        .select("id")
        .eq("name", "Default")
        .limit(1)
        .maybeSingle();

      if (existingPortfolio) {
        portfolio_id = existingPortfolio.id;
      } else {
        const { data: newPortfolio, error: portfolioError } = await supabase
          .from("portfolios")
          .insert({ name: "Default", base_currency: "USD" })
          .select("id")
          .single();

        if (portfolioError || !newPortfolio) {
          return badRequest("No se pudo crear el portafolio");
        }
        portfolio_id = newPortfolio.id;
      }
    }

    const tradeInput: CreateTradeInput = {
      ...input,
      portfolio_id,
      broker_id: broker.id,
      asset_id,
      source: "MANUAL",
    };
    const usdValues = normalizeTradeUsdValues(tradeInput);

    const { data: trade, error: tradeError } = await supabase
      .from("trades")
      .insert({
        portfolio_id,
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
