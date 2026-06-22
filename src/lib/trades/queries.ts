import type { SupabaseClient } from "@supabase/supabase-js";

import type { TradeDTO, TradeListQuery } from "@/lib/validations/trades";

export type TradeListResult = {
  data: TradeDTO[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type TradeRow = {
  assets?: { ticker?: string; name?: string } | { ticker?: string; name?: string }[];
  brokers?: { name?: string; code?: string } | { name?: string; code?: string }[];
};

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export async function fetchTradesPage(
  supabase: SupabaseClient,
  params: TradeListQuery,
): Promise<TradeListResult> {
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
  } = params;

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
    throw new Error(error.message);
  }

  const flattened = (data ?? []).map((row) => {
    const r = row as TradeRow & Record<string, unknown>;
    const assets = firstJoin(r.assets);
    const brokers = firstJoin(r.brokers);
    const { assets: _dropAssets, brokers: _dropBrokers, ...rest } = r;
    void _dropAssets;
    void _dropBrokers;
    return {
      ...rest,
      ticker: assets?.ticker ?? null,
      asset_name: assets?.name ?? null,
      broker_name: brokers?.name ?? null,
      broker_code: brokers?.code ?? null,
    };
  }) as TradeDTO[];

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);

  return {
    data: flattened,
    meta: { page, limit, total, totalPages },
  };
}
