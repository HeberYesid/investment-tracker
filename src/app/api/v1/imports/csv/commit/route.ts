import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import { TradeQuantityInput, normalizeTradeUsdValues, type CreateTradeInput } from "@/lib/validations/trades";
import type { ParsedCsvTrade } from "@/lib/csv/types";
import { badRequest, forbidden, serverError } from "@/lib/api/errors";
import { AssetResolutionError, resolveAssetReferences } from "@/lib/asset-catalog/resolve-references";
import { planCsvAssetReferences } from "@/lib/asset-catalog/csv-references";
import { AssetDecision, AssetId } from "@/lib/validations/asset-catalog";
import { z } from "zod";
import { errors as errorMessages } from "@/lib/i18n/errors";
import { getImportLabels } from "@/lib/i18n/imports";

const CommitBody = z.object({
  import_id: z.string().uuid(),
  asset_references: z.record(AssetId, AssetDecision).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireApiUserWithPortfolio(undefined, { writeAccess: true, request });
  if (auth.response) return auth.response;
  const { supabase, portfolio } = auth;

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
    const { data: importRecord, error: importError } = await supabase
      .from("csv_imports")
      .select("*")
      .eq("id", import_id)
      .eq("portfolio_id", portfolio.portfolioId)
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
      .select("*, csv_imports!inner(id)")
      .eq("import_id", import_id)
      .eq("csv_imports.portfolio_id", portfolio.portfolioId)
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

    const decisions = new Map(Object.entries(parsed.data.asset_references ?? {}));
    const rowIds = new Set(validRows.map(({ id }) => id));
    if (Array.from(decisions.keys()).some((id) => !rowIds.has(id))) {
      return badRequest(errorMessages.assetReferenceRowsMismatch);
    }
    const errors: string[] = [];
    const candidates = validRows.flatMap((row) => {
      const stored: unknown = row.parsed_data_json;
      const pair = TradeQuantityInput.safeParse(stored);
      if (!pair.success) {
        const reason = pair.error.issues.find(({ path }) => path[0] === "quantity")?.message
          ?? getImportLabels().invalidStoredTradePair;
        errors.push(`Fila ${row.row_number}: ${reason}`);
        decisions.delete(row.id);
        return [];
      }
      // El par se valida en runtime; el resto conserva el contrato del preview y el flujo monetario CSV.
      const parsedData = { ...(stored as Omit<ParsedCsvTrade, "trade_type" | "quantity">), ...pair.data };
      return [{ id: row.id, rowNumber: row.row_number, parsedData }];
    });
    const { batches } = planCsvAssetReferences(candidates.flatMap(({ id, parsedData }) => {
      return typeof parsedData.ticker === "string" ? [{ id, ticker: parsedData.ticker }] : [];
    }), decisions);
    const assetIdByRow = new Map<string, string>();
    for (const batch of batches) {
      const results = await resolveAssetReferences(supabase, {
        portfolioId: portfolio.portfolioId, source: "CSV", importId: import_id,
      }, batch);
      const refs = new Map(results.flatMap((result) => result.status === "resolved" ? [[result.key, result.asset_id] as const] : []));
      for (const { key, row_ids } of batch) {
        const assetId = refs.get(key);
        if (assetId) for (const id of row_ids ?? []) assetIdByRow.set(id, assetId);
      }
    }

    const tradeInserts: Array<Record<string, unknown>> = [];

    for (const { id, rowNumber, parsedData } of candidates) {
      const asset_id = assetIdByRow.get(id);
      if (!asset_id) {
        errors.push(`Fila ${rowNumber}: ${errorMessages.assetReferenceChoice}`);
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
          `Fila ${rowNumber}: ${err instanceof Error ? err.message : errorMessages.unknown}`,
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
    const { error: finalizeError, count: finalized } = await supabase
      .from("csv_imports")
      .update({ status: finalStatus }, { count: "exact" })
      .eq("id", import_id)
      .eq("portfolio_id", portfolio.portfolioId);

    if (finalizeError || finalized === 0) return serverError();

    await supabase.from("audit_events").insert({
      actor_user_id: auth.user.id,
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
    revalidateTag("market-prices", "max");

    return NextResponse.json(
      {
        import_id,
        status: finalStatus,
        imported: importedCount,
        errors: errors,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AssetResolutionError && error.code === "42501") return forbidden();
    return serverError();
  }
}
