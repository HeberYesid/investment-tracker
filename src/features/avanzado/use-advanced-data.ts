"use client";

import { useCallback, useState } from "react";

import type { DashboardAggregate } from "@/lib/dashboard/aggregate";
import { getDashboardLabels } from "@/lib/i18n/dashboard";
import type {
  DistributionResponse,
  EvolutionResponse,
  ReturnsResponse,
  SnapshotResponse,
  SummaryResponse,
} from "@/lib/validations/dashboard";

const labels = getDashboardLabels();

export type AdvancedPayload = {
  summary: SummaryResponse | null;
  distribution: DistributionResponse | null;
  evolution: EvolutionResponse | null;
  returns: ReturnsResponse | null;
  snapshot: SnapshotResponse | null;
};

export type AdvancedDataState = {
  loading: boolean;
  error: string | null;
  payload: AdvancedPayload;
  reload: () => Promise<void>;
};

function fromAggregate(agg: DashboardAggregate): AdvancedPayload {
  return {
    summary: agg.summary ?? null,
    distribution: agg.distribution ?? null,
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

export function useAdvancedData(initial: AdvancedPayload): AdvancedDataState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AdvancedPayload>(initial);

  const reload = useCallback(async () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const aggregate = await fetchJson<DashboardAggregate>(
        "/api/v1/dashboard/aggregate?granularity=monthly&groupBy=stock&dim=broker",
        controller.signal,
      );
      setPayload(fromAggregate(aggregate));
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setError(err instanceof Error ? err.message : labels.errorLoading);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    payload,
    reload,
  };
}
