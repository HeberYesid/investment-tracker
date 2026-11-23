# CI/CD: pruebas críticas y recuperación

La CI separa `Lint · TypeCheck · Vitest` del job que construye y prueba con Supabase local. El check agregado (`Lint · TypeCheck · Test · Build`, conserva el nombre anterior) solo pasa si ambos terminan con éxito. Esto no configura por sí solo que GitHub lo exija antes del merge.

**Estado:** el piloto pasó las cinco pruebas obligatorias contra el build de producción. El [PR #3](https://github.com/HeberYesid/investment-tracker/pull/3) demostró que el check bloquea el merge cuando es obligatorio: pasó de `BLOCKED` con una aserción rota a `CLEAN` después de corregirla. La regla se probó solo en `test/ci-pilot-base`; no se cambió `main` ni se fusionó el PR. Sigue pendiente el ensayo de recuperación en un destino aislado autorizado. Consulta la [bitácora del piloto](../progress/impl_add-cicd-pilot.md) para ver las ejecuciones y sus SHA.

## Repetir el piloto en un checkout limpio

Con Node 24, el pnpm de `package.json`, Docker accesible y los puertos 3100, 55420–55422 y 55424 libres:

```powershell
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
npm exec --yes --package=supabase@3.2.0 -- node scripts/ci-e2e/run.mjs
```

En Linux, usar `pnpm exec playwright install --with-deps chromium` para instalar las bibliotecas de runtime. No usar un checkout con `.env` local o de producción. El runner toma solo las migraciones versionadas, crea un proyecto de Supabase de nombre único, aplica el seed de demo, sirve `next start` y elimina únicamente su proyecto al salir. El email nunca sale de Mailpit. El runner falla si falta una prueba obligatoria o alguna se omite. Los logs no deben publicar cookies, credenciales, correos con enlaces o trazas autenticadas.

Para comprobar solo el arranque y cierre, ejecutar `node scripts/ci-e2e/run.mjs --prepare-only` con Supabase CLI 3.2.0 disponible en `PATH`. Si otro stack ocupa los puertos de Supabase, asignar `CI_E2E_SUPABASE_PORT_BASE` a un bloque libre: base para shadow, base + 1 para API, + 2 para PostgreSQL y + 4 para Mailpit. El navegador y el callback de Auth usan `http://localhost:3100` para compartir las cookies del inicio de sesión.

El CLI aplica las migraciones anteriores a `0015`. Para esa única migración, el runner ejecuta el SQL versionado con `supabase_admin` por el socket PostgreSQL del contenedor descartable: el ejecutor ordinario no puede transferir las funciones a sus roles propietarios. Comprueba ambos propietarios antes de registrar `0015` en el historial local. Después aplica las migraciones restantes con el CLI, verifica el historial completo y solo entonces siembra y recarga PostgREST. No se modifican los SQL ni los permisos del catálogo, y no se conecta a un proyecto remoto.

| Verificación | Caso |
|---|---|
| R1–R2 | Build de producción y stack local; `/` muestra demo, `/trades` pide sesión, API privada devuelve `401`. |
| R3–R4 | Login real, carga de CSV Trii, compra por COP 80 000 con TRM 4 000, persistencia de una operación y USD 20 invertidos; la reconfirmación secuencial del mismo ID devuelve `409` sin cambios. |
| R5 | El check agregado exige ambos jobs y el runner exige las cinco pruebas sin omisiones. El PR #3 verificó el bloqueo y la vuelta a verde en la rama de prueba. |

## Ensayo de entrega (no automático)

**Aplazado:** el procedimiento queda listo para cuando haya un destino de prueba autorizado. No se ha verificado la recuperación y no se usará la app real para ensayarla.

1. Autorizar el proyecto de prueba, la cuenta o sesión, las revisiones y las operaciones de despliegue y restauración. Confirmar que el destino usa un backend aislado con datos sintéticos, no comparte secretos ni dominios de producción y permite recuperar una revisión sin costo adicional. Si no se puede confirmar el aislamiento o mantener USD 0 al mes, detener el ensayo. No activar un despliegue que adelante o ignore la CI.
2. Activar la revisión sana A y luego la candidata B, ambas con CI verde. Registrar el SHA y el ID de despliegue de cada una y comprobar que coinciden con la revisión activa del destino. Si el proveedor vuelve a construir, comprobar el SHA del nuevo build y hacer el smoke sobre ese resultado. En cada revisión, usar el mismo punto de entrada de prueba y una sesión sin cookies de la aplicación: `/` debe mostrar el banner de demo y `/trades` debe redirigir a `/login`.
3. Restaurar A en ese mismo punto de entrada. Verificar en el proveedor que el ID y SHA activos vuelven a coincidir con los registrados para A y repetir ambas comprobaciones. Registrar en la bitácora el destino, los IDs/SHA de A y B, los resultados del smoke y el tiempo desde el inicio de la restauración hasta confirmar revisión y smoke. Abrir solo una URL histórica no demuestra que A haya vuelto a quedar activa.

La restauración de código no revierte datos. Usar revisiones compatibles con el mismo esquema de prueba y no cambiar políticas de datos. No usar producción como sustituto.
