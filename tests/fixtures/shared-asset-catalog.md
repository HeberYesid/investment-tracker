# Verificación local del catálogo compartido

Usar solo datos sintéticos en loopback. No se aplica `0012_assets_write_policy.sql`, ni se usan Docker, WSL, enrutamiento de red, servicios remotos o credenciales de la aplicación.

## SQL y cotizaciones

```powershell
pnpm test:run tests/secure-shared-asset-catalog.test.ts src/__tests__/migrations/schema.test.ts
pnpm test:run tests/asset-catalog-quote-workers.test.ts src/lib/dashboard/asset-prices-history.test.ts
```

La primera suite simula las políticas históricas y grants sin ejecutar `0012`. La segunda ejecuta handlers con proveedor y PostgREST dobles, comprobando llamadas y escrituras por UUID; no prueba cron/Vault/gateway. El worker de precios requiere la columna de `0015` al arrancar con el nuevo código; si se activa posteriormente, coordinar esquema, worker y aplicación para no habilitar las altas antes del guard. Esta prueba no autoriza la activación.

Para transacciones reales, inicializar un clúster PostgreSQL nuevo como `fixture_admin`, con SCRAM, solo en `127.0.0.1` y en un puerto temporal distinto de `45218`, con una base vacía `asset_catalog_fixture`. Proporcionar `ASSET_CATALOG_PG_PORT`, `ASSET_CATALOG_PG_MODULE` (ruta absoluta al módulo `pg` local, fuera de la app) y `ASSET_CATALOG_PG_PWFILE` (archivo temporal con la credencial sintética). Ejecutar:

```powershell
node --test tests/fixtures/asset-catalog-postgres.test.mjs
node --test tests/fixtures/asset-metadata-command.test.mjs
```

La primera prueba aplica su lista explícita de migraciones al clúster vacío, comprueba PID distintos y observa esperas con `pg_blocking_pids`. Comprueba altas rivales, revocación y metadatos concurrentes, y ejecuta el comando local con un login autorizado y un perfil sintético. Detener y descartar el clúster y sus credenciales al finalizar.

## Comando interno de metadatos

Requiere `ASSET_METADATA_PG_HOST` (`127.0.0.1` o `::1`), `ASSET_METADATA_PG_PORT`, `ASSET_METADATA_PG_DATABASE`, `ASSET_METADATA_PG_USER`, `ASSET_METADATA_PG_PASSWORD` y `ASSET_METADATA_PG_MODULE`. El login de prueba hereda únicamente `asset_metadata_operator`, sin opción de administrar esa membresía, DML directo, privilegios globales ni identidad web. El comando comprueba este límite antes de leer perfiles. Pasar los valores al proceso local; no agregar secretos a archivos del proyecto. No lee `.env.local`.

El manifiesto JSON es un arreglo de 1–50 objetos con `id` (UUID), `ticker`, `exchange`, `currency`, `asset_type` y `symbol` comprobado. El plan no llama al proveedor ni escribe. `--apply` requiere `ASSET_METADATA_PROFILE_ORIGIN` con `http://127.0.0.1:<puerto>` o el equivalente IPv6 de loopback. El doble expone `GET /profiles?symbol=...`, con una respuesta `quoteSummary.result[0].price` y metadatos `summaryProfile`; no debe reenviar tráfico a un proveedor real.

```powershell
node scripts/enrich-asset-metadata.mjs --manifest <archivo-local>
node scripts/enrich-asset-metadata.mjs --manifest <archivo-local> --apply
```

El código de salida es `0` si todo se planificó/aplicó o no requería cambios, `2` si hubo entradas omitidas por fallo, y `1` si no se pudo iniciar o completar la operación. El comando no asigna `yahoo_symbol`.

## Chrome

Seguir la sección **Chrome y Next compilado** de `tests/fixtures/portfolio-memberships.md`. La misma fixture cubre alta manual como EDITOR, reutilización como OWNER, confirmación CSV parcial, contexto desactualizado, distribución y benchmark. El caso XTB usa un XLSX sintético y comprueba mediante CDP que la fila con elección incompleta no se envía con la referencia del grupo; volver explícitamente a esa referencia sí la restaura. El doble HTTP no valida JWT ni ejecuta RLS; esas comprobaciones no se atribuyen a Chrome.
