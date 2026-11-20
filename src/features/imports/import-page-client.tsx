"use client";

import { useMemo, useState, useCallback } from "react";
import { Loader2, Upload, FileText, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getImportLabels } from "@/lib/i18n/imports";
import { BROKER_SEEDS, type BrokerCode } from "@/lib/reference/brokers";
import { errors } from "@/lib/i18n/errors";
import { EXPECTED_PORTFOLIO_HEADER } from "@/lib/portfolio-context";
import { ImportHistory } from "./import-history";
import { ReferenceChoice, ReferenceSearch } from "@/features/asset-catalog/reference-choice";
import { catalogLabels } from "@/lib/i18n/asset-catalog";
import { CatalogTicker, normalizeCatalogTicker, type AssetDecision, type CandidateGroup } from "@/lib/validations/asset-catalog";

type RowPreview = {
  id: string;
  row_number: number;
  valid: boolean;
  error: string | null;
  parsed: {
    trade_date: string;
    trade_type: string;
    ticker: string;
    source_symbol?: string;
    quantity: number;
    price_original: number;
    currency_original: string;
    commission_original: number;
  } | null;
};

type PreviewResult = {
  import: { id: string; file_name: string };
  rows: RowPreview[];
  summary: { total: number; valid: number; invalid: number };
};

type CommitResult = {
  status: string;
  imported: number;
  errors: string[];
};

type ImportState =
  | { step: "select" }
  | {
      step: "upload";
      brokerCode: BrokerCode;
      fxRate: string;
      purchaseDate: string;
      file: File | null;
    }
  | {
      step: "preview";
      brokerCode: BrokerCode;
      preview: PreviewResult;
    }
  | { step: "done"; brokerCode: BrokerCode; result: CommitResult };

const labels = getImportLabels();

function sourceGroup(row: RowPreview) {
  return row.parsed?.source_symbol ? JSON.stringify([normalizeCatalogTicker(row.parsed.ticker), row.parsed.source_symbol]) : null;
}

function CsvAssetChoices({ rows, onChange }: { rows: RowPreview[]; onChange: (decisions: Record<string, AssetDecision>) => void }) {
  const validRows = useMemo(() => rows.filter((row) => row.valid && row.parsed && CatalogTicker.safeParse(row.parsed.ticker).success), [rows]);
  const groups = useMemo(() => {
    const map = new Map<string, RowPreview[]>();
    for (const row of validRows) {
      const key = sourceGroup(row);
      if (!key) continue;
      const entries = map.get(key) ?? [];
      entries.push(row);
      map.set(key, entries);
    }
    return map;
  }, [validRows]);
  const [candidates, setCandidates] = useState<CandidateGroup[]>([]);
  const candidatesByTicker = useMemo(() => new Map(candidates.map((group) => [group.ticker, group])), [candidates]);
  const [manual, setManual] = useState<Partial<Record<string, AssetDecision | null>>>({});
  const [draft, setDraft] = useState<Record<string, AssetDecision>>({});
  const [confirmed, setConfirmed] = useState<Record<string, AssetDecision>>({});

  function sync(rowsById: typeof manual, byGroup: Record<string, AssetDecision>) {
    const next: Record<string, AssetDecision> = {};
    for (const row of validRows) {
      const group = sourceGroup(row);
      const individual = rowsById[row.id];
      const decision = individual === undefined && group ? byGroup[group] : individual;
      if (decision) next[row.id] = decision;
    }
    onChange(next);
  }

  function choose(rowId: string, decision: AssetDecision | null | undefined) {
    const next = { ...manual };
    if (decision !== undefined) next[rowId] = decision;
    else delete next[rowId];
    setManual(next);
    sync(next, confirmed);
  }

  return <section className="mt-5 space-y-3" aria-label={catalogLabels.csvLegend}>
    <h3 className="font-semibold">{catalogLabels.csvLegend}</h3>
    <p className="text-sm text-text-secondary">{catalogLabels.csvHelp}</p>
    <ReferenceSearch tickers={validRows.map(({ parsed }) => normalizeCatalogTicker(parsed!.ticker))} onLoad={setCandidates} />
    {[...groups].filter(([, groupedRows]) => groupedRows.length > 1).map(([key, [row]]) => <div className="space-y-2" key={key}>
      <ReferenceChoice legend={catalogLabels.csvGroup.replace("{symbol}", row.parsed!.source_symbol!)}
        group={candidatesByTicker.get(normalizeCatalogTicker(row.parsed!.ticker))}
        onChange={(decision) => {
          const next = { ...draft };
          if (decision) next[key] = decision;
          else delete next[key];
          setDraft(next);
          if (confirmed[key]) { const rest = { ...confirmed }; delete rest[key]; setConfirmed(rest); sync(manual, rest); }
        }} />
      <Button type="button" variant="secondary" disabled={!draft[key]} onClick={() => {
        const next = { ...confirmed, [key]: draft[key] };
        setConfirmed(next);
        sync(manual, next);
      }}>{catalogLabels.csvUseGroup}</Button>
    </div>)}
    {validRows.map((row) => {
      const ticker = normalizeCatalogTicker(row.parsed!.ticker);
      const groupDecision = confirmed[sourceGroup(row) ?? ""];
      return <div className="space-y-1" key={row.id}>
        <ReferenceChoice legend={catalogLabels.csvRow.replace("{row}", String(row.row_number)).replace("{ticker}", ticker)}
          emptyLabel={groupDecision ? catalogLabels.csvUseConfirmedGroup : undefined}
          group={candidatesByTicker.get(ticker)} onChange={(decision) => choose(row.id, decision)} />
        {manual[row.id] === undefined && groupDecision && <p role="status" className="text-sm text-text-secondary">{catalogLabels.csvFromGroup}</p>}
        {manual[row.id] === null && <p role="status" className="text-sm text-text-secondary">{catalogLabels.csvIncompleteRow}</p>}
      </div>;
    })}
  </section>;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ACCEPTED_EXTENSIONS: Record<BrokerCode, string> = {
  TRII: ".csv",
  ETORO: ".xlsx,.xls",
  XTB: ".xlsx,.xls",
  ETRADING_BANCOLOMBIA: ".xls",
};

const inputClass =
  "h-11 w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary placeholder:text-text-subtle focus:border-border-default focus:outline-none focus:ring-2 focus:ring-focus-ring";

export function ImportPageClient({
  portfolioId,
  readOnly,
}: {
  portfolioId: string;
  readOnly: boolean;
}) {
  if (readOnly) {
    return <ReadOnlyImportView />;
  }
  return <ImportWizard portfolioId={portfolioId} />;
}

function ReadOnlyImportView() {
  return (
    <div className="space-y-6">
      <section
        role="status"
        className="rounded-[2rem] bg-surface p-6 shadow-sm ring-1 ring-border-subtle sm:p-8"
      >
        <h2 className="text-lg font-semibold text-text-primary">
          {labels.readOnlyTitle}
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          {labels.readOnlyDescription}
        </p>
      </section>
      <ImportHistory />
    </div>
  );
}

function ImportWizard({ portfolioId }: { portfolioId: string }) {
  const [state, setState] = useState<ImportState>({ step: "select" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetReferences, setAssetReferences] = useState<Record<string, AssetDecision>>({});

  const handleBrokerSelect = useCallback((brokerCode: BrokerCode) => {
    setState({
      step: "upload",
      brokerCode,
      fxRate: "",
      purchaseDate: todayIso(),
      file: null,
    });
    setError(null);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (state.step === "upload") {
        setState({ ...state, file });
      }
    },
    [state],
  );

  const handlePreview = useCallback(async () => {
    if (state.step !== "upload" || !state.file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", state.file);
      formData.append("broker_code", state.brokerCode);

      const fxRateNum = Number.parseFloat(state.fxRate);
      if (!Number.isNaN(fxRateNum) && fxRateNum > 0) {
        formData.append("fx_rate_to_usd", String(fxRateNum));
      }

      if (state.brokerCode === "ETRADING_BANCOLOMBIA") {
        formData.append("purchase_date", state.purchaseDate);
      }

      const res = await fetch("/api/v1/imports/csv/preview", {
        method: "POST",
        headers: { [EXPECTED_PORTFOLIO_HEADER]: portfolioId },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        const details = Array.isArray(err.details)
          ? err.details
              .map(
                (d: { message?: string; path?: (string | number)[] }) =>
                  `${d.path?.join(".") ?? "?"}: ${d.message ?? "inválido"}`,
              )
              .join("; ")
          : "";
        throw new Error(details || (typeof err.error === "string" ? err.error : err.error?.message) || "Error al analizar el archivo");
      }

      const preview: PreviewResult = await res.json();
      setAssetReferences({});
      setState({
        step: "preview",
        brokerCode: state.brokerCode,
        preview,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : errors.unknown);
    } finally {
      setLoading(false);
    }
  }, [portfolioId, state]);

  const handleCommit = useCallback(async () => {
    if (state.step !== "preview") return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/imports/csv/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json", [EXPECTED_PORTFOLIO_HEADER]: portfolioId },
        body: JSON.stringify({
          import_id: state.preview.import.id,
          asset_references: assetReferences,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        const details = Array.isArray(err.details)
          ? err.details
              .map(
                (d: { message?: string; path?: (string | number)[] }) =>
                  `${d.path?.join(".") ?? "?"}: ${d.message ?? "inválido"}`,
              )
              .join("; ")
          : "";
        throw new Error(
          details || (typeof err.error === "string" ? err.error : err.error?.message) || "Error al confirmar la importación",
        );
      }

      const result: CommitResult = await res.json();
      setState({
        step: "done",
        brokerCode: state.brokerCode,
        result,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : errors.unknown);
    } finally {
      setLoading(false);
    }
  }, [assetReferences, portfolioId, state]);

  const handleReset = useCallback(() => {
    setState({ step: "select" });
    setError(null);
  }, []);

  const broker =
    state.step !== "select"
      ? BROKER_SEEDS.find((b) => b.code === state.brokerCode)
      : null;
  const isCop = broker?.defaultCurrency === "COP";
  const isEtrading =
    state.step !== "select" &&
    state.brokerCode === "ETRADING_BANCOLOMBIA";

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <span
          className={state.step === "select" ? "font-semibold text-text-primary" : ""}
        >
          1. Bróker
        </span>
        <span className="text-text-subtle">→</span>
        <span
          className={state.step === "upload" ? "font-semibold text-text-primary" : ""}
        >
          2. Archivo
        </span>
        <span className="text-text-subtle">→</span>
        <span
          className={
            state.step === "preview" || state.step === "done"
              ? "font-semibold text-text-primary"
              : ""
          }
        >
          3. Revisar
        </span>
        <span className="text-text-subtle">→</span>
        <span
          className={state.step === "done" ? "font-semibold text-text-primary" : ""}
        >
          4. Confirmar
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Step 1: Select broker */}
      {state.step === "select" && (
        <section className="rounded-[2rem] bg-surface p-6 shadow-sm ring-1 ring-border-subtle sm:p-8">
          <h2 className="text-lg font-semibold text-text-primary">
            {labels.selectBroker}
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Selecciona el bróker del cual quieres importar operaciones.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {BROKER_SEEDS.map((b) => (
              <button
                key={b.code}
                onClick={() => handleBrokerSelect(b.code)}
                className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface p-4 text-left transition-colors hover:border-border-default hover:bg-surface-soft"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-action-primary text-sm font-bold text-action-primary-fg">
                  {b.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-text-primary">{b.name}</p>
                  <p className="text-xs text-text-muted">
                    Moneda: {b.defaultCurrency} · Formato:{" "}
                    {ACCEPTED_EXTENSIONS[b.code]}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 2: Upload */}
      {state.step === "upload" && broker && (
        <section className="rounded-[2rem] bg-surface p-6 shadow-sm ring-1 ring-border-subtle sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-text-primary">
                {labels.uploadFile} — {broker.name}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {labels.brokerInstructions[broker.code]}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {labels.fileFormat}: {ACCEPTED_EXTENSIONS[broker.code]}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleReset}>
              {labels.back}
            </Button>
          </div>

          <div className="mt-5">
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border-default bg-surface-soft p-8 transition-colors hover:border-text-muted hover:bg-surface-muted">
              <Upload className="h-8 w-8 text-text-muted" />
              <div className="text-center">
                <p className="text-sm font-medium text-text-secondary">
                  {state.file ? state.file.name : labels.dragDrop}
                </p>
                {state.file && (
                  <p className="mt-1 text-xs text-text-muted">
                    {(state.file.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>
              <input
                type="file"
                accept={ACCEPTED_EXTENSIONS[broker.code]}
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          {isCop && (
            <div className="mt-5 space-y-1.5">
              <label
                htmlFor="fx_rate"
                className="block text-sm font-medium text-text-secondary"
              >
                {labels.fxRate}
              </label>
              <input
                id="fx_rate"
                type="number"
                step="any"
                placeholder={labels.fxRatePlaceholder}
                value={state.fxRate}
                onChange={(e) =>
                  setState({ ...state, fxRate: e.target.value })
                }
                className={inputClass}
              />
              <p className="text-xs text-text-muted">{labels.fxRateHelp}</p>
            </div>
          )}

          {isEtrading && (
            <div className="mt-5 space-y-1.5">
              <label
                htmlFor="purchase_date"
                className="block text-sm font-medium text-text-secondary"
              >
                {labels.purchaseDate}
              </label>
              <input
                id="purchase_date"
                type="date"
                value={state.purchaseDate}
                onChange={(e) =>
                  setState({ ...state, purchaseDate: e.target.value })
                }
                className={inputClass}
              />
              <p className="text-xs text-text-muted">{labels.purchaseDateHelp}</p>
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <Button
              onClick={handlePreview}
              disabled={!state.file || loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {labels.previewing}
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  {labels.preview}
                </>
              )}
            </Button>
          </div>
        </section>
      )}

      {/* Step 3: Preview */}
      {state.step === "preview" && (
        <section className="rounded-[2rem] bg-surface p-6 shadow-sm ring-1 ring-border-subtle sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {labels.preview}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {labels.previewDescription}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleReset}>
              {labels.cancel}
            </Button>
          </div>

          {/* Summary */}
          <div className="mt-4 flex gap-4 rounded-2xl bg-surface-soft p-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-text-primary">
                {state.preview.summary.total}
              </p>
              <p className="text-xs text-text-muted">{labels.totalRows}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {state.preview.summary.valid}
              </p>
              <p className="text-xs text-text-muted">{labels.validRows}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {state.preview.summary.invalid}
              </p>
              <p className="text-xs text-text-muted">{labels.invalidRows}</p>
            </div>
          </div>

          {/* Rows table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <th className="pb-2 pr-2">{labels.row}</th>
                  <th className="pb-2 pr-2">{labels.status}</th>
                  <th className="pb-2 pr-2">{labels.ticker}</th>
                  <th className="pb-2 pr-2">{labels.type}</th>
                  <th className="pb-2 pr-2 text-right">{labels.quantity}</th>
                  <th className="pb-2 pr-2 text-right">{labels.price}</th>
                  <th className="pb-2 pr-2 text-right">{labels.commission}</th>
                  <th className="pb-2 pr-2">{labels.currency}</th>
                  <th className="pb-2">{labels.errors}</th>
                </tr>
              </thead>
              <tbody>
                {state.preview.rows.map((row) => (
                  <tr
                    key={row.row_number}
                    className={`border-b border-border-subtle ${
                      row.valid ? "" : "bg-red-50/50 dark:bg-red-950/20"
                    }`}
                  >
                    <td className="py-2 pr-2 font-mono text-xs">
                      {row.row_number}
                    </td>
                    <td className="py-2 pr-2">
                      {row.valid ? (
                        <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      )}
                    </td>
                    <td className="py-2 pr-2 font-medium">
                      {row.parsed?.ticker ?? "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {row.parsed?.trade_type ?? "—"}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono">
                      {row.parsed?.quantity ?? "—"}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono">
                      {row.parsed?.price_original != null
                        ? row.parsed.price_original.toFixed(2)
                        : "—"}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono">
                      {row.parsed?.commission_original != null
                        ? row.parsed.commission_original.toFixed(2)
                        : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {row.parsed?.currency_original ?? "—"}
                    </td>
                    <td className="py-2 max-w-[200px] truncate text-xs text-red-600 dark:text-red-400">
                      {row.error ?? labels.noErrors}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Commit button */}
          {state.preview.summary.valid > 0 && (
            <div className="mt-5 space-y-3">
              <CsvAssetChoices rows={state.preview.rows} onChange={setAssetReferences} />
              <Button
                onClick={handleCommit}
                disabled={loading}
                className="flex-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {labels.confirming}
                  </>
                ) : (
                  labels.confirmImport
                )}
              </Button>
            </div>
          )}
        </section>
      )}

      {/* Step 4: Done */}
      {state.step === "done" && (
        <section className="rounded-[2rem] bg-surface p-6 shadow-sm ring-1 ring-border-subtle sm:p-8">
          <div className="text-center">
            {state.result.status === "COMMITTED" ? (
              <>
                <CheckCircle className="mx-auto h-12 w-12 text-emerald-600 dark:text-emerald-400" />
                <h2 className="mt-4 text-lg font-semibold text-text-primary">
                  {labels.importSuccess}
                </h2>
                <p className="mt-2 text-sm text-text-secondary">
                  {labels.importSuccessDescription}
                </p>
                <p className="mt-1 text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {state.result.imported}
                </p>
                <p className="text-xs text-text-muted">
                  operaciones importadas
                </p>
              </>
            ) : (
              <>
                <XCircle className="mx-auto h-12 w-12 text-red-600 dark:text-red-400" />
                <h2 className="mt-4 text-lg font-semibold text-text-primary">
                  {labels.importFailed}
                </h2>
                <p className="mt-2 text-sm text-text-secondary">
                  {labels.importFailedDescription}
                </p>
              </>
            )}

            {state.result.errors.length > 0 && (
              <div className="mt-4 rounded-2xl bg-red-50 p-4 text-left text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <p className="font-medium">Errores:</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {state.result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6">
              <Button onClick={handleReset}>{labels.back}</Button>
            </div>
          </div>
        </section>
      )}

      {/* Import history (always visible at bottom) */}
      <ImportHistory />
    </div>
  );
}
