# Convenciones de código

> Homogeneidad extrema. La IA predice mejor cuando el repositorio se parece
> a sí mismo en todas partes.

## TypeScript

- **Versión:** TypeScript 5.x con `strict: true`.
- **Path alias:** `@/*` → `./src/*` (tsconfig + Vitest).
- **Tipos:** Preferir `interface` para objetos públicos, `type` para uniones/utilities.
- **Zod:** Schemas en `src/lib/validations/` son la fuente de verdad del contrato wire.
  Usar `z.infer<typeof schema>` para derivar tipos TypeScript. Nunca duplicar tipos a mano.
- **Server Components** por default. Marcar con `"use client"` solo si se necesita
  estado (`useState`), efectos (`useEffect`), o hooks de navegación.
- **Imports:** Path alias `@/*` para todo dentro de `src/`. No usar imports relativos
  con más de 2 niveles (`../../`).

## Nombres

| Tipo                    | Convención        | Ejemplo                          |
|-------------------------|-------------------|----------------------------------|
| Archivos (pages/routes) | `kebab-case`      | `edit-trade`, `csv-preview`      |
| Componentes React       | `PascalCase`      | `TradeForm`, `BenchmarkChart`    |
| Funciones / variables   | `camelCase`       | `getCurrentPortfolio`            |
| Módulos lib             | `kebab-case`      | `market-data.ts`, `api/errors.ts`|
| Constantes              | `UPPER_SNAKE`     | `STALE_PRICE_MS`                 |
| Tablas SQL              | `snake_case`      | `market_prices`, `fx_rates`      |
| Migraciones             | `NNNN_name.sql`   | `0002_profiles.sql`              |

## Estructura de archivo TypeScript

Cada módulo nuevo en `src/lib/`:

```typescript
// imports externos (next, react, supabase)
import { createUserSupabaseClient } from "@/lib/supabase/server";

// imports locales
import { badRequest } from "@/lib/api/errors";
import { tradeSchema } from "@/lib/validations/trades";

// implementación
export async function getTrades() {
  // ...
}
```

## Tailwind v4

- Config via `@theme` block en `src/app/globals.css`.
- **No existe `tailwind.config.*`** — Tailwind v4 usa CSS-based config.
- PostCSS plugin: `@tailwindcss/postcss` en `postcss.config.mjs`.
- Clases utility directamente en JSX; no usar `@apply` en CSS.

## i18n

- Strings de UI en `src/lib/i18n/*.ts`. Un archivo por dominio (dashboard.ts, trades.ts, etc.).
- Sin copy hardcodeado en componentes. Si ves un string literal en español en JSX,
  debe moverse a i18n.
- Formato: funciones que retornan strings o constantes. Pueden aceptar parámetros.

## Supabase

- **Browser client** (`createBrowserSupabaseClient`): client components.
- **User client** (`createUserSupabaseClient`): default para RSC, Route Handlers,
  Server Actions. Lee cookies de la request, respeta RLS.
- **Service client** (`createServiceSupabaseClient`): bypassa RLS. Solo en `src/lib/supabase/`
  y Edge Functions. **Nunca en `src/app/`.**
- `SUPABASE_SERVICE_ROLE_KEY` nunca como `NEXT_PUBLIC_*`. No importar en client components.

## Tests

- **Unitarios:** Vitest con jsdom. Archivos `*.test.{ts,tsx}` en `src/` o `tests/`.
- **E2E:** Playwright en `tests/e2e/`. Dev server en `127.0.0.1:3100`.
- **Fixtures:** `tests/fixtures/csv/` para parsers CSV (un archivo por caso de prueba).
- **Convenciones de nombres:**
  - `describe("modulo o componente", () => { ... })`
  - `it("debe hacer X cuando Y", () => { ... })`
  - Nombres en español para describir el comportamiento esperado.

## Manejo de errores

- Route Handlers → helpers de `src/lib/api/errors.ts`.
- Funciones de dominio en `src/lib/` → lanzar errores nombrados, no devolver `null`.
- No propagar stack traces al cliente. En producción, `serverError` oculta detalles.

## Comentarios

Por defecto **no** se escriben. Solo se permiten cuando explican un *por qué*
no obvio (workaround documentado, invariante sutil). Los nombres deben hacer el resto.
