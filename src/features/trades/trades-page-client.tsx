"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { getTradeLabels } from "@/lib/i18n/trades";
import type { TradeDTO, TradeListQuery } from "@/lib/validations/trades";

import { TradeFilters } from "./trade-filters";
import { TradeList } from "./trade-list";

const labels = getTradeLabels();

const SMALL_TRADE_THRESHOLD_USD = 1;

export function TradesPageClient() {
  const router = useRouter();
  const [trades, setTrades] = useState<TradeDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Partial<TradeListQuery>>({
    page: 1,
    limit: 50,
  });
  const [hideSmallTrades, setHideSmallTrades] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== "") {
          params.set(key, String(value));
        }
      }
      if (hideSmallTrades) {
        params.set("min_total_usd", String(SMALL_TRADE_THRESHOLD_USD));
      }

      const res = await fetch(`/api/v1/trades?${params.toString()}`);
      if (!res.ok) throw new Error(labels.errorLoading);

      const json = await res.json();
      setTrades(json.data ?? []);
      setTotal(json.meta?.total ?? 0);
      setTotalPages(json.meta?.totalPages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.errorLoading);
    } finally {
      setLoading(false);
    }
  }, [filters, hideSmallTrades]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const handleFilterChange = (updated: Partial<TradeListQuery>) => {
    setFilters((prev) => ({ ...prev, ...updated, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handleEdit = (id: string) => {
    router.push(`/trades/${id}/edit`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta operación?")) return;

    try {
      const res = await fetch(`/api/v1/trades/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
      setTrades((prev) => prev.filter((t) => t.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch {
      alert("Error al eliminar la operación");
    }
  };

  return (
    <div className="space-y-4">
      <TradeFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        hideSmallTrades={hideSmallTrades}
        onHideSmallTradesChange={setHideSmallTrades}
      />

      {loading && (
        <div className="py-12 text-center text-sm text-slate-500">
          {labels.loading}
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 p-4 text-center text-sm text-red-600 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <p className="text-xs text-slate-500">
            {total === 0
              ? "Sin operaciones para mostrar"
              : `${total} operación${total === 1 ? "" : "es"}`}
            {hideSmallTrades && total > 0
              ? ` (filtrando |total| < ${SMALL_TRADE_THRESHOLD_USD} USD)`
              : ""}
          </p>
          <TradeList
            trades={trades}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <p className="text-xs text-slate-500">
                Página {filters.page ?? 1} de {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={(filters.page ?? 1) <= 1 || loading}
                  onClick={() => handlePageChange((filters.page ?? 1) - 1)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  ‹ Anterior
                </button>
                <span className="text-xs font-medium text-slate-700">
                  {filters.page ?? 1} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={(filters.page ?? 1) >= totalPages || loading}
                  onClick={() => handlePageChange((filters.page ?? 1) + 1)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Siguiente ›
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
