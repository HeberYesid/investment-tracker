"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { getTradeLabels } from "@/lib/i18n/trades";
import { errors } from "@/lib/i18n/errors";
import { EXPECTED_PORTFOLIO_HEADER } from "@/lib/portfolio-context";
import type { TradeListResult } from "@/lib/trades/queries";
import type { TradeDTO, TradeListQuery } from "@/lib/validations/trades";

import { TradeFilters } from "./trade-filters";
import { TradeList } from "./trade-list";

const labels = getTradeLabels();

const SMALL_TRADE_THRESHOLD_USD = 1;

export function TradesPageClient({
  initialData,
  canWrite,
  portfolioId,
}: {
  initialData: TradeListResult;
  canWrite: boolean;
  portfolioId: string;
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
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
    if (!confirm("Estas seguro de eliminar esta operacion?")) return;

    try {
      const res = await fetch(`/api/v1/trades/${id}`, { method: "DELETE", headers: { [EXPECTED_PORTFOLIO_HEADER]: portfolioId } });
      if (res.status === 409) { setError(errors.stalePortfolio); return; }
      if (!res.ok) throw new Error("Error al eliminar");
      setTrades((prev) => prev.filter((t) => t.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch {
      alert("Error al eliminar la operacion");
    }
  }, [portfolioId]);

  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Eliminar ${selectedIds.size} operaciones seleccionadas?`)) return;

    setBulkDeleting(true);
    try {
      const res = await fetch("/api/v1/trades/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", [EXPECTED_PORTFOLIO_HEADER]: portfolioId },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.status === 409) { setError(errors.stalePortfolio); return; }
      if (!res.ok) throw new Error("Error al eliminar");
      const json = (await res.json()) as { deleted: number };
      setTrades((prev) => prev.filter((t) => !selectedIds.has(t.id)));
      setTotal((prev) => Math.max(0, prev - json.deleted));
      setSelectedIds(new Set());
    } catch {
      alert("Error al eliminar operaciones");
    } finally {
      setBulkDeleting(false);
    }
  }, [portfolioId, selectedIds]);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === trades.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(trades.map((t) => t.id)));
    }
  }, [selectedIds.size, trades]);

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
          {canWrite && trades.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1 text-text-muted">
                <input
                  type="checkbox"
                  checked={selectedIds.size === trades.length && trades.length > 0}
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded accent-primary-600"
                />
                Seleccionar todo
              </label>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="rounded-lg bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-950/40 dark:text-red-300"
                >
                  {bulkDeleting
                    ? "Eliminando..."
                    : `Eliminar (${selectedIds.size})`}
                </button>
              )}
            </div>
          )}
          <TradeList
            trades={trades}
            onEdit={handleEdit}
            onDelete={handleDelete}
            canWrite={canWrite}
            selectedIds={canWrite ? selectedIds : undefined}
            onSelect={canWrite ? handleSelect : undefined}
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
