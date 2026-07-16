-- seed_demo.sql — Demo data for unauthenticated visitors
-- Idempotent: safe to run multiple times.
-- Run via Supabase SQL Editor or: supabase db push

begin;

-- 1. Demo auth user (so portfolio FK is satisfied)
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'demo@investment-tracker.com',
  '',
  now(),
  '{"provider":"email"}',
  '{}',
  now(),
  now()
) on conflict (id) do nothing;

-- handle_new_user trigger creates profile + auto-portfolio + membership.
-- We create our own demo portfolio with a deterministic ID.
insert into public.portfolios (id, user_id, name, base_currency) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Portafolio Demo',
  'USD'
) on conflict (id) do nothing;

-- 2. Demo assets (idempotent via on conflict)
insert into public.assets (id, ticker, yahoo_symbol, name, asset_type, sector, country, currency, exchange) values
  ('a0000000-0000-0000-0000-000000000001', 'AAPL',  'AAPL',          'Apple Inc.',        'STOCK', 'Technology',             'US', 'USD', 'NASDAQ'),
  ('a0000000-0000-0000-0000-000000000002', 'MSFT',  'MSFT',          'Microsoft Corp.',    'STOCK', 'Technology',             'US', 'USD', 'NASDAQ'),
  ('a0000000-0000-0000-0000-000000000003', 'AMZN',  'AMZN',          'Amazon.com Inc.',    'STOCK', 'Consumer Cyclical',      'US', 'USD', 'NASDAQ'),
  ('a0000000-0000-0000-0000-000000000004', 'GOOGL', 'GOOGL',         'Alphabet Inc.',      'STOCK', 'Communication Services', 'US', 'USD', 'NASDAQ'),
  ('a0000000-0000-0000-0000-000000000005', 'TSLA',  'TSLA',          'Tesla Inc.',         'STOCK', 'Consumer Cyclical',      'US', 'USD', 'NASDAQ'),
  ('a0000000-0000-0000-0000-000000000006', 'ECO',   'ECOPETROL.CL',  'Ecopetrol S.A.',     'STOCK', 'Energy',                  'CO', 'COP', 'BVC')
on conflict (ticker, exchange) do update
set yahoo_symbol = excluded.yahoo_symbol,
    name         = excluded.name,
    sector       = excluded.sector,
    country      = excluded.country;

-- 3. Demo trades (17 trades across 6 assets, ~18 months)
-- fx_rate_to_usd for COP trades: Jan 2024 ~0.000253, Mar 2025 ~0.000244

-- AAPL trades (ETORO)
insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2024-01-15', 'BUY', 10, 185.50, 'USD', 0, 1, 185.50, 0, 1855.00, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'ETORO' and a.ticker = 'AAPL'
on conflict (id) do nothing;

insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2024-07-20', 'SELL', 3, 220.00, 'USD', 0, 1, 220.00, 0, 660.00, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'ETORO' and a.ticker = 'AAPL'
on conflict (id) do nothing;

insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2024-08-15', 'DIVIDEND', 1, 1.68, 'USD', 0, 1, 1.68, 0, 1.68, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'ETORO' and a.ticker = 'AAPL'
on conflict (id) do nothing;

insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2025-01-10', 'BUY', 5, 190.30, 'USD', 0, 1, 190.30, 0, 951.50, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'XTB' and a.ticker = 'AAPL'
on conflict (id) do nothing;

-- MSFT trades (ETORO)
insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2024-02-10', 'BUY', 5, 405.00, 'USD', 0, 1, 405.00, 0, 2025.00, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'ETORO' and a.ticker = 'MSFT'
on conflict (id) do nothing;

insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2024-09-10', 'BUY', 3, 415.50, 'USD', 0, 1, 415.50, 0, 1246.50, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'ETORO' and a.ticker = 'MSFT'
on conflict (id) do nothing;

insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2025-04-05', 'BUY', 2, 425.00, 'USD', 0, 1, 425.00, 0, 850.00, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'ETORO' and a.ticker = 'MSFT'
on conflict (id) do nothing;

-- AMZN trades (ETORO + XTB)
insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2024-03-05', 'BUY', 8, 175.30, 'USD', 0, 1, 175.30, 0, 1402.40, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'ETORO' and a.ticker = 'AMZN'
on conflict (id) do nothing;

insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2024-10-01', 'BUY', 4, 185.20, 'USD', 0, 1, 185.20, 0, 740.80, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'XTB' and a.ticker = 'AMZN'
on conflict (id) do nothing;

insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2025-02-15', 'SELL', 2, 195.50, 'USD', 0, 1, 195.50, 0, 391.00, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'ETORO' and a.ticker = 'AMZN'
on conflict (id) do nothing;

-- GOOGL trades (XTB)
insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2024-04-20', 'BUY', 3, 155.75, 'USD', 0, 1, 155.75, 0, 467.25, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'XTB' and a.ticker = 'GOOGL'
on conflict (id) do nothing;

insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2024-12-20', 'BUY', 2, 170.50, 'USD', 0, 1, 170.50, 0, 341.00, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'ETORO' and a.ticker = 'GOOGL'
on conflict (id) do nothing;

-- TSLA trades (XTB)
insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2024-05-10', 'BUY', 15, 175.00, 'USD', 0, 1, 175.00, 0, 2625.00, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'XTB' and a.ticker = 'TSLA'
on conflict (id) do nothing;

insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000014', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2024-11-15', 'SELL', 5, 240.00, 'USD', 0, 1, 240.00, 0, 1200.00, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'XTB' and a.ticker = 'TSLA'
on conflict (id) do nothing;

insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000015', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2025-05-15', 'BUY', 10, 165.00, 'USD', 0, 1, 165.00, 0, 1650.00, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'XTB' and a.ticker = 'TSLA'
on conflict (id) do nothing;

-- ECO trades (TRII, COP)
insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000016', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2024-06-15', 'BUY', 500, 2200.00, 'COP', 0, 0.000253164557, 0.556962, 0, 278.48, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'TRII' and a.ticker = 'ECO'
on conflict (id) do nothing;

insert into public.trades (id, portfolio_id, broker_id, asset_id, trade_date, trade_type, quantity, price_original, currency_original, commission_original, fx_rate_to_usd, price_usd, commission_usd, total_invested_usd, source)
select '40000000-0000-0000-0000-000000000017', '20000000-0000-0000-0000-000000000001', b.id, a.id,
       '2025-03-20', 'BUY', 200, 1850.00, 'COP', 0, 0.000243902439, 0.451220, 0, 90.24, 'MANUAL'
from public.brokers b, public.assets a where b.code = 'TRII' and a.ticker = 'ECO'
on conflict (id) do nothing;

-- 4. Current market prices (observed today, no delay)
insert into public.market_prices (id, asset_id, price, currency, price_usd, source, observed_at, delayed_until) values
  ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 195.00,  'USD', 195.00,   'DEMO', now(), null),
  ('50000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 430.00,  'USD', 430.00,   'DEMO', now(), null),
  ('50000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 190.00,  'USD', 190.00,   'DEMO', now(), null),
  ('50000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 175.00,  'USD', 175.00,   'DEMO', now(), null),
  ('50000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', 200.00,  'USD', 200.00,   'DEMO', now(), null),
  ('50000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000006', 1850.00, 'COP', 0.451220, 'DEMO', now(), null)
on conflict (id) do nothing;

-- 5. Historical prices (monthly EOM, source PRICE_HISTORY for evolution chart)
-- AAPL
insert into public.market_prices (id, asset_id, price, currency, price_usd, source, observed_at, delayed_until) values
  ('60000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000001', 184.40,  'USD', 184.40,  'PRICE_HISTORY', '2024-01-31', null),
  ('60000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000001', 180.75,  'USD', 180.75,  'PRICE_HISTORY', '2024-02-29', null),
  ('60000000-0000-0000-0000-000000000103', 'a0000000-0000-0000-0000-000000000001', 171.48,  'USD', 171.48,  'PRICE_HISTORY', '2024-03-31', null),
  ('60000000-0000-0000-0000-000000000104', 'a0000000-0000-0000-0000-000000000001', 169.30,  'USD', 169.30,  'PRICE_HISTORY', '2024-04-30', null),
  ('60000000-0000-0000-0000-000000000105', 'a0000000-0000-0000-0000-000000000001', 173.65,  'USD', 173.65,  'PRICE_HISTORY', '2024-05-31', null),
  ('60000000-0000-0000-0000-000000000106', 'a0000000-0000-0000-0000-000000000001', 186.23,  'USD', 186.23,  'PRICE_HISTORY', '2024-06-30', null),
  ('60000000-0000-0000-0000-000000000107', 'a0000000-0000-0000-0000-000000000001', 215.50,  'USD', 215.50,  'PRICE_HISTORY', '2024-07-31', null),
  ('60000000-0000-0000-0000-000000000108', 'a0000000-0000-0000-0000-000000000001', 210.30,  'USD', 210.30,  'PRICE_HISTORY', '2024-08-31', null),
  ('60000000-0000-0000-0000-000000000109', 'a0000000-0000-0000-0000-000000000001', 223.75,  'USD', 223.75,  'PRICE_HISTORY', '2024-09-30', null),
  ('60000000-0000-0000-0000-000000000110', 'a0000000-0000-0000-0000-000000000001', 208.50,  'USD', 208.50,  'PRICE_HISTORY', '2024-10-31', null),
  ('60000000-0000-0000-0000-000000000111', 'a0000000-0000-0000-0000-000000000001', 225.15,  'USD', 225.15,  'PRICE_HISTORY', '2024-11-30', null),
  ('60000000-0000-0000-0000-000000000112', 'a0000000-0000-0000-0000-000000000001', 235.00,  'USD', 235.00,  'PRICE_HISTORY', '2024-12-31', null),
  ('60000000-0000-0000-0000-000000000113', 'a0000000-0000-0000-0000-000000000001', 188.90,  'USD', 188.90,  'PRICE_HISTORY', '2025-01-31', null),
  ('60000000-0000-0000-0000-000000000114', 'a0000000-0000-0000-0000-000000000001', 178.50,  'USD', 178.50,  'PRICE_HISTORY', '2025-02-28', null),
  ('60000000-0000-0000-0000-000000000115', 'a0000000-0000-0000-0000-000000000001', 195.20,  'USD', 195.20,  'PRICE_HISTORY', '2025-03-31', null),
  ('60000000-0000-0000-0000-000000000116', 'a0000000-0000-0000-0000-000000000001', 206.80,  'USD', 206.80,  'PRICE_HISTORY', '2025-04-30', null),
  ('60000000-0000-0000-0000-000000000117', 'a0000000-0000-0000-0000-000000000001', 212.50,  'USD', 212.50,  'PRICE_HISTORY', '2025-05-31', null),
  ('60000000-0000-0000-0000-000000000118', 'a0000000-0000-0000-0000-000000000001', 195.00,  'USD', 195.00,  'PRICE_HISTORY', '2025-06-30', null)
on conflict (id) do nothing;

-- MSFT
insert into public.market_prices (id, asset_id, price, currency, price_usd, source, observed_at, delayed_until) values
  ('60000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000002', 397.58,  'USD', 397.58,  'PRICE_HISTORY', '2024-01-31', null),
  ('60000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000002', 410.00,  'USD', 410.00,  'PRICE_HISTORY', '2024-02-29', null),
  ('60000000-0000-0000-0000-000000000203', 'a0000000-0000-0000-0000-000000000002', 420.30,  'USD', 420.30,  'PRICE_HISTORY', '2024-03-31', null),
  ('60000000-0000-0000-0000-000000000204', 'a0000000-0000-0000-0000-000000000002', 405.75,  'USD', 405.75,  'PRICE_HISTORY', '2024-04-30', null),
  ('60000000-0000-0000-0000-000000000205', 'a0000000-0000-0000-0000-000000000002', 415.50,  'USD', 415.50,  'PRICE_HISTORY', '2024-05-31', null),
  ('60000000-0000-0000-0000-000000000206', 'a0000000-0000-0000-0000-000000000002', 430.80,  'USD', 430.80,  'PRICE_HISTORY', '2024-06-30', null),
  ('60000000-0000-0000-0000-000000000207', 'a0000000-0000-0000-0000-000000000002', 422.90,  'USD', 422.90,  'PRICE_HISTORY', '2024-07-31', null),
  ('60000000-0000-0000-0000-000000000208', 'a0000000-0000-0000-0000-000000000002', 410.20,  'USD', 410.20,  'PRICE_HISTORY', '2024-08-31', null),
  ('60000000-0000-0000-0000-000000000209', 'a0000000-0000-0000-0000-000000000002', 417.80,  'USD', 417.80,  'PRICE_HISTORY', '2024-09-30', null),
  ('60000000-0000-0000-0000-000000000210', 'a0000000-0000-0000-0000-000000000002', 435.00,  'USD', 435.00,  'PRICE_HISTORY', '2024-10-31', null),
  ('60000000-0000-0000-0000-000000000211', 'a0000000-0000-0000-0000-000000000002', 425.50,  'USD', 425.50,  'PRICE_HISTORY', '2024-11-30', null),
  ('60000000-0000-0000-0000-000000000212', 'a0000000-0000-0000-0000-000000000002', 440.00,  'USD', 440.00,  'PRICE_HISTORY', '2024-12-31', null),
  ('60000000-0000-0000-0000-000000000213', 'a0000000-0000-0000-0000-000000000002', 408.50,  'USD', 408.50,  'PRICE_HISTORY', '2025-01-31', null),
  ('60000000-0000-0000-0000-000000000214', 'a0000000-0000-0000-0000-000000000002', 399.80,  'USD', 399.80,  'PRICE_HISTORY', '2025-02-28', null),
  ('60000000-0000-0000-0000-000000000215', 'a0000000-0000-0000-0000-000000000002', 418.50,  'USD', 418.50,  'PRICE_HISTORY', '2025-03-31', null),
  ('60000000-0000-0000-0000-000000000216', 'a0000000-0000-0000-0000-000000000002', 426.30,  'USD', 426.30,  'PRICE_HISTORY', '2025-04-30', null),
  ('60000000-0000-0000-0000-000000000217', 'a0000000-0000-0000-0000-000000000002', 432.10,  'USD', 432.10,  'PRICE_HISTORY', '2025-05-31', null),
  ('60000000-0000-0000-0000-000000000218', 'a0000000-0000-0000-0000-000000000002', 430.00,  'USD', 430.00,  'PRICE_HISTORY', '2025-06-30', null)
on conflict (id) do nothing;

-- AMZN
insert into public.market_prices (id, asset_id, price, currency, price_usd, source, observed_at, delayed_until) values
  ('60000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000003', 155.30,  'USD', 155.30,  'PRICE_HISTORY', '2024-01-31', null),
  ('60000000-0000-0000-0000-000000000302', 'a0000000-0000-0000-0000-000000000003', 158.75,  'USD', 158.75,  'PRICE_HISTORY', '2024-02-29', null),
  ('60000000-0000-0000-0000-000000000303', 'a0000000-0000-0000-0000-000000000003', 172.00,  'USD', 172.00,  'PRICE_HISTORY', '2024-03-31', null),
  ('60000000-0000-0000-0000-000000000304', 'a0000000-0000-0000-0000-000000000003', 180.50,  'USD', 180.50,  'PRICE_HISTORY', '2024-04-30', null),
  ('60000000-0000-0000-0000-000000000305', 'a0000000-0000-0000-0000-000000000003', 188.30,  'USD', 188.30,  'PRICE_HISTORY', '2024-05-31', null),
  ('60000000-0000-0000-0000-000000000306', 'a0000000-0000-0000-0000-000000000003', 190.10,  'USD', 190.10,  'PRICE_HISTORY', '2024-06-30', null),
  ('60000000-0000-0000-0000-000000000307', 'a0000000-0000-0000-0000-000000000003', 178.50,  'USD', 178.50,  'PRICE_HISTORY', '2024-07-31', null),
  ('60000000-0000-0000-0000-000000000308', 'a0000000-0000-0000-0000-000000000003', 175.20,  'USD', 175.20,  'PRICE_HISTORY', '2024-08-31', null),
  ('60000000-0000-0000-0000-000000000309', 'a0000000-0000-0000-0000-000000000003', 182.80,  'USD', 182.80,  'PRICE_HISTORY', '2024-09-30', null),
  ('60000000-0000-0000-0000-000000000310', 'a0000000-0000-0000-0000-000000000003', 186.00,  'USD', 186.00,  'PRICE_HISTORY', '2024-10-31', null),
  ('60000000-0000-0000-0000-000000000311', 'a0000000-0000-0000-0000-000000000003', 192.50,  'USD', 192.50,  'PRICE_HISTORY', '2024-11-30', null),
  ('60000000-0000-0000-0000-000000000312', 'a0000000-0000-0000-0000-000000000003', 198.20,  'USD', 198.20,  'PRICE_HISTORY', '2024-12-31', null),
  ('60000000-0000-0000-0000-000000000313', 'a0000000-0000-0000-0000-000000000003', 186.50,  'USD', 186.50,  'PRICE_HISTORY', '2025-01-31', null),
  ('60000000-0000-0000-0000-000000000314', 'a0000000-0000-0000-0000-000000000003', 192.80,  'USD', 192.80,  'PRICE_HISTORY', '2025-02-28', null),
  ('60000000-0000-0000-0000-000000000315', 'a0000000-0000-0000-0000-000000000003', 190.30,  'USD', 190.30,  'PRICE_HISTORY', '2025-03-31', null),
  ('60000000-0000-0000-0000-000000000316', 'a0000000-0000-0000-0000-000000000003', 188.90,  'USD', 188.90,  'PRICE_HISTORY', '2025-04-30', null),
  ('60000000-0000-0000-0000-000000000317', 'a0000000-0000-0000-0000-000000000003', 191.50,  'USD', 191.50,  'PRICE_HISTORY', '2025-05-31', null),
  ('60000000-0000-0000-0000-000000000318', 'a0000000-0000-0000-0000-000000000003', 190.00,  'USD', 190.00,  'PRICE_HISTORY', '2025-06-30', null)
on conflict (id) do nothing;

-- GOOGL
insert into public.market_prices (id, asset_id, price, currency, price_usd, source, observed_at, delayed_until) values
  ('60000000-0000-0000-0000-000000000401', 'a0000000-0000-0000-0000-000000000004', 143.50,  'USD', 143.50,  'PRICE_HISTORY', '2024-01-31', null),
  ('60000000-0000-0000-0000-000000000402', 'a0000000-0000-0000-0000-000000000004', 138.75,  'USD', 138.75,  'PRICE_HISTORY', '2024-02-29', null),
  ('60000000-0000-0000-0000-000000000403', 'a0000000-0000-0000-0000-000000000004', 148.60,  'USD', 148.60,  'PRICE_HISTORY', '2024-03-31', null),
  ('60000000-0000-0000-0000-000000000404', 'a0000000-0000-0000-0000-000000000004', 157.30,  'USD', 157.30,  'PRICE_HISTORY', '2024-04-30', null),
  ('60000000-0000-0000-0000-000000000405', 'a0000000-0000-0000-0000-000000000004', 160.10,  'USD', 160.10,  'PRICE_HISTORY', '2024-05-31', null),
  ('60000000-0000-0000-0000-000000000406', 'a0000000-0000-0000-0000-000000000004', 174.80,  'USD', 174.80,  'PRICE_HISTORY', '2024-06-30', null),
  ('60000000-0000-0000-0000-000000000407', 'a0000000-0000-0000-0000-000000000004', 168.50,  'USD', 168.50,  'PRICE_HISTORY', '2024-07-31', null),
  ('60000000-0000-0000-0000-000000000408', 'a0000000-0000-0000-0000-000000000004', 162.30,  'USD', 162.30,  'PRICE_HISTORY', '2024-08-31', null),
  ('60000000-0000-0000-0000-000000000409', 'a0000000-0000-0000-0000-000000000004', 165.75,  'USD', 165.75,  'PRICE_HISTORY', '2024-09-30', null),
  ('60000000-0000-0000-0000-000000000410', 'a0000000-0000-0000-0000-000000000004', 172.40,  'USD', 172.40,  'PRICE_HISTORY', '2024-10-31', null),
  ('60000000-0000-0000-0000-000000000411', 'a0000000-0000-0000-0000-000000000004', 170.80,  'USD', 170.80,  'PRICE_HISTORY', '2024-11-30', null),
  ('60000000-0000-0000-0000-000000000412', 'a0000000-0000-0000-0000-000000000004', 175.00,  'USD', 175.00,  'PRICE_HISTORY', '2024-12-31', null),
  ('60000000-0000-0000-0000-000000000413', 'a0000000-0000-0000-0000-000000000004', 168.80,  'USD', 168.80,  'PRICE_HISTORY', '2025-01-31', null),
  ('60000000-0000-0000-0000-000000000414', 'a0000000-0000-0000-0000-000000000004', 160.20,  'USD', 160.20,  'PRICE_HISTORY', '2025-02-28', null),
  ('60000000-0000-0000-0000-000000000415', 'a0000000-0000-0000-0000-000000000004', 170.50,  'USD', 170.50,  'PRICE_HISTORY', '2025-03-31', null),
  ('60000000-0000-0000-0000-000000000416', 'a0000000-0000-0000-0000-000000000004', 172.30,  'USD', 172.30,  'PRICE_HISTORY', '2025-04-30', null),
  ('60000000-0000-0000-0000-000000000417', 'a0000000-0000-0000-0000-000000000004', 178.10,  'USD', 178.10,  'PRICE_HISTORY', '2025-05-31', null),
  ('60000000-0000-0000-0000-000000000418', 'a0000000-0000-0000-0000-000000000004', 175.00,  'USD', 175.00,  'PRICE_HISTORY', '2025-06-30', null)
on conflict (id) do nothing;

-- TSLA
insert into public.market_prices (id, asset_id, price, currency, price_usd, source, observed_at, delayed_until) values
  ('60000000-0000-0000-0000-000000000501', 'a0000000-0000-0000-0000-000000000005', 187.50,  'USD', 187.50,  'PRICE_HISTORY', '2024-01-31', null),
  ('60000000-0000-0000-0000-000000000502', 'a0000000-0000-0000-0000-000000000005', 195.30,  'USD', 195.30,  'PRICE_HISTORY', '2024-02-29', null),
  ('60000000-0000-0000-0000-000000000503', 'a0000000-0000-0000-0000-000000000005', 170.80,  'USD', 170.80,  'PRICE_HISTORY', '2024-03-31', null),
  ('60000000-0000-0000-0000-000000000504', 'a0000000-0000-0000-0000-000000000005', 178.00,  'USD', 178.00,  'PRICE_HISTORY', '2024-04-30', null),
  ('60000000-0000-0000-0000-000000000505', 'a0000000-0000-0000-0000-000000000005', 185.50,  'USD', 185.50,  'PRICE_HISTORY', '2024-05-31', null),
  ('60000000-0000-0000-0000-000000000506', 'a0000000-0000-0000-0000-000000000005', 210.20,  'USD', 210.20,  'PRICE_HISTORY', '2024-06-30', null),
  ('60000000-0000-0000-0000-000000000507', 'a0000000-0000-0000-0000-000000000005', 235.80,  'USD', 235.80,  'PRICE_HISTORY', '2024-07-31', null),
  ('60000000-0000-0000-0000-000000000508', 'a0000000-0000-0000-0000-000000000005', 228.50,  'USD', 228.50,  'PRICE_HISTORY', '2024-08-31', null),
  ('60000000-0000-0000-0000-000000000509', 'a0000000-0000-0000-0000-000000000005', 245.00,  'USD', 245.00,  'PRICE_HISTORY', '2024-09-30', null),
  ('60000000-0000-0000-0000-000000000510', 'a0000000-0000-0000-0000-000000000005', 238.30,  'USD', 238.30,  'PRICE_HISTORY', '2024-10-31', null),
  ('60000000-0000-0000-0000-000000000511', 'a0000000-0000-0000-0000-000000000005', 255.20,  'USD', 255.20,  'PRICE_HISTORY', '2024-11-30', null),
  ('60000000-0000-0000-0000-000000000512', 'a0000000-0000-0000-0000-000000000005', 260.00,  'USD', 260.00,  'PRICE_HISTORY', '2024-12-31', null),
  ('60000000-0000-0000-0000-000000000513', 'a0000000-0000-0000-0000-000000000005', 190.50,  'USD', 190.50,  'PRICE_HISTORY', '2025-01-31', null),
  ('60000000-0000-0000-0000-000000000514', 'a0000000-0000-0000-0000-000000000005', 180.30,  'USD', 180.30,  'PRICE_HISTORY', '2025-02-28', null),
  ('60000000-0000-0000-0000-000000000515', 'a0000000-0000-0000-0000-000000000005', 175.80,  'USD', 175.80,  'PRICE_HISTORY', '2025-03-31', null),
  ('60000000-0000-0000-0000-000000000516', 'a0000000-0000-0000-0000-000000000005', 168.50,  'USD', 168.50,  'PRICE_HISTORY', '2025-04-30', null),
  ('60000000-0000-0000-0000-000000000517', 'a0000000-0000-0000-0000-000000000005', 185.80,  'USD', 185.80,  'PRICE_HISTORY', '2025-05-31', null),
  ('60000000-0000-0000-0000-000000000518', 'a0000000-0000-0000-0000-000000000005', 200.00,  'USD', 200.00,  'PRICE_HISTORY', '2025-06-30', null)
on conflict (id) do nothing;

-- ECO (COP, prices in COP, price_usd = COP/4100 approx)
insert into public.market_prices (id, asset_id, price, currency, price_usd, source, observed_at, delayed_until) values
  ('60000000-0000-0000-0000-000000000601', 'a0000000-0000-0000-0000-000000000006', 2280.00, 'COP', 0.524865,  'PRICE_HISTORY', '2024-01-31', null),
  ('60000000-0000-0000-0000-000000000602', 'a0000000-0000-0000-0000-000000000006', 2350.00, 'COP', 0.541176,  'PRICE_HISTORY', '2024-02-29', null),
  ('60000000-0000-0000-0000-000000000603', 'a0000000-0000-0000-0000-000000000006', 2400.00, 'COP', 0.551724,  'PRICE_HISTORY', '2024-03-31', null),
  ('60000000-0000-0000-0000-000000000604', 'a0000000-0000-0000-0000-000000000006', 2480.00, 'COP', 0.570115,  'PRICE_HISTORY', '2024-04-30', null),
  ('60000000-0000-0000-0000-000000000605', 'a0000000-0000-0000-0000-000000000006', 2550.00, 'COP', 0.583524,  'PRICE_HISTORY', '2024-05-31', null),
  ('60000000-0000-0000-0000-000000000606', 'a0000000-0000-0000-0000-000000000006', 2500.00, 'COP', 0.570776,  'PRICE_HISTORY', '2024-06-30', null),
  ('60000000-0000-0000-0000-000000000607', 'a0000000-0000-0000-0000-000000000006', 2420.00, 'COP', 0.556322,  'PRICE_HISTORY', '2024-07-31', null),
  ('60000000-0000-0000-0000-000000000608', 'a0000000-0000-0000-0000-000000000006', 2380.00, 'COP', 0.547126,  'PRICE_HISTORY', '2024-08-31', null),
  ('60000000-0000-0000-0000-000000000609', 'a0000000-0000-0000-0000-000000000006', 2450.00, 'COP', 0.561798,  'PRICE_HISTORY', '2024-09-30', null),
  ('60000000-0000-0000-0000-000000000610', 'a0000000-0000-0000-0000-000000000006', 2520.00, 'COP', 0.580645,  'PRICE_HISTORY', '2024-10-31', null),
  ('60000000-0000-0000-0000-000000000611', 'a0000000-0000-0000-0000-000000000006', 2600.00, 'COP', 0.600924,  'PRICE_HISTORY', '2024-11-30', null),
  ('60000000-0000-0000-0000-000000000612', 'a0000000-0000-0000-0000-000000000006', 2650.00, 'COP', 0.614963,  'PRICE_HISTORY', '2024-12-31', null),
  ('60000000-0000-0000-0000-000000000613', 'a0000000-0000-0000-0000-000000000006', 2480.00, 'COP', 0.573870,  'PRICE_HISTORY', '2025-01-31', null),
  ('60000000-0000-0000-0000-000000000614', 'a0000000-0000-0000-0000-000000000006', 2400.00, 'COP', 0.555556,  'PRICE_HISTORY', '2025-02-28', null),
  ('60000000-0000-0000-0000-000000000615', 'a0000000-0000-0000-0000-000000000006', 2200.00, 'COP', 0.507257,  'PRICE_HISTORY', '2025-03-31', null),
  ('60000000-0000-0000-0000-000000000616', 'a0000000-0000-0000-0000-000000000006', 2100.00, 'COP', 0.487805,  'PRICE_HISTORY', '2025-04-30', null),
  ('60000000-0000-0000-0000-000000000617', 'a0000000-0000-0000-0000-000000000006', 1950.00, 'COP', 0.450346,  'PRICE_HISTORY', '2025-05-31', null),
  ('60000000-0000-0000-0000-000000000618', 'a0000000-0000-0000-0000-000000000006', 1850.00, 'COP', 0.451220,  'PRICE_HISTORY', '2025-06-30', null)
on conflict (id) do nothing;

commit;
