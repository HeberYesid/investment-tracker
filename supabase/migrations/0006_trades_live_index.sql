-- 0006_trades_live_index.sql
-- Adds a partial index on public.trades that excludes soft-deleted rows.
-- Every read path in the app queries with `.is("deleted_at", null)`, so the
-- full index on (portfolio_id, trade_date desc) carries dead rows that the
-- planner has to walk past on every scan. The partial index keeps the
-- working set tight and matches the predicate one-to-one, giving a
-- noticeable scan reduction on portfolios with a long history of churn.
--
-- This is a strict refinement of trades_portfolio_id_trade_date_idx from
-- 0001_foundation.sql — it is not a replacement, and Postgres can pick
-- either index depending on the query shape.

create index trades_portfolio_id_trade_date_live_idx
  on public.trades (portfolio_id, trade_date desc)
  where deleted_at is null;
