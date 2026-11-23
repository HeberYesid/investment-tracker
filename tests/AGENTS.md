# tests

Sigue el [AGENTS.md raíz](../AGENTS.md), las [convenciones de pruebas](../docs/conventions.md#tests) y la [guía de verificación](../docs/verification.md).

## Vitest

- `src/__tests__/` es el directorio principal. [`vitest.config.ts`](../vitest.config.ts) ejecuta `*.test.ts` en Node y `*.test.tsx` en jsdom, dentro de `src/` o `tests/`; `tests/e2e/` queda fuera.
- Conserva `oxc: false` y la transformación JSX con `esbuild` salvo que el cambio trate esa configuración.
- Durante el desarrollo, ejecuta `pnpm test:run <ruta>` para centrarte en el cambio. En el cierre de una feature sigue el procedimiento del archivo raíz: `node init-full.mjs` ya ejecuta la suite completa de Vitest.

## Playwright (E2E)

- `pnpm test:e2e` ejecuta `tests/e2e/`. [`playwright.config.ts`](../playwright.config.ts) inicia la app en `127.0.0.1:3100`: modo desarrollo local y modo producción en CI. No reutiliza servidores existentes.

## Evidencia

- Para regresiones reproducibles, confirma que la prueba falla antes del arreglo y pasa después. Comprueba resultados observables, no solo que la función no lanza errores.
- En features con `sdd: true`, enlaza cada requisito `R<n>` con una prueba concreta en `progress/impl_<name>.md`; sigue la [trazabilidad de requisitos](../docs/verification.md#nivel-6--trazabilidad-de-requirements-obligatorio-para-features-con-sdd-true).

## Fixtures
- `tests/fixtures/csv/` — CSVs de muestra por broker (un archivo por caso de prueba del parser).
- `tests/fixtures/files/` — Archivos de muestra de brokers, incluidos XLSX y XLS.
- Los parsers nuevos requieren al menos un fixture y una prueba unitaria en `src/__tests__/csv/`.
