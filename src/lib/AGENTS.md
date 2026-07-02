# src/lib

Fuente canónica para: clientes Supabase, dinero/decimales como string, validaciones Zod.

Lógica de negocio. Cada sub-área tiene un único responsable.

## Sub-áreas

### `api/errors.ts`
Helpers `badRequest` / `validationError` / `serverError` para Route Handlers. Usar siempre, no devolver `Response` con status crudo.

### `validations/` — Zod contract
Schemas en `trades.ts`, `dashboard.ts`, `fx.ts` son la fuente de verdad del wire. **Dinero**: decimales como string (`"123.45"`), nunca `number`. El server hace parse/Decimal solo en el límite. `normalizeTradeUsdValues` en `trades.ts` calcula `total_invested_usd`, `fx_rate_to_usd`, etc.

### `supabase/` — Clientes
| Cliente | Cuándo |
|---|---|
| `createBrowserSupabaseClient()` | Client components |
| `createUserSupabaseClient()` | **Default**: Route Handlers, RSC, Server Actions. Lee cookies, respeta RLS. |
| `createServiceSupabaseClient()` | Bypassa RLS. Solo tareas internas confiables. **Nunca en `src/app/`**. |

`SUPABASE_SERVICE_ROLE_KEY` → nunca como `NEXT_PUBLIC_*`, nunca importar en client components.

### `csv/` — Importación
Pipeline: `parsers/<broker>.ts` → `registry.ts` → `validation.ts`. Cada parser implementa `CsvBrokerParser`. **Agregar un broker nuevo:**
1. `BrokerSeed` + `BrokerCode` → `src/lib/reference/brokers.ts`
2. Parser en `src/lib/csv/parsers/<broker>.ts`
3. Registrar en `src/lib/csv/registry.ts`
4. Agregar a `validBrokers` en `src/app/api/v1/imports/csv/preview/route.ts`
5. Fixture en `tests/fixtures/csv/` + test en `tests/unit/csv/`
6. Seed via nueva migración numerada

### `reference/brokers.ts`
`BrokerCode` union + `BROKER_SEEDS`. Fuente de verdad de brokers (code, name, currency, parser).

### `i18n/`
Diccionarios en español. Sin copy hardcodeado en componentes.

### `calculations/`
Agregación de posiciones. Funciones puras sobre trades, sin acceso a DB directo.

### `market-data/`
Providers de precio y FX (yahoo, open-er-api). Sin estado global; el cache es responsabilidad del caller.

### `dashboard/`
`loader.ts` (fetch) + `snapshot.ts` (cálculo). Compose, no calcula.

### `trades/queries.ts`
Queries reutilizables sobre la tabla `trades`. Usar desde RSC y Route Handlers, no duplicar queries inline.
