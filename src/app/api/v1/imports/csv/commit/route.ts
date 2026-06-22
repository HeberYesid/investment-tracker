import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiUser } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { normalizeTradeUsdValues, type CreateTradeInput } from "@/lib/validations/trades";
import type { ParsedCsvTrade } from "@/lib/csv/types";
import { badRequest, serverError } from "@/lib/api/errors";
import { createYahooProvider } from "@/lib/market-data/yahoo";
import { candidateYahooSymbols } from "@/lib/market-data/symbols";
import type { AssetProfile } from "@/lib/market-data/types";
import { z } from "zod";
import { errors as errorMessages } from "@/lib/i18n/errors";

const CommitBody = z.object({
  import_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const body = await request.json();
    const parsed = CommitBody.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Error de validación", details: parsed.error.issues },
        { status: 422 },
      );
    }

    const { import_id } = parsed.data;
    const portfolio = await getCurrentPortfolio();
    if (!portfolio) {
      return badRequest("No se encontró un portafolio para el usuario.");
    }

    const { data: importRecord, error: importError } = await supabase
      .from("csv_imports")
      .select("*")
      .eq("id", import_id)
      .single();

    if (importError || !importRecord) {
      return badRequest("Importación no encontrada.");
    }

    if (importRecord.status === "COMMITTED") {
      return NextResponse.json(
        { error: "Esta importación ya fue confirmada." },
        { status: 409 },
      );
    }

    if (importRecord.status === "FAILED") {
      return badRequest(
        "Esta importación falló y no puede ser confirmada.",
      );
    }

    const { data: validRows, error: rowsError } = await supabase
      .from("csv_import_rows")
      .select("*")
      .eq("import_id", import_id)
      .eq("validation_status", "VALID");

    if (rowsError) {
      return serverError(`Error al leer las filas: ${rowsError.message}`);
    }

    if (!validRows || validRows.length === 0) {
      return badRequest(
        "No hay filas válidas para confirmar en esta importación.",
      );
    }

    const broker_id = importRecord.broker_id;

    const tickerCurrency = new Map<string, string>();
    for (const row of validRows) {
      const parsedData = row.parsed_data_json as ParsedCsvTrade | null;
      if (!parsedData) continue;
      const upper = parsedData.ticker.toUpperCase();
      if (!tickerCurrency.has(upper)) {
        tickerCurrency.set(upper, parsedData.currency_original);
      }
    }
    const uniqueTickers = Array.from(tickerCurrency.keys());

    const assetIdByTicker = new Map<string, string>();
    if (uniqueTickers.length > 0) {
      const { data: existingAssets } = await supabase
        .from("assets")
        .select("id, ticker")
        .in("ticker", uniqueTickers);
      for (const row of existingAssets ?? []) {
        if (row.ticker) assetIdByTicker.set(row.ticker as string, row.id as string);
      }
    }

    const newTickers = uniqueTickers.filter(
      (t) => !assetIdByTicker.has(t),
    );
    const profileByTicker = new Map<string, AssetProfile>();
    if (newTickers.length > 0) {
      const profileProvider = createYahooProvider();
      const CONCURRENCY = 5;
      try {
        for (let i = 0; i < newTickers.length; i += CONCURRENCY) {
          const slice = newTickers.slice(i, i + CONCURRENCY);
          const profiles = await Promise.all(
            slice.map(async (ticker) => {
              try {
                const candidates = candidateYahooSymbols({
                  ticker,
                  yahooSymbol: null,
                  currency: tickerCurrency.get(ticker) ?? null,
                });
                const result =
                  await profileProvider.fetchProfileWithCandidates(candidates);
                return [ticker, result] as const;
              } catch {
                return [ticker, { status: "error" as const, message: "unknown" }] as const;
              }
            }),
          );
          for (const [ticker, result] of profiles) {
            if (result.status === "ok") {
              profileByTicker.set(ticker, result.profile);
            }
          }
        }
      } catch (err) {
        console.warn("[csv-commit] asset profile enrichment failed:", err);
      }

      const newAssetPayloads = newTickers.map((ticker) => {
        const profile = profileByTicker.get(ticker);
        const payload: Record<string, string> = {
          ticker,
          asset_type: "STOCK",
          currency: tickerCurrency.get(ticker) ?? "USD",
          name: ticker,
        };
        if (profile?.sector) payload.sector = profile.sector;
        if (profile?.country) payload.country = profile.country;
        return payload;
      });

      const { data: insertedAssets, error: insertAssetsError } = await supabase
        .from("assets")
        .insert(newAssetPayloads)
        .select("id, ticker");

      if (insertAssetsError) {
        return serverError(
          `Error al crear activos: ${insertAssetsError.message}`,
        );
      }
      for (const row of insertedAssets ?? []) {
        if (row.ticker) assetIdByTicker.set(row.ticker as string, row.id as string);
      }
    }

    const errors: string[] = [];
    const tradeInserts: Array<Record<string, unknown>> = [];

    for (const row of validRows) {
      const parsedData = row.parsed_data_json as ParsedCsvTrade | null;
      if (!parsedData) continue;

      const ticker = parsedData.ticker.toUpperCase();
      const asset_id = assetIdByTicker.get(ticker);
      if (!asset_id) {
        errors.push(
          `Fila ${row.row_number}: No se pudo resolver el activo ${ticker}.`,
        );
        continue;
      }

      try {
        const tradeInput: CreateTradeInput = {
          portfolio_id: portfolio.portfolioId,
          broker_id,
          asset_id,
          trade_date: parsedData.trade_date,
          trade_type: parsedData.trade_type,
          quantity: parsedData.quantity,
          price_original: parsedData.price_original,
          currency_original: parsedData.currency_original,
          commission_original: parsedData.commission_original,
          fx_rate_to_usd: parsedData.fx_rate_to_usd,
          source: "CSV",
        };

        const usdValues = normalizeTradeUsdValues(tradeInput);

        tradeInserts.push({
          portfolio_id: portfolio.portfolioId,
          broker_id,
          asset_id,
          trade_date: parsedData.trade_date,
          trade_type: parsedData.trade_type,
          quantity: parsedData.quantity,
          price_original: parsedData.price_original,
          currency_original: parsedData.currency_original,
          commission_original: parsedData.commission_original,
          fx_rate_to_usd: parsedData.fx_rate_to_usd,
          source: "CSV",
          source_file_id: import_id,
          ...usdValues,
        });
      } catch (err) {
        errors.push(
          `Fila ${row.row_number}: ${err instanceof Error ? err.message : errorMessages.unknown}`,
        );
      }
    }

    let importedCount = 0;
    const TRADE_BATCH_SIZE = 500;
    for (let i = 0; i < tradeInserts.length; i += TRADE_BATCH_SIZE) {
      const chunk = tradeInserts.slice(i, i + TRADE_BATCH_SIZE);
      const { error: batchError } = await supabase
        .from("trades")
        .insert(chunk);
      if (batchError) {
        const startRow = i + 1;
        const endRow = Math.min(i + TRADE_BATCH_SIZE, tradeInserts.length);
        errors.push(
          `Lotes ${startRow}-${endRow}: Error al insertar operaciones: ${batchError.message}`,
        );
      } else {
        importedCount += chunk.length;
      }
    }

    const finalStatus = importedCount > 0 ? "COMMITTED" : "FAILED";
    await supabase
      .from("csv_imports")
      .update({ status: finalStatus })
      .eq("id", import_id);

    await supabase.from("audit_events").insert({
      portfolio_id: portfolio.portfolioId,
      entity_type: "csv_import",
      entity_id: import_id,
      action: "IMPORT",
      after_json: {
        import_id,
        imported_count: importedCount,
        error_count: errors.length,
        errors: errors.slice(0, 10),
      },
    });

    revalidatePath("/");
    revalidatePath("/avanzado");

    return NextResponse.json(
      {
        import_id,
        status: finalStatus,
        imported: importedCount,
        errors: errors,
      },
      { status: 200 },
    );
  } catch {
    return serverError();
  }
}
