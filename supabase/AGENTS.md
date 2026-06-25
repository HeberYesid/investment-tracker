# supabase

## `migrations/`
- `0001_foundation.sql` es **inmutable**. Cambios → nuevo `000N_*.sql`.
- Numeradas en orden de aplicación. Cada migración debe ser idempotente con timestamps y reversible.
- Toda tabla `public` **debe** tener RLS habilitado (lo verifica `schema.test.ts`).
- Los trades llevan campos USD normalizados (`total_invested_usd`, `fx_rate_to_usd`, etc.) — calculados por `normalizeTradeUsdValues` en `src/lib/validations/trades.ts`. También se almacenan valores en moneda original.

## `functions/`
Edge Functions en Deno (`sync-prices`, `sync-fx-rates`, `_shared`). Deployable independientemente. Sin acceso a filesystem local.

## Smoke test de migraciones
Corre DDL en PGlite en memoria. `auth.uid()` y schemas `auth`/`extensions` están stubbeados. El test strips la línea de `pgcrypto` (PGlite no lo implementa).
