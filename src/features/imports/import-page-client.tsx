"use client";

import { useState, useCallback } from "react";
import { Loader2, Upload, FileText, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getImportLabels } from "@/lib/i18n/imports";
import { BROKER_SEEDS, type BrokerCode } from "@/lib/reference/brokers";
import { errors } from "@/lib/i18n/errors";
import { ImportHistory } from "./import-history";

type RowPreview = {
  row_number: number;
  valid: boolean;
  error: string | null;
  parsed: {
    trade_date: string;
    trade_type: string;
    ticker: string;
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

// UUID v4 válido: versión 4, variante 8

const labels = getImportLabels();

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

export function ImportPageClient({
  portfolioId: _portfolioId,
  readOnly,
}: {
  portfolioId: string;
  readOnly: boolean;
}) {
  if (readOnly) {
    return <ReadOnlyImportView />;
  }
  return <ImportWizard />;
}

function ReadOnlyImportView() {
  return (
    <div className="space-y-6">
      <section
        role="status"
        className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8"
      >
        <h2 className="text-lg font-semibold text-slate-950">
          {labels.readOnlyTitle}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {labels.readOnlyDescription}
        </p>
      </section>
      <ImportHistory />
    </div>
  );
}

function ImportWizard() {
  const [state, setState] = useState<ImportState>({ step: "select" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        throw new Error(details || err.error || "Error al analizar el archivo");
      }

      const preview: PreviewResult = await res.json();
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
  }, [state]);

  const handleCommit = useCallback(async () => {
    if (state.step !== "preview") return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/imports/csv/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          import_id: state.preview.import.id,
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
          details || err.error || "Error al confirmar la importación",
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
  }, [state]);

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
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span
          className={state.step === "select" ? "font-semibold text-slate-950" : ""}
        >
          1. Bróker
        </span>
        <span className="text-slate-300">→</span>
        <span
          className={state.step === "upload" ? "font-semibold text-slate-950" : ""}
        >
          2. Archivo
        </span>
        <span className="text-slate-300">→</span>
        <span
          className={
            state.step === "preview" || state.step === "done"
              ? "font-semibold text-slate-950"
              : ""
          }
        >
          3. Revisar
        </span>
        <span className="text-slate-300">→</span>
        <span
          className={state.step === "done" ? "font-semibold text-slate-950" : ""}
        >
          4. Confirmar
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Step 1: Select broker */}
      {state.step === "select" && (
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <h2 className="text-lg font-semibold text-slate-950">
            {labels.selectBroker}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Selecciona el bróker del cual quieres importar operaciones.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {BROKER_SEEDS.map((b) => (
              <button
                key={b.code}
                onClick={() => handleBrokerSelect(b.code)}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-400 hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">
                  {b.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-slate-950">{b.name}</p>
                  <p className="text-xs text-slate-500">
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
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-950">
                {labels.uploadFile} — {broker.name}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {labels.brokerInstructions[broker.code]}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {labels.fileFormat}: {ACCEPTED_EXTENSIONS[broker.code]}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleReset}>
              {labels.back}
            </Button>
          </div>

          <div className="mt-5">
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 transition-colors hover:border-slate-400 hover:bg-slate-100">
              <Upload className="h-8 w-8 text-slate-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">
                  {state.file ? state.file.name : labels.dragDrop}
                </p>
                {state.file && (
                  <p className="mt-1 text-xs text-slate-500">
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
                className="block text-sm font-medium text-slate-700"
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
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <p className="text-xs text-slate-500">{labels.fxRateHelp}</p>
            </div>
          )}

          {isEtrading && (
            <div className="mt-5 space-y-1.5">
              <label
                htmlFor="purchase_date"
                className="block text-sm font-medium text-slate-700"
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
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <p className="text-xs text-slate-500">{labels.purchaseDateHelp}</p>
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
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                {labels.preview}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {labels.previewDescription}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleReset}>
              {labels.cancel}
            </Button>
          </div>

          {/* Summary */}
          <div className="mt-4 flex gap-4 rounded-2xl bg-slate-50 p-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-950">
                {state.preview.summary.total}
              </p>
              <p className="text-xs text-slate-500">{labels.totalRows}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600">
                {state.preview.summary.valid}
              </p>
              <p className="text-xs text-slate-500">{labels.validRows}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">
                {state.preview.summary.invalid}
              </p>
              <p className="text-xs text-slate-500">{labels.invalidRows}</p>
            </div>
          </div>

          {/* Rows table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
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
                    className={`border-b border-slate-100 ${
                      row.valid ? "" : "bg-red-50/50"
                    }`}
                  >
                    <td className="py-2 pr-2 font-mono text-xs">
                      {row.row_number}
                    </td>
                    <td className="py-2 pr-2">
                      {row.valid ? (
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
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
                    <td className="py-2 max-w-[200px] truncate text-xs text-red-600">
                      {row.error ?? labels.noErrors}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Commit button */}
          {state.preview.summary.valid > 0 && (
            <div className="mt-5 flex gap-3">
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
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <div className="text-center">
            {state.result.status === "COMMITTED" ? (
              <>
                <CheckCircle className="mx-auto h-12 w-12 text-emerald-600" />
                <h2 className="mt-4 text-lg font-semibold text-slate-950">
                  {labels.importSuccess}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {labels.importSuccessDescription}
                </p>
                <p className="mt-1 text-3xl font-bold text-emerald-600">
                  {state.result.imported}
                </p>
                <p className="text-xs text-slate-500">
                  operaciones importadas
                </p>
              </>
            ) : (
              <>
                <XCircle className="mx-auto h-12 w-12 text-red-600" />
                <h2 className="mt-4 text-lg font-semibold text-slate-950">
                  {labels.importFailed}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {labels.importFailedDescription}
                </p>
              </>
            )}

            {state.result.errors.length > 0 && (
              <div className="mt-4 rounded-2xl bg-red-50 p-4 text-left text-sm text-red-700">
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
