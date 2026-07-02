# tests

## Vitest (unit)
- Incluye `src/**/*.test.{ts,tsx}` y `tests/**/*.test.{ts,tsx}`.
- **Excluye** `tests/e2e/**`.
- **No habilitar `oxc: true`** — rompe el transform actual (usar `esbuild`).

## Playwright (e2e)
- En `tests/e2e/`.
- Dev server en `127.0.0.1:3100`.

## Fixtures
- `tests/fixtures/csv/` — CSVs de muestra por broker (un archivo por caso de prueba del parser).
- Los parsers nuevos requieren al menos un fixture + un test unit en `tests/unit/csv/`.
