# src/lib

Lógica de negocio y contratos de datos. Sigue el [AGENTS.md raíz](../../AGENTS.md) para el flujo de trabajo y las [convenciones](../../docs/conventions.md) para el código.

## Sub-áreas

### `api/errors.ts`
Usa los helpers de error en los Route Handlers en lugar de construir respuestas de error a mano.

### `validations/` — Contratos Zod
Los esquemas son la fuente del contrato de API; deriva los tipos con `z.infer`. **Dinero:** envía decimales como cadenas (`"123.45"`), nunca como `number`; convierte solo en el límite del servidor. `normalizeTradeUsdValues` en `trades.ts` calcula los campos USD normalizados.

### `supabase/` — Clientes
| Cliente | Cuándo |
|---|---|
| `createBrowserSupabaseClient()` | Client components |
| `createUserSupabaseClient()` | Por defecto en servidor. Lee las cookies y respeta RLS. |
| `createServiceSupabaseClient()` | Omite RLS. Solo para tareas internas de confianza. **Nunca en `src/app/`**. |

`SUPABASE_SERVICE_ROLE_KEY` → nunca como `NEXT_PUBLIC_*`, nunca importar en client components.

### `csv/` — Importación
Pipeline: `parsers/<broker>.ts` → `registry.ts` → `validation.ts`. Cada parser implementa `CsvBrokerParser`. **Agregar un broker nuevo:**
1. `BrokerSeed` + `BrokerCode` → `src/lib/reference/brokers.ts`
2. Parser en `src/lib/csv/parsers/<broker>.ts`
3. Registrar en `src/lib/csv/registry.ts`
4. Agregar a `validBrokers` en `src/app/api/v1/imports/csv/preview/route.ts`
5. Fixture en `tests/fixtures/csv/` o `tests/fixtures/files/`, según el formato, y prueba en `src/__tests__/csv/`.
6. Datos de referencia mediante una nueva migración numerada; sigue las [reglas de Supabase](../../supabase/AGENTS.md).

### `reference/brokers.ts`
`BrokerCode` union + `BROKER_SEEDS`. Fuente de verdad de brokers (code, name, currency, parser).

### `i18n/`
Diccionarios en español. Sin copy hardcodeado en componentes.

### `calculations/`
Agregación de posiciones. Funciones puras sobre trades, sin acceso a DB directo.

### `market-data/`
Providers de precio y FX (yahoo, open-er-api). Sin estado global; el cache es responsabilidad del caller.

### `dashboard/`
`loader.ts` coordina las lecturas; `snapshot.ts` compone los cálculos. Mantén separado el acceso a datos de la lógica de dominio.

### `trades/queries.ts`
Queries reutilizables sobre la tabla `trades`. Usar desde RSC y Route Handlers, no duplicar queries inline.

## Verificación

Aplica TDD a cambios de lógica de negocio y contratos. Cubre el resultado esperado y los casos de error o límites relevantes (por ejemplo, precisión monetaria). Ubica las pruebas en el dominio correspondiente de `src/__tests__/` y sigue la [guía de verificación](../../docs/verification.md).
