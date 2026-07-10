# tests

## Vitest (unit)
- Tests unitarios en `src/**/*.test.{ts,tsx}` y `tests/**/*.test.{ts,tsx}`.
- `src/__tests__/` es el directorio principal de tests unitarios.
- **Excluye** `tests/e2e/**`.
- **No habilitar `oxc: true`** — rompe el transform actual (usar `esbuild`).

## Playwright (e2e)
- En `tests/e2e/`.
- Dev server en `127.0.0.1:3100`.

## Fixtures
- `tests/fixtures/csv/` — CSVs de muestra por broker (un archivo por caso de prueba del parser).
- `tests/fixtures/files/` — Archivos binarios de brokers (XLSX, XLS).
- Los parsers nuevos requieren al menos un fixture + un test unit en `src/__tests__/csv/`.
