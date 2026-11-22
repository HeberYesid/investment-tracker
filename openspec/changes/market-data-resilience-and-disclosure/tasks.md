## 1. Compatibilidad de la base de datos

- [x] 1.1 Confirmar que el esquema vigente admite `STOOQ` sin una migración nueva. Cubre: R4.
- [x] 1.2 En `src/__tests__/migrations/schema.test.ts`, comprobar en PGlite que se pueden guardar y recuperar `STOOQ`, `YAHOO`, `BENCHMARK`, `PRICE_HISTORY` y `BENCHMARK_HISTORY`. Cubre: R4.

## 2. Stooq provider

- [x] 2.1 Create `src/lib/market-data/stooq.ts` exporting `createStooqProvider(opts?: StooqProviderOptions): PriceProvider`. Cubre: R1.
- [x] 2.2 Define a Zod schema (`StooqCsvRowSchema`) in `src/lib/market-data/stooq.ts` that validates a single CSV row with columns `Symbol,Date,Time,Open,High,Low,Close,Volume` (all required, `Close` must be a positive number). Cubre: R5.
- [ ] 2.3 Implementar un mapa explícito de al menos 10 cotizaciones verificadas en USD. Activos sin mapeo, colombianos, cripto y el benchmark quedan fuera del fallback inicial; el proveedor rechaza un símbolo sin mapa con `NOT_FOUND` antes de consultar la red. Bloqueo observado: el endpoint CSV configurado devolvió HTTP 404 para los 10 símbolos el 2026-11-22. Cubre: R6.
- [x] 2.4 Implement `fetchQuotes` to build the URL, call Stooq with a desktop `User-Agent` header (reuse `env.userAgent`), parse the CSV body, and return `FetchedQuote[]` with `symbol` reset to the original requested symbol, `currency: 'USD'`, `delayedUntil: null`. Reject with `INVALID_PAYLOAD` on Zod failure, `RATE_LIMITED` on HTTP 429, `TRANSIENT` on network errors, `PERMANENT` on other non-2xx. Cubre: R1, R5, R6.
- [x] 2.5 Configurar `STOOQ_BASE_URL` y reutilizar las opciones de agente y timeout en Node. Cubre: R1.
- [x] 2.6 Probar CSV válido e inválido, HTTP 429, símbolo sin mapa y fallo de red en `src/__tests__/market-data/stooq.test.ts`. Cubre: R1, R5, R6.

## 3. Composite provider

- [x] 3.1 Crear `createCompositeProvider` con Yahoo seguido de Stooq. Cubre: R2, R7.
- [x] 3.2 Resolver cada símbolo de forma independiente y etiquetar la fuente efectiva. Cubre: R2, R3, R7.
- [x] 3.3 Conservar el error principal si no se obtiene cotización de respaldo. Cubre: R2, R7.
- [x] 3.4 Exponer el desglose por proveedor y registrar el desglose equivalente en el worker Deno. Cubre: R8.
- [x] 3.5 Probar éxito de Yahoo sin fallback, fallback por símbolo y conservación del error principal con HTTP simulado. Cubre: R2, R3, R7.

## 4. Registry update

- [x] 4.1 Exportar el compuesto predeterminado y su reinicio para pruebas en `registry.ts`. Cubre: R1, R2.
- [x] 4.2 Probar el registro y su reinicio en `composite.test.ts`; los tests del perfil de Yahoo prueban el adaptador directamente y no necesitan el registro. Cubre: R1.

## 5. Edge Function

- [x] 5.1 Usar el fallback compartido en Deno y registrar `yahoo_ok=N,stooq_fallback=M` en corridas `SUCCESS`. Cubre: R2, R7, R8.
- [x] 5.2 Pass the composite's resolved `source` value (`'YAHOO'`, `'STOOQ'`, `'BENCHMARK'`) to the `market_prices` insert so the row records the effective provider. Cubre: R3.
- [x] 5.3 Mantener el fallback Deno sin dependencias nuevas; se reutiliza el adaptador Yahoo existente. Cubre: R1, R2.
- [x] 5.4 Ejecutar `sync-prices` en Supabase Edge Runtime local con proveedores simulados y confirmar la fila `STOOQ` y el desglose persistido en PostgreSQL. Verificado con la imagen local `edge-runtime:v1.74.0`; el smoke complementario también verifica doble fallo en Deno. Cubre: R2, R7, R8.

## 6. Sync status endpoint

- [x] 6.1 Leer la última corrida de `PRICES` y su último éxito en un helper interno; agregar los códigos privados exclusivamente para posiciones abiertas autorizadas y estimar el próximo intento. Cubre: R9, R15.
- [x] 6.2 Definir `SyncHealthSchema` y los campos de diagnóstico y visibilidad en resumen y snapshot. Cubre: R14.
- [x] 6.3 Servir `GET /api/v1/market-data/sync-status` con portafolio autorizado y sin errores crudos. Caché interna verificada en Next.js de producción con backend local simulado: reutilización e invalidación por etiqueta. Cubre: R9, R15.
- [x] 6.4 Limitar a 60 solicitudes por minuto y usuario; comprobar HTTP 429 en la solicitud 61. Cubre: R9.
- [x] 6.5 Probar éxito reciente, fallo total, parcial propio, parcial ajeno y ausencia de corridas recientes con fixtures; verificar en PGlite que el usuario no lee diagnósticos crudos. Cubre: R9, R15.
- [x] 6.6 Devolver diagnóstico y visibilidad desde el resumen y snapshot, sin consultar proveedores durante la lectura. Cubre: R14.
- [x] 6.7 Afirmar ambos campos en las pruebas de API de resumen y snapshot (`src/__tests__/api/dashboard.test.ts`). Cubre: R14.

## 7. i18n: relative date helper

- [x] 7.1 Formatear fechas relativas en `dates.ts` con zona horaria de Bogotá. Cubre: R13.
- [x] 7.2 Añadir las razones y etiquetas de fecha en `i18n/dashboard.ts`. Cubre: R10.
- [x] 7.3 Probar los formatos y casos límite en `src/lib/i18n/dates.test.ts`. Cubre: R13.

## 8. UI: enriched stale banner

- [x] 8.1 Mostrar título, fecha relativa, razón y próximo intento cuando aplique. Cubre: R10, R11, R13.
- [x] 8.2 Llevar el diagnóstico a `SummaryCards` a través del resumen; conservar el aviso básico si no está disponible. Cubre: R10, R14.
- [x] 8.3 Mostrar fecha y fuente de la cotización desactualizada en el indicador de distribución. Cubre: R12.
- [x] 8.4 Exponer fecha y fuente desde la ruta de distribución y el agregado. Cubre: R12.
- [x] 8.5 Probar el aviso ampliado y el básico en `summary-cards.test.tsx`. Cubre: R10, R11, R14.
- [x] 8.6 Probar que el indicador incluye fecha y fuente en `distribution-chart.test.tsx`. Cubre: R12.

## 9. Tests, lint, build

- [x] 9.1 Run `pnpm lint` and fix any new lint errors. Cubre: — (verificación, sin R asociado).
- [x] 9.2 Run `pnpm test:run` and confirm all new and existing tests pass. Cubre: — (verificación global).
- [x] 9.3 Ejecutar `pnpm build` y comprobar que genera la aplicación de producción. Verificado sin red con respuestas CSS de fuentes simuladas. Cubre: — (verificación global).
- [x] 9.4 Ejecutar `tests/e2e/market-data-disclosure.spec.ts` contra el Supabase efímero y comprobar el aviso y el indicador de fuente. Pasó en Chromium móvil con Next de producción, Auth, Mailpit y PostgreSQL locales. Cubre: R10, R12.

## 10. Documentation

- [x] 10.1 Documentar fallback, endpoint, aviso y conservación de fuentes históricas en `README.md`. Cubre: — (documentación, sin R asociado).
- [x] 10.2 Documentar el orden de proveedores y la separación del histórico en `composite.ts`. Cubre: — (documentación, sin R asociado).
