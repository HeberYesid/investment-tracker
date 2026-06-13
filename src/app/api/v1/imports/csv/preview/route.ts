import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCsvParser } from "@/lib/csv/registry";
import { validateParsedRows } from "@/lib/csv/validation";
import type { BrokerCode } from "@/lib/reference/brokers";
import type { CsvImportStatus } from "@/lib/csv/types";
import { badRequest, serverError } from "@/lib/api/errors";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const file = formData.get("file");
    const brokerCodeRaw = formData.get("broker_code");
    const portfolioId = formData.get("portfolio_id");
    const fxRateRaw = formData.get("fx_rate_to_usd");
    const purchaseDateRaw = formData.get("purchase_date");

    if (!(file instanceof File)) {
      return badRequest("Debes adjuntar un archivo.");
    }
    if (typeof brokerCodeRaw !== "string") {
      return badRequest("broker_code es requerido.");
    }
    if (typeof portfolioId !== "string") {
      return badRequest("portfolio_id es requerido.");
    }

    const brokerCode = brokerCodeRaw as BrokerCode;
    const validBrokers: BrokerCode[] = [
      "ETORO",
      "XTB",
      "TRII",
      "ETRADING_BANCOLOMBIA",
    ];
    if (!validBrokers.includes(brokerCode)) {
      return badRequest(`Bróker no soportado: ${brokerCodeRaw}`);
    }

    // Validate UUID format for portfolio_id
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(portfolioId)) {
      return badRequest("portfolio_id no es un UUID válido.");
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();

    // Parse CSV/XLSX
    const parser = getCsvParser(brokerCode);
    let parsedTrades;
    try {
      parsedTrades = parser.parse(file.name, arrayBuffer, {
        purchaseDate:
          typeof purchaseDateRaw === "string" ? purchaseDateRaw : undefined,
      });
    } catch (err) {
      return badRequest(
        `Error al parsear el archivo: ${err instanceof Error ? err.message : "Error desconocido"}`,
      );
    }

    if (parsedTrades.length === 0) {
      return badRequest(
        "El archivo no contiene operaciones válidas para este bróker.",
      );
    }

    // Apply FX rate to COP trades if provided.
    // The user enters the TRM as "1 USD = X COP" (e.g. 3900), but
    // normalizeTradeUsdValues computes price_usd = price_original * fx_rate_to_usd,
    // so we must store the inverse: "1 COP = 1/X USD".
    if (typeof fxRateRaw === "string" && fxRateRaw.length > 0) {
      const fxRate = Number.parseFloat(fxRateRaw);
      if (!Number.isNaN(fxRate) && fxRate > 0) {
        const fxRateToUsd = 1 / fxRate;
        for (const trade of parsedTrades) {
          if (trade.currency_original === "COP") {
            trade.fx_rate_to_usd = fxRateToUsd;
          }
        }
      }
    }

    // Set default FX rate for USD trades
    for (const trade of parsedTrades) {
      if (trade.currency_original === "USD" && trade.fx_rate_to_usd === 0) {
        trade.fx_rate_to_usd = 1;
      }
    }

    // Validate rows
    const validations = validateParsedRows(parsedTrades, brokerCode);
    const validCount = validations.filter((v) => v.valid).length;
    const invalidCount = validations.filter((v) => !v.valid).length;

    // Verify broker exists
    const supabase = createServerSupabaseClient();
    const { data: broker, error: brokerError } = await supabase
      .from("brokers")
      .select("id")
      .eq("code", brokerCode)
      .single();

    if (brokerError || !broker) {
      return badRequest(`Bróker no encontrado: ${brokerCode}`);
    }

    // Resolve portfolio: use provided ID if it exists, otherwise find/create "Default"
    let resolvedPortfolioId: string;
    const { data: providedPortfolio } = await supabase
      .from("portfolios")
      .select("id")
      .eq("id", portfolioId)
      .maybeSingle();

    if (providedPortfolio) {
      resolvedPortfolioId = providedPortfolio.id;
    } else {
      // Find or create a "Default" portfolio
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

    // Store import record with PREVIEWED status
    const { data: importRecord, error: importError } = await supabase
      .from("csv_imports")
      .insert({
        portfolio_id: resolvedPortfolioId,
        broker_id: broker.id,
        file_name: file.name,
        status: "PREVIEWED" as CsvImportStatus,
        total_rows: parsedTrades.length,
        valid_rows: validCount,
        invalid_rows: invalidCount,
      })
      .select()
      .single();

    if (importError || !importRecord) {
      return serverError(
        `Error al guardar la importación: ${importError?.message ?? "Error desconocido"}`,
      );
    }

    // Store each row with validation metadata
    const rowInserts = validations.map((v) => ({
      import_id: importRecord.id,
      row_number: v.rowNumber,
      raw_data_json: v.raw,
      parsed_data_json: v.parsed,
      validation_status: v.valid ? "VALID" : "INVALID",
      validation_error: v.error,
    }));

    const { error: rowsError } = await supabase
      .from("csv_import_rows")
      .insert(rowInserts);

    if (rowsError) {
      return serverError(
        `Error al guardar las filas: ${rowsError.message}`,
      );
    }

    return NextResponse.json(
      {
        import: importRecord,
        rows: validations.map((v) => ({
          row_number: v.rowNumber,
          valid: v.valid,
          error: v.error,
          parsed: v.parsed,
        })),
        summary: {
          total: parsedTrades.length,
          valid: validCount,
          invalid: invalidCount,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("formdata")) {
      return badRequest("Error al leer el formulario.");
    }
    return serverError();
  }
}
