# Verificación local de membresías

Todos los datos, cuentas y cookies de estas pruebas son sintéticos. No apuntar a un Supabase real ni a una base con datos de aplicación.

## PostgreSQL nativo

`portfolio-memberships-postgres.test.mjs` necesita un clúster descartable en `127.0.0.1`, base `postgres`, rol administrador de fixture `fixture_admin` y dos conexiones físicas. Se usó PostgreSQL 18.6 nativo en Windows, inicializado con SCRAM y sin servicio del sistema; no requiere Docker ni WSL. El puerto por defecto es `45218`. Antes de ejecutar, preparar únicamente en el clúster vacío:

```sql
create role anon;
create role authenticated;
create role service_role bypassrls;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create schema auth;
create schema extensions;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable
as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
```

Aplicar en orden `0001_foundation.sql`, `0003_auth_and_permissions.sql` y `0009_role_aware_trades_imports_rls.sql`. El script aplica `0014` en ese clúster y crea cuentas sintéticas por escenario. Usa `MEMBERSHIP_PG_MODULE` con la ruta local al módulo `pg` instalado fuera del repositorio (se probó `8.23.1`), y `MEMBERSHIP_PG_PWFILE` con la ruta al archivo temporal que contiene la credencial del clúster. `MEMBERSHIP_PG_PORT` es opcional. No se necesita ajustar las dependencias del proyecto.

```powershell
node --test tests/fixtures/portfolio-memberships-postgres.test.mjs
```

La prueba confirma dos PID distintos y observa el bloqueo con `pg_blocking_pids` antes de liberar el primer cambio. El esquema `auth` y los roles son dobles; motor, FK, ACL, transacciones y locks son PostgreSQL reales. Al terminar, detener y descartar el clúster y su credencial.

## Chrome y Next compilado

Compilar y ejecutar con valores de fixture, no con el destino de `.env.local`. El test arranca y detiene Next y el doble de Auth/PostgREST en loopback; necesita libres los puertos `45219` y `45220`. No reutiliza el perfil habitual de Chrome.

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:45219'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'synthetic-publishable'
$env:SUPABASE_SERVICE_ROLE_KEY = 'synthetic-demo'
$env:MEMBERSHIP_CHROME_PATH = "$env:LOCALAPPDATA/Google/Chrome/Application/chrome.exe"
pnpm build
node --test tests/fixtures/portfolio-memberships-browser.test.mjs
```

Si `MEMBERSHIP_CHROME_PATH` no está definida, Playwright intenta usar su canal `chrome`. Las pruebas combinan navegación, peticiones HTTP y una sesión del protocolo Chrome DevTools (CDP), con contextos aislados. El doble HTTP no valida firmas JWT, no ejecuta RLS y no reemplaza la prueba nativa de SQL. No usar esta fixture para verificar Supabase desplegado, login con correo ni sincronización de mercado.

La prueba de dos carteras compara importes y activos de las seis respuestas privadas de dashboard y los totales visibles de `/` y `/avanzado` antes y después del cambio. Envía una compra desde una pestaña anterior y otra desde la vigente; el primer envío devuelve `409` sin cambios. Los formularios de previsualización y confirmación CSV envían el contexto vigente; se verifican el destino de la operación y la auditoría, el estado del padre, la baja de un borrador y el reinicio del asistente al cambiar de cartera. La eliminación de filas hijas en este caso la simula el doble HTTP.
