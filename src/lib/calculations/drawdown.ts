import type { EvolutionPoint } from "./evolution";

export type DrawdownPoint = {
  date: string;
  valueUsd: number;
  peakUsd: number;
  drawdownPct: number;
};

export type DrawdownResult = {
  series: DrawdownPoint[];
  maxDrawdownPct: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateDrawdown(
  points: EvolutionPoint[],
): DrawdownResult {
  if (points.length === 0) {
    return { series: [], maxDrawdownPct: 0 };
  }

  const sorted = [...points].sort((a, b) =>
    (a.date ?? "").localeCompare(b.date ?? ""),
  );

  let peak = sorted[0].valueUsd;
  let maxDrawdownPct = 0;
  const series: DrawdownPoint[] = [];

  for (const point of sorted) {
    if (point.valueUsd > peak) peak = point.valueUsd;
    const drawdownPct =
      peak > 0 ? round2(((point.valueUsd - peak) / peak) * 100) : 0;
    series.push({
      date: point.date,
      valueUsd: point.valueUsd,
      peakUsd: peak,
      drawdownPct,
    });
    if (drawdownPct < maxDrawdownPct) maxDrawdownPct = drawdownPct;
  }

  return { series, maxDrawdownPct: round2(maxDrawdownPct) };
}
