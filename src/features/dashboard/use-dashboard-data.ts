"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  DistributionResponse,
  DrawdownResponse,
  EvolutionResponse,
  ReturnsResponse,
  SummaryResponse,
} from "@/lib/validations/dashboard";

import { getDashboardLabels } from "@/lib/i18n/dashboard";

const labels = getDashboardLabels();

export type DashboardPayload = {
  summary: SummaryResponse | null;
  distribution: DistributionResponse | null;
  evolution: EvolutionResponse | null;
  returns: ReturnsResponse | null;
  drawdown: DrawdownResponse | null;
};

export type DashboardDataState = {
  loading: boolean;
  error: string | null;
  payload: DashboardPayload;
  reload: () => Promise<void>;
};

const initialPayload: DashboardPayload = {
  summary: null,
  distribution: null,
  evolution: null,
  returns: null,
  drawdown: null,
};

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      typeof body?.error === "string" ? body.error : labels.errorLoading;
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export function useDashboardData(): DashboardDataState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DashboardPayload>(initialPayload);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const [summary, distribution, evolution, returnsResp, drawdown] =
        await Promise.all([
          fetchJson<SummaryResponse>("/api/v1/dashboard/summary", signal),
          fetchJson<DistributionResponse>(
            "/api/v1/dashboard/distribution?dim=broker",
            signal,
          ),
          fetchJson<EvolutionResponse>(
            "/api/v1/dashboard/evolution?granularity=monthly",
            signal,
          ),
          fetchJson<ReturnsResponse>(
            "/api/v1/dashboard/returns?groupBy=month",
            signal,
          ),
          fetchJson<DrawdownResponse>("/api/v1/dashboard/drawdown", signal),
        ]);

      setPayload({
        summary,
        distribution,
        evolution,
        returns: returnsResp,
        drawdown,
      });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setError(err instanceof Error ? err.message : labels.errorLoading);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return {
    loading,
    error,
    payload,
    reload: async () => {
      const controller = new AbortController();
      await load(controller.signal);
    },
  };
}
