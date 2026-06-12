"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { getTradeLabels } from "@/lib/i18n/trades";
import type { TradeDTO, TradeListQuery } from "@/lib/validations/trades";

import { TradeFilters } from "./trade-filters";
import { TradeList } from "./trade-list";

const labels = getTradeLabels();

export function TradesPageClient() {
  const router = useRouter();
  const [trades, setTrades] = useState<TradeDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Partial<TradeListQuery>>({
    page: 1,
    limit: 20,
  });

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

      const res = await fetch(`/api/v1/trades?${params.toString()}`);
      if (!res.ok) throw new Error(labels.errorLoading);

      const json = await res.json();
      setTrades(json.data ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.errorLoading);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const handleFilterChange = (updated: Partial<TradeListQuery>) => {
    setFilters((prev) => ({ ...prev, ...updated, page: 1 }));
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
    } catch {
      alert("Error al eliminar la operación");
    }
  };

  return (
    <div className="space-y-4">
      <TradeFilters filters={filters} onFilterChange={handleFilterChange} />

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
        <TradeList trades={trades} onEdit={handleEdit} onDelete={handleDelete} />
      )}
    </div>
  );
}
