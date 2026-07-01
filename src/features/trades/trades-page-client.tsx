"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { getTradeLabels } from "@/lib/i18n/trades";
import type { TradeListResult } from "@/lib/trades/queries";
import type { TradeDTO, TradeListQuery } from "@/lib/validations/trades";

import { TradeFilters } from "./trade-filters";
import { TradeList } from "./trade-list";

const labels = getTradeLabels();

const SMALL_TRADE_THRESHOLD_USD = 1;

export function TradesPageClient({
  initialData,
  canWrite,
}: {
  initialData: TradeListResult;
  canWrite: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [trades, setTrades] = useState<TradeDTO[]>(initialData.data);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Partial<TradeListQuery>>({
    page: initialData.meta.page,
    limit: initialData.meta.limit,
  });
  const [hideSmallTrades, setHideSmallTrades] = useState(true);
  const [total, setTotal] = useState(initialData.meta.total);
  const [totalPages, setTotalPages] = useState(initialData.meta.totalPages);
  const [showDeniedToast, setShowDeniedToast] = useState(false);
  const isMounted = useRef(false);

  useEffect(() => {
    if (searchParams.get("denied") === "write") {
      setShowDeniedToast(true);
      const t = setTimeout(() => setShowDeniedToast(false), 3000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [searchParams]);

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

      const json = (await res.json()) as TradeListResult;
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
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    fetchTrades();
  }, [fetchTrades]);

  const handleFilterChange = useCallback(
    (updated: Partial<TradeListQuery>) => {
      setFilters((prev) => ({ ...prev, ...updated, page: 1 }));
    },
    [],
  );

  const handlePageChange = useCallback((newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  }, []);

  const handleEdit = useCallback(
    (id: string) => {
      router.push(`/trades/${id}/edit`);
    },
    [router],
  );

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta operación?")) return;

    try {
      const res = await fetch(`/api/v1/trades/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
      setTrades((prev) => prev.filter((t) => t.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch {
      alert("Error al eliminar la operación");
    }
  }, []);

  return (
    <div className="space-y-4">
      <TradeFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        hideSmallTrades={hideSmallTrades}
        onHideSmallTradesChange={setHideSmallTrades}
      />

      {loading && (
        <div className="py-12 text-center text-sm text-text-muted">
          {labels.loading}
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 p-4 text-center text-sm text-red-600 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <p className="text-xs text-text-muted">
            {total === 0
              ? "Sin operaciones para mostrar"
              : `${total} operación${total === 1 ? "" : "es"}`}
            {hideSmallTrades && total > 0
              ? ` (filtrando |total| < ${SMALL_TRADE_THRESHOLD_USD} USD)`
              : ""}
          </p>
          {showDeniedToast && (
            <div
              role="status"
              className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800"
            >
              {labels.readOnlyBanner}
            </div>
          )}
          <TradeList
            trades={trades}
            onEdit={handleEdit}
            onDelete={handleDelete}
            canWrite={canWrite}
          />
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-2xl bg-surface p-3 shadow-sm ring-1 ring-border-subtle">
              <p className="text-xs text-text-muted">
                Página {filters.page ?? 1} de {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={(filters.page ?? 1) <= 1 || loading}
                  onClick={() => handlePageChange((filters.page ?? 1) - 1)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  ‹ Anterior
                </button>
                <span className="text-xs font-medium text-text-secondary">
                  {filters.page ?? 1} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={(filters.page ?? 1) >= totalPages || loading}
                  onClick={() => handlePageChange((filters.page ?? 1) + 1)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
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
