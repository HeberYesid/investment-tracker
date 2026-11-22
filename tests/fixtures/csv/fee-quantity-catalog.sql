-- Solo para la base descartable de la prueba autenticada de comisiones.
insert into public.assets (id, ticker, name, asset_type, currency, exchange)
values ('f0000000-0000-4000-8000-000000000001', 'FEEQ', 'Instrumento sintético FEE', 'STOCK', 'USD', 'NASDAQ');
insert into public.market_prices (asset_id, price, currency, price_usd, observed_at, source)
values ('f0000000-0000-4000-8000-000000000001', 115.125, 'USD', 115.125, '2025-01-16T12:00:00Z', 'YAHOO');
