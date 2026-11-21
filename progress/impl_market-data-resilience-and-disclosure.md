# Implementación: market-data-resilience-and-disclosure

- Fecha: 2026-11-21.
- Alcance: compatibilidad de fuentes y primer tramo del fallback en `sync-prices`. No incluye `sync-status`, UI, FX, métricas ni despliegue.

## Trazabilidad

- R4 → `src/__tests__/migrations/schema.test.ts`: «conserva las fuentes históricas y admite STOOQ sin una migración nueva» (1.1–1.2).
- R2, R3 y R7 (tramo del worker) → `tests/asset-catalog-quote-workers.test.ts`: Yahoo `429` con Stooq exitoso, Yahoo exitoso sin consulta a Stooq, doble fallo con caché anterior intacta y continuación del lote. Observado en rojo el `429` sin fallback; el control de bolsa también falló antes de añadir el filtro.
- El catálogo conserva el filtro de símbolos verificados; Stooq se limita al mapeo local de acciones y ETF en USD, NASDAQ/NYSE. El benchmark sigue con Yahoo.

## Pendiente

- La implementación Deno actual conserva el error de Yahoo cuando no se puede recuperar la cotización. Quedan pendientes el proveedor Zod y registry de Node, las métricas de corrida y la prueba con el runtime Deno/Supabase.
- El formato y la convención horaria del CSV se probaron con fixtures, no con Stooq real; confirmar antes de desplegar.
