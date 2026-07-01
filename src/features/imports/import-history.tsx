"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, FileText, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

import { getImportLabels } from "@/lib/i18n/imports";
import { errors } from "@/lib/i18n/errors";

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

export function ImportHistory() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/imports/history");
      if (!res.ok) throw new Error("Error al cargar historial");
      const data = await res.json();
      setImports(data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : errors.unknown);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "COMMITTED":
        return <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
      case "FAILED":
        return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
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
      <section className="rounded-[2rem] bg-surface p-6 shadow-sm ring-1 ring-border-subtle sm:p-8">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] bg-surface p-6 shadow-sm ring-1 ring-border-subtle sm:p-8">
      <h2 className="text-lg font-semibold text-text-primary">
        {labels.history}
      </h2>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="h-4 w-4" />
          <p>{error}</p>
        </div>
      )}

      {!error && imports.length === 0 && (
        <div className="mt-6 text-center">
          <FileText className="mx-auto h-10 w-10 text-text-subtle" />
          <p className="mt-3 text-sm font-medium text-text-secondary">
            {labels.noHistory}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {labels.noHistoryDescription}
          </p>
        </div>
      )}

      {imports.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                <th className="pb-2 pr-2">{labels.fileName}</th>
                <th className="pb-2 pr-2">{labels.selectBroker}</th>
                <th className="pb-2 pr-2">{labels.statusLabel}</th>
                <th className="pb-2 pr-2 text-right">{labels.importedCount}</th>
                <th className="pb-2 text-right">{labels.importDate}</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => (
                <tr key={imp.id} className="border-b border-border-subtle">
                  <td className="py-2 pr-2 font-medium text-text-primary">
                    {imp.file_name}
                  </td>
                  <td className="py-2 pr-2 text-text-secondary">
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
                  <td className="py-2 text-right text-xs text-text-muted">
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
