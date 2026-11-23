# tests

Sigue el [AGENTS.md raíz](../AGENTS.md), las [convenciones de pruebas](../docs/conventions.md#tests) y la [guía de verificación](../docs/verification.md).

## Playwright (e2e)
- En `tests/e2e/`.
- Dev server en `127.0.0.1:3100`.

## Fixtures
- `tests/fixtures/csv/` — CSVs de muestra por broker (un archivo por caso de prueba del parser).
- `tests/fixtures/files/` — Archivos binarios de brokers (XLSX, XLS).
- Los parsers nuevos requieren al menos un fixture + un test unit en `src/__tests__/csv/`.
