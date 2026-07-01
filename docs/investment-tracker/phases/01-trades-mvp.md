# Phase 1: Trades MVP Plan

## Goal

Implement manual trade capture, trade browsing, filtering, editing, deleting, and audit history.

## Scope

- Manual trade form.
- Trade list.
- Search and filters.
- Edit/delete trades.
- Position calculation primitives.
- Audit events for create/update/delete.

## Files And Areas

```txt
app/trades/page.tsx
app/trades/new/page.tsx
app/trades/[id]/edit/page.tsx
app/api/v1/trades/route.ts
app/api/v1/trades/[id]/route.ts
features/trades/
lib/calculations/
lib/validations/trades.ts
tests/unit/
tests/integration/
```

## Tasks

- [x] Define `CreateTradeInput`, `UpdateTradeInput`, and `TradeDTO` Zod schemas. (`src/lib/validations/trades.ts`.)
- [x] Build trade creation API with validation and normalized USD totals. (`src/app/api/v1/trades/route.ts`; `normalizeTradeUsdValues` in `src/lib/validations/trades.ts`.)
- [x] Build paginated trade list API with filters: ticker, broker, type, date range, currency, source. (`src/lib/trades/queries.ts` consumed by `src/app/trades/page.tsx`; `src/features/trades/trade-filters.tsx`.)
- [x] Build trade update API with partial updates. (`src/app/api/v1/trades/[id]/route.ts` PATCH handler.)
- [x] Build soft delete API with `deleted_at`. (DELETE handler in `src/app/api/v1/trades/[id]/route.ts`; `deleted_at` column in `src/lib/validations/trades.ts:102`.)
- [x] Insert `audit_events` on create, update, and delete. (Confirmed in `src/app/api/v1/trades/route.ts:158` and `src/app/api/v1/trades/[id]/route.ts:72,118`.)
- [x] Build manual trade form in Spanish. (`src/features/trades/trade-form.tsx`; new/edit clients in `src/features/trades/`.)
- [x] Build trade table/list optimized for mobile. (`src/features/trades/trade-list.tsx` + `trades-page-client.tsx`.)
- [x] Add empty, loading, validation, and error states. (Loading/error handled in client components; `src/lib/i18n/errors.ts` + `src/lib/i18n/trades.ts` provide Spanish copy.)
- [x] Add calculation utilities for total invested, average cost, realized P/L, unrealized P/L, and return percentage. (`src/lib/calculations/`: `holdings.ts`, `positions.ts`, `pnl.ts`, `equity.ts`, `pricing.ts`, `returns-aggregation.ts`; covered by `src/__tests__/calculations/calculations.test.ts` + per-module tests.)

## Validation Rules

- `trade_date` is required.
- `ticker` is required and normalized to uppercase.
- `trade_type` must be supported.
- `quantity` must be positive except fee-only rows.
- `price_original` must be non-negative.
- `commission_original` must be non-negative.
- COP trades require a valid `fx_rate_to_usd`.
- USD trades default `fx_rate_to_usd` to `1`.

## Tests

- Unit test: total invested includes commissions.
- Unit test: COP trade converts price and commission to USD.
- Unit test: sell trade reduces position quantity.
- Unit test: soft-deleted trades are excluded from dashboard calculations.
- Integration test: create trade returns `201`.
- Integration test: invalid trade returns `422`.
- Integration test: patch updates only provided fields.
- Integration test: delete sets `deleted_at`.

## Acceptance Criteria

- User can manually add a trade in Spanish.
- User can search and filter trades.
- User can edit and delete trades.
- All writes produce audit events.
- Financial calculation tests pass.

## Cost Controls

- No market-data calls in this phase.
- No file storage.
- No background jobs.

