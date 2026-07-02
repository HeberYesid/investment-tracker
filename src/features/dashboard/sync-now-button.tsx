"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { getDashboardLabels } from "@/lib/i18n/dashboard";
import { formatRelativeTime } from "@/lib/dashboard/format-last-updated";
import { useTheme } from "@/lib/theme/theme-provider";

const labels = getDashboardLabels();
const IS_PRODUCTION = process.env.NODE_ENV === "production";

type SyncStatus = "idle" | "loading" | "success" | "error";

interface SyncNowButtonProps {
  lastSyncedAt?: string | null;
}

export function SyncNowButton({ lastSyncedAt }: SyncNowButtonProps) {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  if (IS_PRODUCTION) return null;

  async function handleClick() {
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/v1/admin/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "PRICES" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const errorMessage =
          typeof body?.error === "string"
            ? body.error
            : body?.error?.message ?? labels.syncError;
        throw new Error(errorMessage);
      }
      setStatus("success");
      setMessage(labels.syncQueued);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : labels.syncError);
    }
  }

  const tone =
    status === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "error"
        ? "text-red-600 dark:text-red-400"
        : "text-text-muted";

  return (
    <div className="flex flex-col items-end gap-1">
      {lastSyncedAt && (
        <span className="text-xs text-text-muted">
          {labels.lastSync.replace(
            "{date}",
            formatRelativeTime(lastSyncedAt, {
              relativeTimeFallback: labels.relativeTimeFallback,
            }),
          )}
        </span>
      )}
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={status === "loading"}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition-colors disabled:cursor-not-allowed ${
          isDark
            ? "bg-surface-soft text-text-primary hover:bg-surface-muted disabled:bg-surface-muted"
            : "bg-action-primary text-action-primary-fg hover:opacity-90 disabled:bg-action-primary/60"
        }`}
        data-testid="sync-now-button"
      >
        {status === "loading" && (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        )}
        {status === "loading" ? labels.syncRunning : labels.syncNow}
      </button>
      {message && (
        <p className={`text-xs ${tone}`} role="status">
          {message}
        </p>
      )}
    </div>
  );
}
