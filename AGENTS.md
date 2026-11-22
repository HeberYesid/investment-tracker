# AGENTS.md — Mapa de navegación para agentes de IA

-App personal para gestionar portafolio personal

## 1. Antes de empezar (obligatorio)
1.Hay dos scripts de verificación. Ejecuta según el momento:

| Momento | Comando | Qué hace |
|---|---|---|
| Inicio de sesión | `node init-quick.mjs` | Revisa entorno, archivos base y `feature_list.json`. Es instantáneo y de solo lectura. |
| Antes de marcar una feature como `done` | `node init-full.mjs` | Lo anterior, más instalación de dependencias, escaneo de secrets y tests. |

Reglas:

1. Al comenzar CUALQUIER sesión, ejecuta `node init-quick.mjs`. Si falla, no avances: resuelve el error o repórtalo.
2. Si la tarea va a modificar código, ejecuta también `pnpm test:run` una vez al inicio para conocer el estado base. Si ya hay tests rotos, repórtalo antes de tocar nada.
3. Si la sesión es solo lectura, preguntas o documentación, no ejecutes `init-full.mjs`.
4. Antes de declarar una tarea como `done`, ejecuta `node init-full.mjs`. Si falla, la tarea NO está terminada.
5. Si un script falla, lee solo las líneas `[FAIL]` y su detalle. No vuelvas a ejecutarlo sin haber cambiado algo.
2. Lee `progress/current.md` para entender en qué estado quedó la última sesión.
3. Lee `feature_list.json`. Toda feature nueva (`"sdd": true`) pasa por
   **Spec Driven Development con Openspec** — ver `docs/specs.md` y §4 de este archivo.
4. Lee `docs/specs.md` antes de tocar cualquier spec o feature `sdd: true`.
5. Revisa `git status --short` antes de editar. Preserva los cambios ajenos y no
   cambies el estado de una feature que no forma parte de la solicitud.


### Entorno y comandos

- Usa Node.js 22 o superior (Node.js 24 es la versión verificada en este entorno).
- Usa la versión de pnpm indicada en `package.json#packageManager` (actualmente 11.5.2).
- Instala dependencias con `pnpm install --frozen-lockfile` antes de la primera ejecución.
- `node init.mjs` comprueba el arnés, specs, secretos y tests unitarios; **no** ejecuta
  lint, typecheck, build ni E2E. Para cambios de código, consulta `docs/verification.md`.
- Si pnpm intenta reinstalar dependencias al ejecutar scripts y falla por ausencia
  de TTY, no autorices un borrado automático de `node_modules`. Si la instalación
  existente está disponible, puedes ejecutar la comprobación sin autoinstalación
  con una variable temporal en PowerShell:

  ```powershell
  $env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'
  node init.mjs
  Remove-Item Env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN
  ```

  Esto no repara ni verifica la instalación; los tests deben pasar igualmente.
  No persistas esta opción en la configuración del proyecto.

## 2. Mapa del repositorio

| Archivo / carpeta            | Qué contiene                                                                | Cuándo leerlo |
|------------------------------|-----------------------------------------------------------------------------|---------------|
| `README.md`                  | Instalación, configuración, comandos y estado funcional                    | Para incorporar colaboradores o cambiar el setup |
| `package.json`               | Versiones y scripts actuales                                               | Antes de documentar versiones o comandos |
| `docs/agentic-engineering-loop.md` | Metodología adaptativa para desarrollar con agentes de IA              | Para definir o revisar el proceso de trabajo con agentes |
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
| `src/**/*.test.*`, `src/__tests__/`, `tests/` | Tests automáticos (Vitest unit + Playwright e2e)              | Para verificar |

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
- **No añadas residuos** antes de cerrar la sesión (ver §5). No limpies cambios ajenos.
- **Si no sabes algo, busca en `docs/`** antes de inventarlo.

### Convenciones técnicas globales

- **Stack**: Next.js 16 App Router + React 19 + TypeScript 6 + Supabase + pnpm.
  Versiones exactas en `package.json`; dependencias resueltas en `pnpm-lock.yaml`.
  Las referencias históricas a versiones en specs no sustituyen estos archivos.
- **Sesión y rutas protegidas**: entrada en `src/proxy.ts`, con lógica de sesión
  en `src/lib/supabase/middleware.ts`. La home `/` es pública; no documentarla
  como una ruta que siempre requiere autenticación.
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

El callback de autenticación (`src/app/auth/callback/route.ts`) usa
`createServerClient` con cookies escritas en la respuesta de redirección.
Conserva ese patrón: no lo reemplaces por el cliente genérico sin comprobar
que la respuesta devuelta conserva las cookies de sesión.

### Elegir la ruta de trabajo

- Para trabajo nuevo, identifica el tipo de solicitud, estima qué pasa si te
  equivocas y qué falta por saber. Elige la ruta según la
  [tabla de Agentic Engineering Loop](docs/agentic-engineering-loop.md#selección-de-ruta)
  y deja claro qué resultado se espera y cómo se comprobará.
- La ruta no sustituye los controles del repositorio. Para una feature no trivial
  (>1 sesión), **OpenSpec primero** (skill `openspec-propose`). Si es `sdd: true`,
  aplica §4; para cambios del arnés o de configuración, revisa primero las
  instrucciones y herramientas disponibles. Mantén las comprobaciones de
  [verificación](docs/verification.md) que correspondan.
- Durante la adopción, los cambios ya iniciados conservan sus specs, aprobaciones
  y estados. Sigue la regla de una sola feature a la vez; la ruta no habilita
  trabajo paralelo ni concede permisos adicionales.

Los nombres de rol del flujo SDD no garantizan que exista un subagente con ese
nombre. Si falta un rol o una herramienta obligatoria, informa del bloqueo;
no omitas la revisión ni la aprobación humana.

### Requisitos y decisiones de diseño

- `feature_list.json` es la referencia de alcance, aceptación y estado actual.
- Para SDD, los requisitos `R<n>` viven en `proposal.md`, las decisiones en
  `design.md` y la ejecución en `tasks.md`; consulta también
  `openspec/changes/archive/` para cambios archivados.
- Registra contexto, decisión, alternativas descartadas y consecuencias en el
  `design.md` correspondiente. Para decisiones transversales, actualiza
  `docs/architecture.md`. Un ADR corto es una opción, no una carpeta existente
  ni un reemplazo de la aprobación del spec.
- No dupliques requisitos o decisiones en README: enlaza su fuente y distingue
  lo implementado, lo propuesto y lo pendiente.

### Sync de mercado

- Providers: Yahoo Finance (precios + S&P 500 benchmark) y open.er-api.com (USD/COP). Sin API keys.
- Stooq y la resiliencia adicional forman parte del cambio
  `market-data-resilience-and-disclosure`, todavía `in_progress` según
  `feature_list.json`. No presentarlos como completados sin verificación.
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
2. Si acabaste la feature correspondiente y pasó su revisión: marca su
   `status: "done"` en `feature_list.json`. Una corrección documental no cierra
   automáticamente una feature en curso.
3. Mueve el resumen de tu sesión de `progress/current.md` al final de `progress/history.md`
   con formato: `<!-- SESIÓN: YYYY-MM-DD | Feature: <name> | Agente: <agent> | Resultado: <done|blocked|paused> -->`.
4. Si no quedan pendientes ni trabajo de otra sesión, deja `progress/current.md`
   con la plantilla. No borres contexto de trabajo ajeno o aún activo.
5. No dejes archivos temporales, ni `console.log` de debug, ni TODOs sin contexto.

## 6. Si te bloqueas

- Relee la sección relevante de `docs/`.
- Si la herramienta no hace lo que esperas, **no inventes un workaround**:
  documenta el bloqueo en `progress/current.md` y para la sesión.
- Si estás en fase SDD y el spec tiene contradicciones, marca la feature como
  `blocked` en `feature_list.json` e indica la razón en `progress/current.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
