# Investment Tracker

Aplicación para inversores particulares que quieren reunir operaciones de varios brókeres y medir posiciones y evolución en USD. Combina movimientos anotados manualmente o importados con precios de mercado y tipos de cambio. No es un sistema que ejecute operaciones en los brókeres.

## Arquitectura y componentes

- [`src/app/`](src/app/) es el punto de entrada de Next.js: páginas, callback de autenticación y controladores HTTP. [`src/proxy.ts`](src/proxy.ts) es la entrada vigente del proxy y delega el control de sesión en `src/lib/supabase/middleware.ts`. La portada [`page.tsx`](src/app/page.tsx) distingue la experiencia pública de los datos sujetos a sesión y portafolio.
- [`src/features/`](src/features/) organiza la interacción. [`src/lib/supabase/auth.ts`](src/lib/supabase/auth.ts) resuelve autenticación y contexto del portafolio. Supabase guarda operaciones, membresías, precios y datos de referencia; sus [migraciones](supabase/migrations/) son la evidencia del esquema y permisos declarados.
- [`src/lib/calculations/`](src/lib/calculations/) contiene cálculos de posiciones, valoración, evolución y rentabilidad. [`src/lib/dashboard/loader.ts`](src/lib/dashboard/loader.ts) carga movimientos y precios; las [Edge Functions](supabase/functions/) separan la captura de precios y divisas del renderizado del tablero.

## Flujos

**Importar un extracto:** [`import-page-client.tsx`](src/features/imports/import-page-client.tsx) envía el CSV a [previsualización](src/app/api/v1/imports/csv/preview/route.ts). Los [parsers](src/lib/csv/parsers/) normalizan las filas por bróker. La persona revisa observaciones y resuelve referencias ambiguas antes de confirmar. El [controlador de confirmación](src/app/api/v1/imports/csv/commit/route.ts) procesa las filas seleccionadas para el portafolio; la pantalla vuelve a mostrar el historial del proceso.

**Consultar el tablero:** el cargador obtiene movimientos y cotizaciones; los cálculos forman posiciones y series; [`dashboard-view.tsx`](src/features/dashboard/dashboard-view.tsx) presenta el resultado. La sincronización de precios y FX puede actualizar esos datos sin cambiar las operaciones originales.

## Arranque y lectura

Usa el gestor indicado en [`package.json`](package.json), instala dependencias con `pnpm install` y arranca con `pnpm dev`. El [README](README.md) separa Supabase Auth y sus redirecciones, configuración de `.env.local`, base de datos y sincronización opcional. Mantén `SUPABASE_SERVICE_ROLE_KEY` y `ADMIN_CACHE_TOKEN` solo en servidor. Antes de aplicar migraciones o habilitar sincronización confirma destino y credenciales; no se inspeccionaron valores reales ni se atribuyó un despliegue.

Orden de lectura: `src/app/page.tsx` → `src/lib/supabase/auth.ts` → `src/lib/dashboard/loader.ts` → `src/lib/calculations/`; para importación, sigue la vista y los dos controladores anteriores. Para la otra copia local, consulta [Investment Tracker — entrega](../investment-tracker-entrega/GUIA-PROYECTO.md).
