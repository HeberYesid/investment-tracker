# Implementación: market-data-resilience-and-disclosure

- Fecha: 2026-11-21.
- Alcance: compatibilidad de fuentes y primer tramo del fallback en `sync-prices`. No incluye `sync-status`, UI, FX, métricas ni despliegue.

## Trazabilidad

- R4 → `src/__tests__/migrations/schema.test.ts`: «conserva las fuentes históricas y admite STOOQ sin una migración nueva» (1.1–1.2).
- R2, R3 y R7 (tramo del worker) → `tests/asset-catalog-quote-workers.test.ts`: Yahoo `429` con Stooq exitoso, Yahoo exitoso sin consulta a Stooq, doble fallo con caché anterior intacta y continuación del lote. Observado en rojo el `429` sin fallback; el control de bolsa también falló antes de añadir el filtro.
- El catálogo conserva el filtro de símbolos verificados; Stooq se limita al mapeo local de acciones y ETF en USD, NASDAQ/NYSE. El benchmark sigue con Yahoo.

## Pendiente

- Validación pública autorizada (2026-11-22): `GET https://stooq.com/q/l/?s=<símbolo>&f=sd2t2ohlcv&h=&e=csv` devolvió `404 text/html` para `aapl.us`, `amzn.us`, `goog.us`, `googl.us`, `meta.us`, `msft.us`, `nvda.us`, `spy.us`, `tsla.us` y `voo.us`. Variantes de la consulta de AAPL también devolvieron 404. `GET /q/d/l/?s=aapl.us&i=d` devolvió 200 con HTML de verificación de navegador, no CSV. No se pudo confirmar moneda ni hora del dato real. Las pruebas simuladas siguen siendo evidencia de comportamiento ante respuestas válidas, no de disponibilidad del proveedor. No se usaron credenciales ni datos del portafolio y no se ejecutó una sincronización remota.
- El mapeo, el formato y la convención horaria del CSV se probaron con fixtures, no con Stooq real; confirmar antes de desplegar.
- El build sin red pasó con respuestas CSS simuladas y fuentes de sistema. En `next start`, el backend simulado recibió dos lecturas privadas en la primera consulta y ninguna en la segunda; tras invalidar `market-prices`, recibió otras dos y el cliente obtuvo el motivo nuevo. En Chromium se observó el aviso en móvil y el indicador con título Stooq en escritorio, sin encolar sincronizaciones. No equivale a ejecutar la suite contra Supabase.

## Segunda etapa

- 2026-11-22, smoke Edge: Supabase efímero `it-market-474de4f647`, API/PostgreSQL locales y Edge Runtime `v1.74.0` en el puerto 55429. Se aplicaron las migraciones originales hasta 0016 en el contenedor descartable; no se cambiaron roles. La fixture devolvió 429 de Yahoo y CSV de Stooq para AAPL. El worker guardó exactamente una cotización, `STOOQ` USD 192,40, y PostgreSQL devolvió `yahoo_ok=0,stooq_fallback=1`. Se cerró el stack; no hubo tráfico hacia proveedores.
- 2026-11-22, E2E: `pnpm test:e2e tests/e2e/market-data-disclosure.spec.ts --reporter=list`, 1/1 en Chromium móvil (5,6 s), stack `it-market-98c8fc8112`. El build pasó con CSS de fuentes simulado. La prueba entra con Mailpit/Auth, verifica que no salen datos crudos, muestra motivo y fuente Stooq y confirma que no se encola la sincronización. Se difirió la cotización demo en el stack efímero para que la fila Stooq fuera la más reciente elegible.

- R1–R8 → `stooq.test.ts`, `composite.test.ts`, `asset-catalog-quote-workers.test.ts`: validación del CSV, orden del fallback, caché anterior, fuente y métricas de corrida.
- R2, R3, R7, R8 → `supabase/functions/sync-prices/smoke_test.ts`: ejecución en Deno del handler real y del cliente Supabase con transporte HTTP simulado, sin permiso de red. Repetir con `deno test --no-lock --allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,MARKET_DATA_YAHOO_BASE_URL,STOOQ_BASE_URL,MARKET_DATA_USER_AGENT,APP_URL,ADMIN_CACHE_TOKEN supabase/functions/sync-prices/smoke_test.ts`.
- R9, R14, R15 → `dashboard/sync-status.test.ts`, `api/market-sync-status.test.ts`, `api/dashboard.test.ts` y prueba PGlite en `migrations/schema.test.ts`: cruce con posiciones activas, límite por usuario, contrato de resumen/snapshot y privacidad de la tabla.
- R10–R13 → `summary-cards.test.tsx`, `distribution-chart.test.tsx`, `dates.test.ts`: motivo, fechas, estimación y fuente del dato.
- La migración `0016_market_sync_failed_assets.sql` debe aplicarse antes de entregar la Edge Function y el nuevo endpoint. No cambia los valores admitidos en `market_prices.source` ni concede lecturas sobre `market_sync_runs`.
