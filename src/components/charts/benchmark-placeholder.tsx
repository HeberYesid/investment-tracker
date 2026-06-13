"use client";

import { getDashboardLabels } from "@/lib/i18n/dashboard";

const labels = getDashboardLabels();

export function BenchmarkPlaceholder() {
  return (
    <section
      className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-6 text-center"
      data-testid="benchmark-placeholder"
    >
      <h2 className="text-lg font-semibold text-slate-950">
        {labels.benchmarkTitle}
      </h2>
      <p className="mt-2 inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
        {labels.benchmarkAvailable}
      </p>
      <p className="mt-3 text-sm text-slate-600">{labels.benchmarkDescription}</p>
    </section>
  );
}
