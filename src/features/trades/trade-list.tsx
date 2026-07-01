"use client";

import { memo } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { getTradeLabels } from "@/lib/i18n/trades";
import { cn } from "@/lib/utils";
import type { TradeDTO } from "@/lib/validations/trades";

const labels = getTradeLabels();

const typeBadgeClasses: Record<TradeDTO["trade_type"], string> = {
  BUY: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  SELL: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  DIVIDEND: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  FEE: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  TRANSFER_IN: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  TRANSFER_OUT: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
};

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

interface TradeRowProps {
  trade: TradeDTO;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  canWrite: boolean;
}

function TradeRowImpl({ trade, onEdit, onDelete, canWrite }: TradeRowProps) {
  const dateFormatted = dateFormatter.format(new Date(trade.trade_date));
  const totalUsd = trade.total_invested_usd;
  const totalClass =
    totalUsd >= 0
      ? "text-text-primary"
      : "text-red-600 dark:text-red-400";

  return (
    <article
      className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border-subtle"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn(
              "inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
              typeBadgeClasses[trade.trade_type],
            )}
          >
            {labels[trade.trade_type]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text-primary">
              {trade.ticker ?? "—"}
            </p>
            {trade.asset_name && trade.asset_name !== trade.ticker && (
              <p className="truncate text-xs text-text-muted">
                {trade.asset_name}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-xs text-text-muted">{dateFormatted}</span>
          {trade.broker_name && (
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
              {trade.broker_name}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <span className="text-text-muted">{labels.quantity}</span>
          <p className="font-medium text-text-primary">{trade.quantity}</p>
        </div>
        <div>
          <span className="text-text-muted">{labels.price}</span>
          <p className="font-medium text-text-primary">
            {currencyFormatter.format(trade.price_usd)}
          </p>
        </div>
        <div>
          <span className="text-text-muted">{labels.total}</span>
          <p className={cn("font-medium", totalClass)}>
            {currencyFormatter.format(Math.abs(totalUsd))}
          </p>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2 border-t border-border-subtle pt-3">
        {canWrite && (
          <>
            <button
              type="button"
              onClick={() => onEdit(trade.id)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
              {labels.edit}
            </button>
            <button
              type="button"
              onClick={() => onDelete(trade.id)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {labels.delete}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

const areTradeRowsEqual = (prev: TradeRowProps, next: TradeRowProps) =>
  prev.trade === next.trade &&
  prev.onEdit === next.onEdit &&
  prev.onDelete === next.onDelete &&
  prev.canWrite === next.canWrite;

export const TradeRow = memo(TradeRowImpl, areTradeRowsEqual);

interface TradeListProps {
  trades: TradeDTO[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  canWrite: boolean;
}

export function TradeList({ trades, onEdit, onDelete, canWrite }: TradeListProps) {
  if (trades.length === 0) {
    return (
      <div className="rounded-3xl bg-surface p-8 text-center shadow-sm ring-1 ring-border-subtle">
        <p className="text-lg font-semibold text-text-primary">
          {labels.noTrades}
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          {labels.noTradesDescription}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {trades.map((trade) => (
        <TradeRow
          key={trade.id}
          trade={trade}
          onEdit={onEdit}
          onDelete={onDelete}
          canWrite={canWrite}
        />
      ))}
    </div>
  );
}
