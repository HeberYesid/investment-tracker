import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { getCsvParser } from "@/lib/csv/registry";
import { validateParsedRows } from "@/lib/csv/validation";
import type { BrokerCode } from "@/lib/reference/brokers";
import type { CsvImportStatus } from "@/lib/csv/types";
import { badRequest, serverError } from "@/lib/api/errors";

const validBrokers: BrokerCode[] = [
  "ETORO",
  "XTB",
  "TRII",
  "ETRADING_BANCOLOMBIA",
];

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const portfolio = await getCurrentPortfolio();
    if (!portfolio) {
      return badRequest("No se encontró un portafolio para el usuario.");
    }

    const formData = await request.formData();

    const file = formData.get("file");
    const brokerCodeRaw = formData.get("broker_code");
    const portfolioIdRaw = formData.get("portfolio_id");
    const fxRateRaw = formData.get("fx_rate_to_usd");
    const purchaseDateRaw = formData.get("purchase_date");

    if (!(file instanceof File)) {
      return badRequest("Debes adjuntar un archivo.");
    }
    if (typeof brokerCodeRaw !== "string") {
      return badRequest("broker_code es requerido.");
    }
    if (
      typeof portfolioIdRaw === "string" &&
      portfolioIdRaw.length > 0 &&
      portfolioIdRaw !== portfolio.portfolioId
    ) {
      return badRequest("portfolio_id no coincide con tu portafolio.");
    }
    if (
      typeof portfolioIdRaw === "string" &&
      portfolioIdRaw.length > 0 &&
      !uuidRegex.test(portfolioIdRaw)
    ) {
      return badRequest("portfolio_id no es un UUID válido.");
    }

    const brokerCode = brokerCodeRaw as BrokerCode;
    if (!validBrokers.includes(brokerCode)) {
      return badRequest(`Bróker no soportado: ${brokerCodeRaw}`);
    }

    const arrayBuffer = await file.arrayBuffer();

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

    for (const trade of parsedTrades) {
      if (trade.currency_original === "USD" && trade.fx_rate_to_usd === 0) {
        trade.fx_rate_to_usd = 1;
      }
    }

    const validations = validateParsedRows(parsedTrades, brokerCode);
    const validCount = validations.filter((v) => v.valid).length;
    const invalidCount = validations.filter((v) => !v.valid).length;

    const { data: broker, error: brokerError } = await supabase
      .from("brokers")
      .select("id")
      .eq("code", brokerCode)
      .single();

    if (brokerError || !broker) {
      return badRequest(`Bróker no encontrado: ${brokerCode}`);
    }

    const { data: importRecord, error: importError } = await supabase
      .from("csv_imports")
      .insert({
        portfolio_id: portfolio.portfolioId,
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
