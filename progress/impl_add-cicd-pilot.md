# Implementación: add-cicd-pilot

## Trazabilidad

- R1: `scripts/ci-e2e/run.mjs --prepare-only` verifica el historial de migraciones, los propietarios de las funciones del catálogo, el seed, Auth, Mailpit y el cierre del stack. El runner completo construye el candidato y arranca Playwright contra `next start`.
- R2: `tests/e2e/home.spec.ts` verifica la demo pública, la redirección de `/trades` y el `401` de la API, además del formulario de login.
- R3–R4: `tests/e2e/csv-import.spec.ts` verifica login con Mailpit, importación Trii, una operación y USD 20 invertidos, y reconfirmación `409` sin cambios en importe, conteo ni ID.
- R5: `scripts/ci-e2e/verify-report.test.mjs` rechaza reportes con pruebas faltantes, omitidas, fallidas o sustituidas. El check agregado requiere ambos jobs; el PR #3 demostró el bloqueo de merge y la vuelta a verde en la rama de prueba (evidencia abajo).
- R6: `docs/cicd.md` describe el ensayo; no se ha ejecutado en un destino remoto.

## Evidencia local

- CLI 3.2.0, Docker 29.9.3 sobre Windows. Rojo previo: `--prepare-only` abortó en `0015` con `42501`. Verde: usando un bloque alternativo (`CI_E2E_SUPABASE_PORT_BASE=56570`), el mismo comando verificó 13 migraciones versionadas y cerró su stack. `0016` del árbol de trabajo no forma parte de esas 13: todavía no está versionada. No se cambiaron migraciones ni permisos.
- Tipos sin errores, lint con cuatro avisos preexistentes y cuatro pruebas del verificador de reportes aprobadas. Dos precondiciones negativas (motor Docker remoto, puertos solapados con Next) devolvieron salida 1 sin arrancar el stack.
- El build de producción de `HEAD` con los cambios del piloto pasó (33 páginas). Chromium inicialmente dio 4/5: no llegaba a `/import` tras el enlace de Mailpit (línea 53). Se alineó el origen de Next, Auth y Playwright en `localhost`, como en la prueba previa de comisiones, preservando el API y el correo de loopback y la configuración normal fuera del piloto.
- Verde: 5/5 en Chromium, ninguna omitida, con build de producción y Auth, PostgreSQL, PostgREST y Mailpit reales. Stack `it-ci-cc9cd823-a02`, PID de la tarea 8644, inicio 17:17:28 UTC, cierre confirmado por el runner. Prueba roja controlada en la misma copia descartable, cambiando solo USD 20 por USD 21: PID de tarea 4236 (`sh_204447aab0013LBshDAAb4ve5i`).
- Rojo controlado: cuatro aprobadas, una fallida exactamente en la aserción de USD 21, ninguna omitida; el runner salió con 1 y cerró `it-ci-73ba057f-687` (inicio 17:18:47 UTC). Se restauró el archivo temporal. La aserción de importe del repo compara el decimal exacto como texto para admitir tanto la respuesta numérica versionada como el contrato decimal del trabajo local de comisiones, sin alterar la aplicación.
- Verde final con la aserción definitiva: build de 33 páginas y 5/5 en Chromium, sin omisiones. Stack `it-ci-b841414b-595` (inicio 17:19:35 UTC, PID de tarea 4468); quedaron cerrados los contenedores, sin listeners en 3100/56570/56571/56572/56574, y se eliminó la copia temporal. `node init.mjs` final: 746/746, sin omisiones. Una corrida concurrente con el build había fallado en dos pruebas de Avanzado; la repetición sin el build pasó sin cambiar esas pruebas.

## Evidencia en GitHub

- [PR borrador #2](https://github.com/HeberYesid/investment-tracker/pull/2), rama `test/ci-pilot`. El primer commit excluye solo esa rama de Vercel. Supabase Preview quedó omitido y no se observaron despliegues de la rama. No se tocaron reglas de `main`.
- [Rojo, `80bf250`](https://github.com/HeberYesid/investment-tracker/actions/runs/45068952912): lint, tipos y Vitest verdes; build y 13 migraciones completados. Chromium aprobó cuatro pruebas y falló en `csv-import.spec.ts:96`, la expectativa deliberada de USD 21. El check agregado falló.
- [Verde, `48764e4`](https://github.com/HeberYesid/investment-tracker/actions/runs/45069227357): cambia solo USD 21 por USD 20. Las cinco pruebas obligatorias pasaron sin omisiones y el check agregado quedó verde. GitHub no registra despliegues para `test/ci-pilot`.
- El PR #2 demostró el fallo del check, no el bloqueo del merge: `main` no lo exige y no se cambiaron sus reglas. La prueba de aplicación de la regla se hizo aparte en el PR #3. La 3.3 sigue pendiente de un destino aislado autorizado.
- Con autorización, la regla `27858130` exige el check de GitHub Actions solo en `test/ci-pilot-base`, sin excepciones. El [PR #3](https://github.com/HeberYesid/investment-tracker/pull/3) no es borrador y no tiene conflictos. Con [`4be33a3`](https://github.com/HeberYesid/investment-tracker/actions/runs/45070000161), Playwright falló únicamente donde esperaba USD 21; el check obligatorio terminó en fallo y GitHub devolvió `mergeStateStatus: BLOCKED`. `18764ce` restaura USD 20 y se publicó sin fusionar.
- Con [`18764ce`](https://github.com/HeberYesid/investment-tracker/actions/runs/45070258763) pasaron las cinco pruebas obligatorias sin omisiones y GitHub devolvió `CLEAN`. El PR permanece abierto sin fusionar. Supabase Preview quedó omitido; GitHub reportó cero despliegues en ambas ramas. `main` conserva `f73e668` y no tiene reglas nuevas. Tarea 3.2 verificada.

## Para retomar

- OpenSpec: 7/8. [Procedimiento de recuperación](../docs/cicd.md#ensayo-de-entrega-no-automático) documentado. El usuario decidió aplazar el ensayo porque solo dispone de la app de uso real. No se crearon recursos ni se hizo un despliegue para el ensayo; la tarea 3.3 sigue abierta y R6 no está verificado.
- Siguiente acción, con autorización específica: confirmar proyecto de prueba, cuenta o sesión, dos revisiones y operaciones permitidas; verificar backend aislado, datos sintéticos y costo cero. Activar A, activar B y restaurar A en el mismo destino. Registrar IDs/SHA, smoke y tiempo de recuperación. El permiso del PR #3 no cubre este ensayo.
- Después de obtener evidencia de R6, completar la revisión independiente y pasar `node init-full.mjs` antes de marcar la feature como `done`.
