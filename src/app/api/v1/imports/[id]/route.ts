import { NextRequest, NextResponse } from "next/server";
import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import { badRequest, notFound, serverError } from "@/lib/api/errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUserWithPortfolio();
  if (auth.response) return auth.response;
  const { supabase, portfolio } = auth;

  try {
    const { id } = await params;

    const { data: importRecord, error } = await supabase
      .from("csv_imports")
      .select("*, brokers(name, code)")
      .eq("id", id)
      .eq("portfolio_id", portfolio.portfolioId)
      .single();

    if (error || !importRecord) {
      return notFound("Importación no encontrada.");
    }

    const { data: rows, error: rowsError } = await supabase
      .from("csv_import_rows")
      .select("*, csv_imports!inner(id)")
      .eq("import_id", id)
      .eq("csv_imports.portfolio_id", portfolio.portfolioId)
      .order("row_number", { ascending: true });

    if (rowsError) {
      return serverError(`Error al leer las filas: ${rowsError.message}`);
    }

    return NextResponse.json({
      import: importRecord,
      rows: (rows ?? []).map((row) => ({
        id: row.id,
        row_number: row.row_number,
        raw_data_json: row.raw_data_json,
        parsed_data_json: row.parsed_data_json,
        validation_status: row.validation_status,
        validation_error: row.validation_error,
      })),
    });
  } catch {
    return serverError();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUserWithPortfolio(undefined, { writeAccess: true, request });
  if (auth.response) return auth.response;
  const { supabase, portfolio } = auth;

  try {
    const { id } = await params;

    const { data: importRecord, error } = await supabase
      .from("csv_imports")
      .select("id, status")
      .eq("id", id)
      .eq("portfolio_id", portfolio.portfolioId)
      .single();

    if (error || !importRecord) {
      return notFound("Importación no encontrada.");
    }

    if (importRecord.status === "COMMITTED") {
      return badRequest(
        "No se puede eliminar una importación ya confirmada. Elimine las operaciones individualmente.",
      );
    }

    const { data: deleted, error: deleteError } = await supabase.from("csv_imports")
      .delete()
      .eq("id", id)
      .eq("portfolio_id", portfolio.portfolioId)
      .neq("status", "COMMITTED")
      .select("id");
    if (deleteError) return serverError();
    if (!deleted?.length) return notFound("Importación no encontrada.");

    return new NextResponse(null, { status: 204 });
  } catch {
    return serverError();
  }
}
