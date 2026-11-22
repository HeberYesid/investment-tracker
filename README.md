# Investment Tracker

Mobile-first web application for tracking investments across eToro, XTB, Trii, and eTrading Bancolombia with USD as base currency.

## Enfoque del proyecto

La prioridad es que la app funcione primero como **herramienta personal y privada**: importar extractos de los brókeres que uso, revisar cada portafolio y conciliar el total en COP y USD. La dirección elegida es que los movimientos se procesen y se guarden en el dispositivo, con un respaldo cifrado que se pueda restaurar sin cuenta.

**Ese modo local todavía no está implementado.** El flujo actual usa Supabase para guardar operaciones y datos de la vista previa de las importaciones. Ejecutar la app en `localhost` no evita el envío si se configura un Supabase remoto.

Más adelante, la app puede convertirse en un producto público si el uso personal demuestra que resuelve bien el problema y otras personas con varios brókeres muestran interés sostenido. Por ahora no se priorizan el registro público ni la sincronización de portafolios entre dispositivos. Consulta la [investigación de demanda y alternativas](docs/investigacion-demanda-portafolios.md).

## Getting Started

Usa Node.js 22 o superior y pnpm 11.5.2 (`package.json`). Desde la raíz, instala las dependencias del lockfile:

```bash
pnpm install --frozen-lockfile
```

Para probar el inicio de sesión y guardar datos, completa la sección **Environment**, aplica las migraciones de `supabase/migrations/` en orden a tu proyecto Supabase y configura Auth según la sección **Authentication**. Luego inicia el servidor:

```bash
pnpm dev
```

Abre [http://127.0.0.1:3000](http://127.0.0.1:3000) si usas el `NEXT_PUBLIC_SITE_URL` del ejemplo. Mantén el mismo origen en el navegador, la variable y la configuración de Auth.

## Environment

Copy `.env.example` to `.env.local` and fill in the Supabase values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code or `NEXT_PUBLIC_` variables.

## Setup y entorno

- Copiar `.env.example` a `.env.local`. Variables requeridas: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (en dev `http://127.0.0.1:3000`).
- `NEXT_PUBLIC_SITE_URL` se usa en el magic link de Supabase Auth (`${SITE_URL}/auth/callback?next=...`).
- `ADMIN_CACHE_TOKEN` (server-only) autoriza a las Edge Functions a invalidar tags de Next cache vía `POST /api/v1/admin/cache/invalidate`. Generar con `openssl rand -hex 32`.
- Auth setup manual por proyecto (ver `.env.example` final): URL Configuration → Site URL = `NEXT_PUBLIC_SITE_URL`, Additional Redirect URLs = `${NEXT_PUBLIC_SITE_URL}/auth/callback`.
- Por cada DB, insertar en `public.sync_settings` (`EDGE_FUNCTION_BASE`, `SUPABASE_ANON_KEY`) — **no commitear valores reales**.

## Authentication

Phase 4 wires up Supabase Auth with magic-link sign-in. The flow is:

1. User visits `/login` and submits an email.
2. Supabase sends a magic link with a `redirectTo` pointing at `${NEXT_PUBLIC_SITE_URL}/auth/callback?next=...`.
3. The callback route exchanges the code for a session, sets the auth cookies, and redirects.
4. `src/proxy.ts` delega el control de sesión en `src/lib/supabase/middleware.ts`. La portada `/` es pública; las páginas protegidas redirigen a `/login` si no hay sesión y las API protegidas devuelven `401`.
5. On signup, a Postgres trigger creates a row in `public.profiles`, a default portfolio named `Mi portafolio`, and an `OWNER` row in `public.portfolio_members` for the new user.

To enable Auth in your Supabase project (one-time, manual):

1. **Authentication → Providers → Email**: leave enabled.
2. **Authentication → URL Configuration**:
   - Site URL: `${NEXT_PUBLIC_SITE_URL}`
   - Additional Redirect URLs: `${NEXT_PUBLIC_SITE_URL}/auth/callback`
3. **Authentication → Email Templates → Magic link**: customize the sender name if you want.
4. To drop any orphan portfolios left over from pre-auth MVP testing:
   ```sql
   delete from public.portfolios where user_id is null;
   ```

Application code never uses the service-role key for normal requests. It only exists for trusted server tasks (e.g. background jobs) and is exposed via `createServiceSupabaseClient()`. All Route Handlers and Server Components go through `createUserSupabaseClient()`, which is bound to the request cookies and therefore subject to RLS.

### Sharing a portfolio

Every authenticated user gets a default portfolio with the `OWNER` role on signup. Portfolio sharing lives at `/settings/members` (OWNER-only) and exposes three roles:

- **OWNER** — full access. Can manage members, change roles, and remove other OWNERs (but never the last one).
- **EDITOR** — can create, edit, import, and delete trades. Cannot manage members.
- **VIEWER** — read-only on dashboard, trades, and assets. The "Nueva operación" / "Importar" actions are hidden, and any direct write to the API returns `403 FORBIDDEN` with `errors.writeAccessDenied`.

The UI calls `getCurrentPortfolio()` server-side; the role is then passed to client components as `canWrite`. Server-side pages and Route Handlers re-check the role independently — the client-side hiding is convenience, not security.

## Scripts

```bash
pnpm dev
pnpm lint
pnpm test:run
pnpm test:e2e
pnpm build
```

Al iniciar una sesión de trabajo, ejecuta `node init-quick.mjs` para revisar el entorno, los archivos base y las especificaciones requeridas. Antes de cerrar una feature, `node init-full.mjs` añade el escaneo de secretos y los tests unitarios. Consulta la [guía de verificación](docs/verification.md) para tipos, lint, build y pruebas de extremo a extremo.

## Mapa del código

- **Entrada y sesión:** [`src/app/`](src/app/) contiene las páginas, el callback de autenticación y las rutas HTTP. Empieza por la [portada](src/app/page.tsx) y sigue con la [resolución de sesión y portafolio](src/lib/supabase/auth.ts).
- **Importación:** la [vista de importación](src/features/imports/import-page-client.tsx) envía el extracto a la [ruta de previsualización](src/app/api/v1/imports/csv/preview/route.ts). Los [parsers por bróker](src/lib/csv/parsers/) normalizan las filas. Tras revisar observaciones y resolver referencias ambiguas, la persona confirma las filas seleccionadas en la [ruta de confirmación](src/app/api/v1/imports/csv/commit/route.ts) y puede consultar el historial.
- **Tablero:** el [cargador](src/lib/dashboard/loader.ts) obtiene operaciones y cotizaciones; los [cálculos](src/lib/calculations/) generan posiciones, valoración, evolución y rentabilidad; la [vista](src/features/dashboard/dashboard-view.tsx) presenta los resultados. Las [Edge Functions](supabase/functions/) actualizan precios y divisas sin cambiar las operaciones originales.

Consulta la [arquitectura](docs/architecture.md) para el flujo de datos y las [migraciones](supabase/migrations/) para el esquema y los permisos. Antes de aplicar migraciones o habilitar la sincronización, confirma el entorno de destino y las credenciales.

## Database

The foundation schema lives in `supabase/migrations/0001_foundation.sql`.

It creates the core investment tables, enables RLS on every public table, and seeds the four supported brokers:

- eToro, USD.
- XTB, USD.
- Trii, COP.
- eTrading Bancolombia, COP.

Additional migrations add auth (`0003_auth_and_permissions.sql`) and the market-data infrastructure (`0004_market_data_sync.sql`): the S&P 500 benchmark asset, the `market_sync_runs` table, the `enqueue_sync_run` function, and the `pg_cron` schedules that drive the Edge Functions.

The migration smoke test uses PGlite to apply the schema DDL in memory and validate public tables, RLS, broker seeds, and the market-data tables.

## Sincronización de precios y FX

Phase 5 wires up two free providers behind adapter interfaces:

- **Yahoo Finance** (`https://query1.finance.yahoo.com/v8/finance/chart/{symbol}`) for delayed quotes and the S&P 500 benchmark series. No API key. CORS-restricted, so the call lives inside a Supabase Edge Function.
- **open.er-api.com** (`https://open.er-api.com/v6/latest/USD`) for the USD/COP rate. No API key.
- **Stooq** es el respaldo de Yahoo para acciones y ETF en USD explícitamente mapeados. Si ambos proveedores fallan, se conserva la cotización anterior. No se restringieron las fuentes históricas de `market_prices`.
- `GET /api/v1/market-data/sync-status` requiere sesión y devuelve fechas de corrida, motivo y contador agregado para las posiciones abiertas del portafolio activo. El aviso del dashboard usa esos datos cuando están disponibles; no muestra errores crudos.

The providers sit behind `src/lib/market-data/{yahoo,open-er-api,config,types}.ts` and the dashboard / trade form read from the cached `market_prices` and `fx_rates` tables — they never call the providers on the read path. The benchmark chart overlays a normalized S&P 500 series on the portfolio evolution chart, and the trade form pre-fills `fx_rate_to_usd` with the latest USD→COP rate when the user picks COP.

### Cadence

- **Market prices** (`sync-prices-30m`): every 30 minutes via `pg_cron`.
- **FX rates** (`sync-fx-rates-daily`): daily at 06:00 UTC via `pg_cron`.

### Monthly cost estimate

With the 30-minute cadence and a single global batch, the Edge Functions run ~1,500 times/month for prices and once/day for FX. Add a small buffer for the on-demand admin trigger and we land around **~43,000 invocations / month**, well under the Supabase Free limit of 500,000. No external paid service is involved.

### Disabling the crons

To pause automated syncs (e.g. during maintenance), unschedule the jobs from `psql`:

```sql
select cron.unschedule('sync-prices-30m');
select cron.unschedule('sync-fx-rates-daily');
```

The functions and tables stay in place — they are inert without the crons. The `Sincronizar ahora` button in `BenchmarkChart` (dev-only, gated by `NODE_ENV !== 'production'`) still triggers a one-off run via `POST /api/v1/admin/sync/run`.

### Fallback if `pg_cron` is not enabled

On Supabase Free, `pg_cron` is available out of the box. If you ever run on a project without it, deploy a GitHub Actions workflow on a schedule that calls the Edge Function URL with the service-role bearer. The schedule can match the same cadence; the only thing that changes is the trigger.

### Required sync settings (per environment)

The `enqueue_sync_run` function reads the Edge Function base URL and the anon (publishable) key from `public.sync_settings`. Insert both rows once per database (do **not** commit real values):

```sql
insert into public.sync_settings (key, value) values
  ('EDGE_FUNCTION_BASE', 'https://<project-ref>.supabase.co'),
  ('SUPABASE_ANON_KEY', '<anon/publishable key from Supabase dashboard>');
```

Replace `<project-ref>` with your Supabase project reference and `<anon/publishable key>` with the project's anon key (the same value as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Supabase Edge Functions require a Bearer JWT in the `Authorization` header; the anon key is safe to store here because it is already public. The service role key is never stored in the database — Supabase injects it into the Edge Functions automatically via `SUPABASE_SERVICE_ROLE_KEY`.

## Cost Guardrails

The project is designed to run at USD 0 monthly operating cost for MVP and early usage.

- Use Vercel Hobby for hosting.
- Use Supabase Free for Postgres, Auth, Storage, and Edge Functions.
- Keep CSV processing in memory and do not store original CSV files by default.
- Keep external providers behind adapters so paid replacements are optional.
- Use delayed/free market data only in V2.
- Use client-side exports for PDF and Excel in V3.
- Avoid paid cron, queue, analytics, email, and notification services.

## Phase Status

- Phase 0: foundation complete.
- Phase 1: trades MVP complete.
- Phase 2: CSV import MVP complete.
- Phase 3: dashboard MVP complete.
- Phase 4: auth and permissions complete (OWNER-only; members UI deferred to 4.1).
- Phase 4.1: member management + role-aware UI complete (`/settings/members`, VIEWER read-only banner, API `403 FORBIDDEN` envelope).
- Phase 5: market data and FX complete.
- Phase 6: alerts and monthly summary pending.
- Phase 7: PWA, exports, crypto, and bilingual support pending.

## Notes

- ESLint requiere `@eslint/eslintrc` resuelto por pnpm store; si rompe tras cambios de deps, correr `pnpm install` antes de `pnpm lint`.
