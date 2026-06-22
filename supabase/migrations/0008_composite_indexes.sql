create index if not exists trades_portfolio_filters_idx 
  on public.trades (portfolio_id, deleted_at, trade_date desc, broker_id, trade_type);

create index if not exists trades_asset_date_idx 
  on public.trades (asset_id, trade_date desc) 
  where deleted_at is null;

create index if not exists csv_import_rows_validation_idx 
  on public.csv_import_rows (import_id, validation_status) 
  where validation_status = 'VALID';

create index if not exists market_prices_delayed_until_idx 
  on public.market_prices (asset_id, observed_at desc) 
  where delayed_until is null or delayed_until <= now();
