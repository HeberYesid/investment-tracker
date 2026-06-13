-- Fix TRM mal guardada en trades COP.
--
-- Contexto: el preview de imports CSV recibía la TRM como "1 USD = X COP"
-- (ej: 3800) y la guardaba directamente en `fx_rate_to_usd`. Pero el cálculo
-- `price_usd = price_original * fx_rate_to_usd` espera el multiplicador
-- inverso (ej: 1/3800 = 0.000263). Esto infló los `total_invested_usd` de los
-- trades COP en ~14 millones de veces y distorsionaba portafolio y P&L.
--
-- Esta migración detecta los trades COP con la TRM al revés
-- (`fx_rate_to_usd > 1`) y los corrige:
--   new_fx_rate_to_usd    = 1 / old_fx_rate_to_usd
--   new_price_usd         = old_price_usd / old_fx_rate_to_usd^2
--   new_commission_usd    = old_commission_usd / old_fx_rate_to_usd^2
--   new_total_invested_usd = old_total_invested_usd / old_fx_rate_to_usd^2
--
-- Idempotente: si se corre dos veces, los trades ya corregidos tendrán
-- fx_rate_to_usd < 1 y el WHERE no los tocará.

begin;

update public.trades t
set
  fx_rate_to_usd      = 1.0 / t.fx_rate_to_usd,
  price_usd           = t.price_usd / (t.fx_rate_to_usd * t.fx_rate_to_usd),
  commission_usd      = t.commission_usd / (t.fx_rate_to_usd * t.fx_rate_to_usd),
  total_invested_usd  = t.total_invested_usd / (t.fx_rate_to_usd * t.fx_rate_to_usd)
where t.currency_original = 'COP'
  and t.fx_rate_to_usd > 1
  and t.deleted_at is null;

commit;
