"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { getTradeLabels } from "@/lib/i18n/trades";
import { BROKER_SEEDS } from "@/lib/reference/brokers";
import {
  TRADE_TYPES,
  SUPPORTED_CURRENCIES,
  type TradeListQuery,
} from "@/lib/validations/trades";

const labels = getTradeLabels();

interface TradeFiltersProps {
  filters: Partial<TradeListQuery>;
  onFilterChange: (filters: Partial<TradeListQuery>) => void;
  hideSmallTrades: boolean;
  onHideSmallTradesChange: (value: boolean) => void;
}

const selectClass =
  "h-10 w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary focus:border-border-default focus:outline-none focus:ring-2 focus:ring-focus-ring";

export function TradeFilters({
  filters,
  onFilterChange,
  hideSmallTrades,
  onHideSmallTradesChange,
}: TradeFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl bg-surface shadow-sm ring-1 ring-border-subtle">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-text-secondary"
      >
        <span>{labels.filters}</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border-subtle px-4 py-4">
          <div className="space-y-1.5">
            <label
              htmlFor="filter-type"
              className="block text-xs font-medium text-text-muted"
            >
              {labels.tradeType}
            </label>
            <select
              id="filter-type"
              value={filters.trade_type ?? ""}
              onChange={(e) =>
                onFilterChange({
                  trade_type: e.target.value
                    ? (e.target.value as TradeListQuery["trade_type"])
                    : undefined,
                })
              }
              className={selectClass}
            >
              <option value="">{labels.allTypes}</option>
              {TRADE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {labels[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="filter-broker"
              className="block text-xs font-medium text-text-muted"
            >
              {labels.broker}
            </label>
            <select
              id="filter-broker"
              value={filters.broker_code ?? ""}
              onChange={(e) =>
                onFilterChange({
                  broker_code: (e.target.value || undefined) as
                    | TradeListQuery["broker_code"]
                    | undefined,
                })
              }
              className={selectClass}
            >
              <option value="">{labels.allBrokers}</option>
              {BROKER_SEEDS.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="filter-currency"
              className="block text-xs font-medium text-text-muted"
            >
              {labels.currency}
            </label>
            <select
              id="filter-currency"
              value={filters.currency_original ?? ""}
              onChange={(e) =>
                onFilterChange({
                  currency_original: e.target.value
                    ? (e.target.value as TradeListQuery["currency_original"])
                    : undefined,
                })
              }
              className={selectClass}
            >
              <option value="">{labels.allCurrencies}</option>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="filter-date-from"
                className="block text-xs font-medium text-text-muted"
              >
                Desde
              </label>
              <input
                id="filter-date-from"
                type="date"
                value={filters.date_from ?? ""}
                onChange={(e) =>
                  onFilterChange({
                    date_from: e.target.value || undefined,
                  })
                }
                className={selectClass}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="filter-date-to"
                className="block text-xs font-medium text-text-muted"
              >
                Hasta
              </label>
              <input
                id="filter-date-to"
                type="date"
                value={filters.date_to ?? ""}
                onChange={(e) =>
                  onFilterChange({
                    date_to: e.target.value || undefined,
                  })
                }
                className={selectClass}
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={hideSmallTrades}
              onChange={(e) => onHideSmallTradesChange(e.target.checked)}
              className="h-4 w-4 rounded border-border-default bg-surface text-action-primary focus:ring-2 focus:ring-focus-ring"
            />
            <span className="text-sm text-text-secondary">
              Ocultar operaciones menores a USD 1
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
