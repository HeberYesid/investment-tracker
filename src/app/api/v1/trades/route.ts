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
import { badRequest, forbidden, validationError, serverError } from "@/lib/api/errors";
import { fetchTradesPage } from "@/lib/trades/queries";
import { AssetResolutionError, resolveAssetReferences } from "@/lib/asset-catalog/resolve-references";
import { errors } from "@/lib/i18n/errors";

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

    const [reference] = await resolveAssetReferences(supabase, {
      portfolioId: portfolio.portfolioId, source: "MANUAL", importId: null,
    }, [{ key: "manual", ticker: input.ticker, ...(input.asset_reference && { decision: input.asset_reference }) }]);
    if (reference?.status !== "resolved") {
      return validationError([{ path: ["asset_reference"], message: errors.assetReferenceChoice }]);
    }
    const { asset_id } = reference;

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
  } catch (error) {
    if (error instanceof AssetResolutionError && error.code === "42501") return forbidden();
    return serverError();
  }
}
