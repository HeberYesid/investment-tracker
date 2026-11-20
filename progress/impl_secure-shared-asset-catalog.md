# Implementación: secure-shared-asset-catalog

- **Inicio:** 2026-11-19
- **Spec:** `openspec/changes/secure-shared-asset-catalog/`
- **Alcance de este tramo:** SQL de `0015` y pruebas defensivas con datos sintéticos. El coordinador integra el worker y ejecuta PostgreSQL nativo.

## Bitácora

- Base: `node init.mjs` verde (656/656, 69 archivos). OpenSpec `spec-driven`, 0/13 al inicio; aprobación D6/R14 registrada. `0015` libre. Se verificaron consumidores de compra, CSV, backfill, dashboard, benchmark, cotizaciones e historial; este tramo conserva el `SELECT` del worker. No se ejecuta ni se modifica `0012`.
- **1.1 (D1):** rojo 3/3 sin la migración; verde 3/3 tras agregar el cierre transaccional de ACL/RLS. Se observaron lectura, benchmark, FK, permisos de runtime fuera de `assets`, reaplicación con políticas equivalentes y revocación de grants directos, rechazo de herencia/SET y roles internos no aptos.
- **1.2 (D2):** rojo 3 casos con `42883`; verde 6/6 total. La RPC valida la membresía mediante `FOR SHARE`, agrupa la comprobación CSV y distingue `42501` (no autorizado) de `22023` (contrato inválido). Las dos ayudas privilegiadas quedan en esquema privado e invocables solo por el rol de alta.
- **1.3 (D3):** rojo 3 casos de identidad con el resolver D2; verde 9/9 total. Lecturas de candidatos agrupadas, normalización ASCII sin modificar el legado, conflicto por identidad no sobrescribe, las altas se ordenan por clave canónica. Se conserva el orden de entrada en la respuesta.
- **1.4:** fixture nativa de dos conexiones escrita; `node --check` verde. Pendiente de ejecutarla en un clúster nuevo por el coordinador; no se acredita concurrencia con PGlite.
- **1.5 SQL (D6):** rojo por columna ausente; verde 10/10 total. La marca es `true` únicamente en el alta RPC y el legado/seeds conservan `false`; el cliente no puede dictar la marca. Pendiente evidencia del worker a cargo del coordinador.
- **2.1 (D5):** rojo 2 casos por RPC ausente (`42883`); verde 12/12 total. La actualización filtra por identidad almacenada exacta (incluyendo `yahoo_symbol` nulo), no cambia valores informados y devuelve `updated`, `no_change` o `identity_changed`. ACL: solo `asset_metadata_operator`; debe concederse el rol explícitamente a un login técnico autorizado de fixture. Falta ejecutar el caso nativo de concurrencia para cerrar 2.1.

## Trazabilidad de este tramo

| Requisito | Evidencia |
| --- | --- |
| R1 | `conserva lectura, benchmark y claves foráneas con o sin grants y políticas antiguas`; `requiere decisión explícita; conserva los UUID históricos y distingue ticker y mercados confirmados`. |
| R2 | `aborta y revierte sus cambios ante permisos heredados o asumibles no autorizados`; `rechaza un rol interno preexistente con atributos o membresías inesperados`; comprobaciones de RPC y columnas en pruebas R3, R10 y R14. |
| R3 | `permite OWNER/EDITOR vigentes y deniega VIEWER, ajeno, sin UID, revocado y roles de runtime`; `valida borrador y pertenencia, estado, ticker y unicidad de filas CSV antes de altas`. Carreras de baja/degradación preparadas, no ejecutadas aquí. |
| R4 | `rechaza el lote entero si excede cupos o contiene campos, claves y tipos no admitidos`; verificación de valores mínimos en la prueba de R14. |
| R5 | `requiere decisión explícita…`; `no corrige ni elige duplicados normalizados, clases, monedas o mercados contradictorios`; `marca todas las propuestas incompatibles del mismo mercado sin afectar otros mercados del lote`. |
| R6 | Reutilización sin mutar en PGlite y fixture nativa `READ COMMITTED`, mercados distintos y `REPEATABLE READ`. La fixture sigue pendiente de ejecución por el coordinador. |
| R7 | `valida borrador y pertenencia, estado, ticker y unicidad de filas CSV antes de altas`; `marca todas las propuestas incompatibles…`. Solo se acredita la frontera SQL, no el batching HTTP. |
| R10–R11 | `reserva el relleno al operador y solo actualiza metadatos aún nulos de la identidad exacta`; `rechaza metadatos o identidad mal formados y no asigna símbolos a referencias nuevas`. La fixture nativa incluye `dos operadores solapados solo rellenan los campos que siguen nulos`, sin ejecutar en este tramo. |
| R12 | Códigos acotados en los casos de autorización, entrada, UUID incompatible, conflicto y metadatos; API y proveedor fuera de este tramo. |
| R14 | `solo marca altas RPC y conserva legado, seeds y acceso de lectura del worker`. Solo se acredita D6 en la base de datos. |

R8, R9 y R13 quedan fuera de este tramo. La proyección de lectura `list_asset_reference_candidates(text[])` la integra el coordinador, sin ampliar permisos del esquema privado.

## Verificación y pendientes

- **Verificadas en PGlite:** 1.1, 1.2 y 1.3. Dejé los checkboxes de OpenSpec al coordinador, ya que `tasks.md` está fuera del conjunto de archivos autorizado para este tramo.
- `pnpm test:run tests/secure-shared-asset-catalog.test.ts`: **12/12**; ESLint focalizado y `node --check tests/fixtures/asset-catalog-postgres.test.mjs`: **exit 0**.
- Smoke combinado con `src/__tests__/migrations/schema.test.ts`: **64/64**. `openspec validate secure-shared-asset-catalog --strict`: válido.
- `node init.mjs`: **667 aprobadas, 2 fallidas** en la primera comprobación integrada, ambas en `src/features/trades/trade-form.test.tsx` (decisión obligatoria en alta y segundo argumento de edición). `pnpm exec tsc --noEmit` falló en `tests/asset-reference-resolution.test.ts:24` y `tests/csv-asset-reference-batches.test.ts:12`. Se informó al coordinador; no se tocaron archivos de integración, ni se ejecutó build/E2E en este tramo.
- Para comprobar **1.4 y 2.1**: `node --test tests/fixtures/asset-catalog-postgres.test.mjs` con `ASSET_CATALOG_PG_MODULE`, `ASSET_CATALOG_PG_PWFILE` y `ASSET_CATALOG_PG_PORT` explícitos. La fixture solo acepta `127.0.0.1`, `fixture_admin`, base nueva `asset_catalog_fixture`, puerto distinto del de membresías y clúster sin roles de API preexistentes. Usa dos conexiones y comprueba espera con `pg_blocking_pids`. No ejecutar `0012`.
- **1.5** sigue pendiente del worker; no se ejecutó PostgreSQL nativo, Docker, WSL ni un entorno remoto en este tramo.

## Integración de aplicación y verificación nativa

- **R1–R7, R10–R11, R14:** PostgreSQL **18.6** nativo pasó **8/8** con dos PID y esperas confirmadas. Comprobó colisión de altas compatibles e incompatibles, mercados separados, `REPEATABLE READ` con reintento en una transacción nueva, revocación y altas solapadas y relleno condicional de metadatos. La última prueba ejecutó el comando con un login técnico real, proveedor sintético loopback, plan sin I/O de perfiles y un relleno que conserva valores existentes. El clúster y la credencial de esa prueba se descartaron. PGlite cubre además ACL efectivas y políticas históricas simuladas.
- **R5/R7:** `tests/csv-asset-reference-batches.test.ts` comprueba identidad por mercado, lote de 500 IDs, repetición y conflictos incompatibles. `tests/secure-shared-asset-catalog.test.ts` cubre candidatos normalizados y truncación explícita; XTB conserva el símbolo original como evidencia de agrupación sin inferir mercado. Solo se comparte una decisión tras confirmación de grupo, con alternativa por fila.
- **R3–R5/R8–R9/R12:** `src/__tests__/api/trades.test.ts`, `src/__tests__/imports/csv-commit.test.ts`, `tests/asset-reference-resolution.test.ts`: compra `201`, error `422`, denegación `403` y `500` saneado, correlación exacta, reintento solo de resolución tras rollback, lotes de hasta 500 y confirmación parcial con `errors: string[]`; sin DML de catálogo directo desde los handlers.
- **R9–R12:** `tests/fixtures/asset-metadata-command.test.mjs` 5/5: plan, manifiesto/acceso, actualización parcial permitida, perfiles insuficientes o incompatibles y transporte HTTP de loopback sin redirección, incluido 429/timeout. `src/components/charts/distribution-chart.test.tsx` prueba lectura por dimensión y ausencia de acción de enriquecimiento.
- **R14:** `tests/sync-worker-boundaries.test.ts` y `tests/asset-prices-history.test.ts`: 21/21. Se observó rojo para el fallback incorrecto y verde tras excluir la referencia nueva antes de IO. Se conservan ticker de legado, histórico autorizado y benchmark. Deno 2.8.3 verificó `sync-prices` con lock congelado.
- **R1/R3–R5/R7–R9/R12–R13:** `tests/fixtures/portfolio-memberships-browser.test.mjs`: primer pase 4/4 en Chrome/CDP contra Next compilado. Incluye alta de referencia en compra como EDITOR, reutilización OWNER, CSV mixto 2/3 y estado `COMMITTED`, denegación de VIEWER y `409` obsoleto sin llamar al resolver, dimensiones de distribución y benchmark. Auth/PostgREST son dobles; no verifican JWT/RLS. Reproducción en `tests/fixtures/shared-asset-catalog.md`.
- **Verificación final del cambio:** `node init.mjs` (incluye `pnpm test:run`) 661/661, SQL/esquema 65/65, build y typecheck correctos, ESLint 0 errores y 4 avisos preexistentes. Tras una espera fallida de envío en Chrome, la fixture espera el control de referencia antes de completar los campos; pasó 4/4 en dos ejecuciones consecutivas, con aserción CDP de cero tráfico de enriquecimiento o externo en el recorrido. E2E pública en Chrome: 14/14 entre móvil y escritorio (Next mantuvo su diagnóstico conocido de prerender en `/login`). No se comprobó el gateway desplegado. SHA-256 de `0012` sin cambios.

## Correcciones tras la primera revisión

- **R10:** `scripts/enrich-asset-metadata.mjs` exige un login dedicado que solo tenga la membresía técnica `asset_metadata_operator`, sin opción de administrarla ni permisos directos de catálogo. El chequeo de membresía contempla roles adicionales aunque sean solo heredables o solo asignables mediante `SET ROLE`. La fixture nativa comprueba que se rechazan antes del primer contacto con el proveedor y que un login válido sigue funcionando.
- **R11/R12:** el adaptador descarta `quoteSummary.error` no nulo aunque llegue HTTP 200 con un perfil compatible. `tests/fixtures/asset-metadata-command.test.mjs` pasó 5/5; la prueba del comando en PostgreSQL verifica `provider_error` saneado y `country` sin cambios antes de aceptar una respuesta sin error. Suite nativa: 8/8.
- **R5/R7:** en el asistente CSV, `undefined` indica usar el grupo si está confirmado, `null` representa una decisión individual en curso y solo un objeto completo viaja al commit. El aviso de fila incompleta es visible y anunciable; volver explícitamente al grupo restaura la herencia. Chrome/CDP con XLSX sintético de XTB verificó dos filas guardadas con el UUID confirmado y que la fila incompleta no estaba en el cuerpo ni se insertó: 5/5 en total. Build correcto; ESLint 0 errores y 4 avisos preexistentes. No hubo cambios de migración, sync ni destinos remotos.
