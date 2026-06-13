import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeTradeUsdValues, type CreateTradeInput } from "@/lib/validations/trades";
import type { ParsedCsvTrade } from "@/lib/csv/types";
import { badRequest, serverError } from "@/lib/api/errors";
import { z } from "zod";

const CommitBody = z.object({
  import_id: z.string().uuid(),
  portfolio_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CommitBody.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Error de validación", details: parsed.error.issues },
        { status: 422 },
      );
    }

    const { import_id, portfolio_id } = parsed.data;
    const supabase = createServerSupabaseClient();

    // Fetch the import record
    const { data: importRecord, error: importError } = await supabase
      .from("csv_imports")
      .select("*")
      .eq("id", import_id)
      .single();

    if (importError || !importRecord) {
      return badRequest("Importación no encontrada.");
    }

    // Resolve portfolio: prefer the one from the import record, fallback to "Default"
    let resolvedPortfolioId: string;
    const { data: providedPortfolio } = await supabase
      .from("portfolios")
      .select("id")
      .eq("id", portfolio_id)
      .maybeSingle();

    if (providedPortfolio) {
      resolvedPortfolioId = providedPortfolio.id;
    } else {
      const { data: existingPortfolio } = await supabase
        .from("portfolios")
        .select("id")
        .eq("name", "Default")
        .limit(1)
        .maybeSingle();

      if (existingPortfolio) {
        resolvedPortfolioId = existingPortfolio.id;
      } else {
        const { data: newPortfolio, error: portfolioError } = await supabase
          .from("portfolios")
          .insert({ name: "Default", base_currency: "USD" })
          .select("id")
          .single();

        if (portfolioError || !newPortfolio) {
          return badRequest("No se pudo crear el portafolio por defecto.");
        }
        resolvedPortfolioId = newPortfolio.id;
      }
    }

    // Prevent duplicate commits
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

    // Fetch valid rows only
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

    // Get broker info from the import
    const broker_id = importRecord.broker_id;

    let importedCount = 0;
    const errors: string[] = [];

    for (const row of validRows) {
      const parsedData = row.parsed_data_json as ParsedCsvTrade | null;
      if (!parsedData) continue;

      try {
        // Upsert asset
        const ticker = parsedData.ticker.toUpperCase();
        const { data: existingAsset } = await supabase
          .from("assets")
          .select("id")
          .eq("ticker", ticker)
          .limit(1)
          .maybeSingle();

        let asset_id: string;
        if (existingAsset) {
          asset_id = existingAsset.id;
        } else {
          const { data: newAsset, error: assetError } = await supabase
            .from("assets")
            .insert({
              ticker,
              asset_type: "STOCK",
              currency: parsedData.currency_original,
              name: ticker,
            })
            .select("id")
            .single();

          if (assetError || !newAsset) {
            errors.push(
              `Fila ${row.row_number}: No se pudo crear el activo ${ticker}.`,
            );
            continue;
          }
          asset_id = newAsset.id;
        }

        // Build the trade input
        const tradeInput: CreateTradeInput = {
          portfolio_id: resolvedPortfolioId,
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

        // Insert the trade
        const { error: tradeError } = await supabase.from("trades").insert({
          portfolio_id: resolvedPortfolioId,
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

        if (tradeError) {
          errors.push(
            `Fila ${row.row_number}: Error al insertar la operación: ${tradeError.message}`,
          );
          continue;
        }

        importedCount++;
      } catch (err) {
        errors.push(
          `Fila ${row.row_number}: ${err instanceof Error ? err.message : "Error desconocido"}`,
        );
      }
    }

    // Update import status
    const finalStatus = importedCount > 0 ? "COMMITTED" : "FAILED";
    await supabase
      .from("csv_imports")
      .update({ status: finalStatus })
      .eq("id", import_id);

    // Record audit event
    await supabase.from("audit_events").insert({
      portfolio_id: resolvedPortfolioId,
      entity_type: "csv_import",
      entity_id: import_id,
      action: "IMPORT",
      after_json: {
        import_id,
        imported_count: importedCount,
        error_count: errors.length,
        errors: errors.slice(0, 10), // Limit error storage
      },
    });

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
