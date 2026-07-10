"use client";

import { useCallback, useState } from "react";

import type { DashboardAggregate } from "@/lib/dashboard/aggregate";
import type {
  EvolutionResponse,
  ReturnsResponse,
  SnapshotResponse,
  SummaryResponse,
} from "@/lib/validations/dashboard";

import { getDashboardLabels } from "@/lib/i18n/dashboard";

const labels = getDashboardLabels();

export type DashboardPayload = {
  summary: SummaryResponse | null;
  evolution: EvolutionResponse | null;
  returns: ReturnsResponse | null;
  snapshot: SnapshotResponse | null;
};

export type DashboardDataState = {
  loading: boolean;
  error: string | null;
  payload: DashboardPayload;
  reload: () => Promise<void>;
};

function fromAggregate(agg: DashboardAggregate): DashboardPayload {
  return {
    summary: agg.summary ?? null,
    evolution: agg.evolution ?? null,
    returns: agg.returns ?? null,
    snapshot: agg.snapshot ?? null,
  };
}

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

export function useDashboardData(
  initial: DashboardPayload,
  queryParams = "",
): DashboardDataState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DashboardPayload>(initial);

  const reload = useCallback(async () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const aggregate = await fetchJson<DashboardAggregate>(
        `/api/v1/dashboard/aggregate?granularity=monthly&groupBy=month${queryParams}`,
        controller.signal,
      );
      setPayload(fromAggregate(aggregate));
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setError(err instanceof Error ? err.message : labels.errorLoading);
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  return {
    loading,
    error,
    payload,
    reload,
  };
}
