# AGENTS.md — Mapa de navegación para agentes de IA

> Este archivo es el **punto de entrada** para cualquier agente que trabaje en este
> repositorio. NO es una biblia de reglas: es un **mapa**. Lee solo lo que
> necesites cuando lo necesites (divulgación progresiva).

---

## 1. Antes de empezar (obligatorio)

1. Ejecuta `node init.mjs` y verifica que termina sin errores. Si falla, **para**
   y resuelve el entorno antes de tocar código.
2. Lee `progress/current.md` para entender en qué estado quedó la última sesión.
3. Lee `feature_list.json`. Toda feature nueva (`"sdd": true`) pasa por
   **Spec Driven Development con Openspec** — ver `docs/specs.md` y §4 de este archivo.
4. Lee `docs/specs.md` antes de tocar cualquier spec o feature `sdd: true`.

## 2. Mapa del repositorio

| Archivo / carpeta            | Qué contiene                                                                | Cuándo leerlo |
|------------------------------|-----------------------------------------------------------------------------|---------------|
| `feature_list.json`          | Lista de features con estado (`pending` / `spec_ready` / `in_progress` / `done` / `blocked`) | Siempre, al empezar |
| `progress/current.md`        | Estado de la sesión actual                                                  | Siempre, al empezar |
| `progress/history.md`        | Bitácora append-only de sesiones anteriores                                 | Si necesitas contexto histórico |
| `openspec/changes/<name>/`   | `proposal.md` + `design.md` + `tasks.md` (Kiro-style)                       | Antes de implementar cualquier feature con `"sdd": true` |
| `docs/architecture.md`       | Qué significa "hacer un buen trabajo" en este proyecto                      | Antes de implementar |
| `docs/conventions.md`        | Reglas de estilo, nombres, estructura                                       | Antes de escribir código |
| `docs/specs.md`              | Proceso SDD: EARS notation, los 3 archivos, puerta de aprobación humana     | Antes de redactar o leer un spec |
| `docs/verification.md`       | Cómo verificar que tu trabajo funciona (incluye trazabilidad requirements)  | Antes de declarar una tarea como `done` |
| `CHECKPOINTS.md`             | Criterios objetivos de "estado final correcto"                              | Para auto-evaluarte |
| `.opencode/commands/`        | Definiciones de subagentes (`leader`, `spec-author`, `implementer`, `reviewer`) y comandos de orquestación | Si orquestas trabajo |
| `src/`                       | Código de la aplicación                                                     | Para implementar |
| `tests/`                     | Tests automáticos (Vitest unit + Playwright e2e)                            | Para verificar |

### Guías de contexto por capa

| Archivo | Cuándo leerlo |
|---------|---------------|
| `src/app/AGENTS.md` | Antes de modificar pages, layouts o Route Handlers |
| `src/lib/AGENTS.md` | Antes de modificar lógica de negocio (Supabase clients, validaciones Zod, CSV, market-data, cálculos, i18n) |
| `supabase/AGENTS.md` | Antes de crear migraciones o modificar Edge Functions |
| `tests/AGENTS.md` | Antes de escribir tests unitarios o e2e |

## 3. Reglas duras (no negociables)

- **Una sola feature a la vez.** No mezcles cambios de varias tareas en la misma sesión.
- **No declares una tarea `done` sin pruebas verdes.** Ejecuta `node init.mjs` y
  asegúrate de que el bloque de tests pasa al 100%.
- **No saltes la fase de spec.** Toda feature con `"sdd": true` debe pasar
  por `spec-author` y obtener aprobación humana antes de tocar código.
- **No saltes la puerta de aprobación humana.** El leader detiene el flujo
  en `spec_ready` y espera.
- **Documenta lo que haces** en `progress/current.md` mientras trabajas, no al final.
- **Deja el repositorio limpio** antes de cerrar la sesión (ver §5).
- **Si no sabes algo, busca en `docs/`** antes de inventarlo.

### Convenciones técnicas globales

- **Stack**: Next.js 15 App Router + React 19 + Supabase + pnpm.
- **Restricción**: USD 0/mes (Vercel Hobby + Supabase Free únicamente). Sin servicios pagos.
- **i18n**: strings en español en `src/lib/i18n/*.ts`. Sin copy hardcodeado en componentes.
- **Tailwind v4**: config via `@theme` en `src/app/globals.css`. **No existe `tailwind.config.*`**.
  PostCSS plugin: `@tailwindcss/postcss`.
- **Path alias**: `@/*` → `./src/*` (tsconfig + Vitest).
- **Dinero**: decimales como string en el wire. Contrato = Zod. Nunca `number` para valores monetarios.

### Clientes Supabase

| Cliente | Cuándo |
|---------|--------|
| `createBrowserSupabaseClient()` | Client components |
| `createUserSupabaseClient()` | **Default**: Route Handlers, RSC, Server Actions |
| `createServiceSupabaseClient()` | Bypassa RLS. Solo tareas internas. **Nunca en `src/app/`**. |

`SUPABASE_SERVICE_ROLE_KEY` → nunca como `NEXT_PUBLIC_*`, nunca en client components.

### Routing de tareas

| Tipo | Acción |
|------|--------|
| Trivial (typo, 1 línea) o bug aislado | Resolver directo o subagente (`code-reviewer`, `tdd-guide`) |
| Harness/config change | Subagente `harness-optimizer` directo |
| Feature no trivial (>1 sesión) | **OpenSpec primero** (skill `openspec-propose`) |

### Sync de mercado

- Providers: Yahoo Finance (precios + S&P 500 benchmark) y open.er-api.com (USD/COP). Sin API keys.
- Lectura: dashboard y form de trades leen `market_prices` y `fx_rates` cacheados, **nunca** llaman providers on-read.
- `pg_cron`: `sync-prices-30m` (cada 30 min), `sync-fx-rates-daily` (06:00 UTC).
- Botón `Sincronizar ahora` en `BenchmarkChart` es **solo dev** (gate `NODE_ENV !== 'production'`).

## 4. Flujo de trabajo (SDD)

```
pending → [spec-author] → spec_ready → ⏸ HUMANO → in_progress → [implementer → reviewer] → done
```

1. El leader detecta la primera feature `pending` con `"sdd": true`.
2. El leader lanza `spec-author`, que crea
   `openspec/changes/<name>/{proposal,design,tasks}.md` y marca el status como
   `spec_ready`.
3. **Pausa.** El humano lee el spec en `openspec/changes/<name>/` y aprueba (o pide cambios).
4. Una vez aprobado, el leader cambia el status a `in_progress` y lanza `implementer`.
5. El implementer ejecuta `tasks.md` una a una (TDD: test primero → verde), marcándolas `[x]`
   y documentando la trazabilidad en `progress/impl_<name>.md`.
6. El reviewer verifica trazabilidad `R<n>` ↔ test y tasks completas;
   aprueba o rechaza.
7. Si aprueba, el leader marca `done` y mueve el resumen a
   `progress/history.md`.

## 5. Cierre de sesión (lifecycle)

Antes de terminar:

1. Ejecuta `node init.mjs` — todo verde.
2. Si la tarea está acabada: marca `status: "done"` en `feature_list.json`.
3. Mueve el resumen de `progress/current.md` al final de `progress/history.md`
   con formato: `<!-- SESIÓN: YYYY-MM-DD | Feature: <name> | Agente: <agent> | Resultado: <done|blocked|paused> -->`.
4. Vacía `progress/current.md` dejando solo la plantilla.
5. No dejes archivos temporales, ni `console.log` de debug, ni TODOs sin contexto.

## 6. Si te bloqueas

- Relee la sección relevante de `docs/`.
- Si la herramienta no hace lo que esperas, **no inventes un workaround**:
  documenta el bloqueo en `progress/current.md` y para la sesión.
- Si estás en fase SDD y el spec tiene contradicciones, marca la feature como
  `blocked` en `feature_list.json` e indica la razón en `progress/current.md`.
