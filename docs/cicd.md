# CI/CD: pruebas críticas y recuperación

La CI separa `Lint · TypeCheck · Vitest` del job que construye y prueba con Supabase local. El check agregado (`Lint · TypeCheck · Test · Build`, conserva el nombre anterior) solo pasa si ambos terminan con éxito. Esto no configura por sí solo que GitHub lo exija antes del merge.

**Estado:** durante la verificación local, el arranque desde cero se detuvo en la migración `0015_secure_shared_asset_catalog.sql` con `42501`, al transferir una función al rol propietario interno. El runner falla explícitamente; no se ha verificado la suite E2E ni debe adoptarse el check como obligatorio hasta recuperar el arranque y demostrarlo en GitHub.

## Repetir el piloto en un checkout limpio

Con Node 24, el pnpm de `package.json`, Docker accesible y los puertos 3100, 55420–55422 y 55424 libres:

```powershell
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
npm exec --yes --package=supabase@3.2.0 -- node scripts/ci-e2e/run.mjs
```

En Linux, usar `pnpm exec playwright install --with-deps chromium` para instalar las bibliotecas de runtime. No usar un checkout con `.env` local o de producción. El runner toma solo las migraciones versionadas, crea un proyecto de Supabase de nombre único, aplica el seed de demo, sirve `next start` y elimina únicamente su proyecto al salir. El email nunca sale de Mailpit. El runner falla si falta una prueba obligatoria o alguna se omite. Los logs no deben publicar cookies, credenciales, correos con enlaces o trazas autenticadas.

| Verificación | Caso |
|---|---|
| R1–R2 | Build de producción y stack local; `/` muestra demo, `/trades` pide sesión, API privada devuelve `401`. |
| R3–R4 | Login real, carga de CSV Trii, compra por COP 80 000 con TRM 4 000, persistencia de una operación y USD 20 invertidos; la reconfirmación secuencial del mismo ID devuelve `409` sin cambios. |
| R5 | El check agregado exige ambos jobs y el runner exige las cinco pruebas del piloto sin skips; falta la demostración en GitHub hasta que se autorice. |

## Ensayo de entrega (no automático)

1. Autorizar por separado el entorno de prueba, cuenta, rama y operación. Revisar que la previsualización utiliza únicamente datos aislados; no activar una ruta de despliegue que adelante o ignore la CI. Mantener USD 0 al mes.
2. Registrar SHA e ID del último candidato sano y del nuevo. Si el proveedor promueve el artefacto probado, conservarlo; si vuelve a construir, comprobar que corresponde al SHA aprobado y repetir el smoke sobre ese resultado.
3. Probar que la demo pública carga y la ruta privada solicita sesión. Restaurar la revisión sana y repetir el smoke, registrando revisión, resultado y tiempo de recuperación. Para cambios de esquema, verificar compatibilidad con el código anterior; un rollback de código no revierte datos. No realizar un ensayo o despliegue en producción como sustituto.
