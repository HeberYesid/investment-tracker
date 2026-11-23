# supabase

Sigue el [AGENTS.md raíz](../AGENTS.md) para el flujo de trabajo y la [arquitectura](../docs/architecture.md) para los límites de acceso a datos.

## `migrations/`
- `0001_foundation.sql` es **inmutable**. Introduce cambios en una nueva migración `NNNN_nombre.sql` con el siguiente número disponible, en orden de aplicación.
- Mantén las migraciones idempotentes y documenta cómo revertir el cambio o qué impide hacerlo de forma segura.
- Toda tabla `public` **debe** tener RLS habilitado. Si cambian políticas o permisos, comprueba accesos permitidos y denegados, incluido el aislamiento entre portafolios cuando aplique.
- Los trades llevan campos USD normalizados (`total_invested_usd`, `fx_rate_to_usd`, etc.) — calculados por `normalizeTradeUsdValues` en `src/lib/validations/trades.ts`. También se almacenan valores en moneda original.

## `functions/`
Edge Functions en Deno (`sync-prices`, `sync-fx-rates`, `sync-asset-prices-history`). Comparte código en `_shared/`; no importes desde `src/` ni dependas del sistema de archivos local. Las funciones quedan fuera del build de Next.js. Probar localmente no autoriza desplegar ni modificar una base remota.

## Verificación

- Ejecuta `pnpm test:run src/__tests__/migrations` para los smoke tests. [`schema.test.ts`](../src/__tests__/migrations/schema.test.ts) aplica una lista explícita de migraciones en PGlite con sustitutos para servicios de Supabase; no presupongas que una migración nueva queda cubierta automáticamente.
- Para cambios de permisos o dependencias de extensiones, añade evidencia en un Postgres local representativo cuando PGlite no reproduzca la garantía que cambia. Consulta la [guía de verificación](../docs/verification.md#verificación-de-migraciones).
