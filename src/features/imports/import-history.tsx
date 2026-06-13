"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, FileText, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

import { getImportLabels } from "@/lib/i18n/imports";

type ImportRecord = {
  id: string;
  broker_id: string;
  file_name: string;
  status: "PREVIEWED" | "COMMITTED" | "FAILED";
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  created_at: string;
  brokers?: { name: string; code: string };
};

const labels = getImportLabels();

export function ImportHistory({ portfolioId }: { portfolioId: string }) {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

      if (!supabaseUrl || !anonKey) {
        // Fallback: fetch from local API
        const res = await fetch(
          `/api/v1/imports/history?portfolio_id=${portfolioId}`,
        );
        if (!res.ok) throw new Error("Error al cargar historial");
        const data = await res.json();
        setImports(data.data ?? []);
        return;
      }

      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, anonKey);
      const { data, error: dbError } = await supabase
        .from("csv_imports")
        .select("*, brokers(name, code)")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (dbError) throw new Error(dbError.message);
      setImports((data as ImportRecord[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "COMMITTED":
        return <CheckCircle className="h-4 w-4 text-emerald-600" />;
      case "FAILED":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "COMMITTED":
        return labels.committed;
      case "FAILED":
        return labels.failed;
      default:
        return labels.previewed;
    }
  };

  if (loading) {
    return (
      <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <h2 className="text-lg font-semibold text-slate-950">
        {labels.history}
      </h2>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" />
          <p>{error}</p>
        </div>
      )}

      {!error && imports.length === 0 && (
        <div className="mt-6 text-center">
          <FileText className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">
            {labels.noHistory}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {labels.noHistoryDescription}
          </p>
        </div>
      )}

      {imports.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="pb-2 pr-2">{labels.fileName}</th>
                <th className="pb-2 pr-2">{labels.selectBroker}</th>
                <th className="pb-2 pr-2">{labels.statusLabel}</th>
                <th className="pb-2 pr-2 text-right">{labels.importedCount}</th>
                <th className="pb-2 text-right">{labels.importDate}</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => (
                <tr key={imp.id} className="border-b border-slate-100">
                  <td className="py-2 pr-2 font-medium text-slate-950">
                    {imp.file_name}
                  </td>
                  <td className="py-2 pr-2 text-slate-600">
                    {imp.brokers?.name ?? imp.broker_id}
                  </td>
                  <td className="py-2 pr-2">
                    <span className="inline-flex items-center gap-1.5">
                      {statusIcon(imp.status)}
                      <span className="text-xs">{statusLabel(imp.status)}</span>
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-right font-mono">
                    {imp.valid_rows}/{imp.total_rows}
                  </td>
                  <td className="py-2 text-right text-xs text-slate-500">
                    {new Date(imp.created_at).toLocaleDateString("es-CO")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
