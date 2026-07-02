# Phase 2: CSV Import MVP Plan

## Goal

Support CSV import for eToro, XTB, Trii, and eTrading Bancolombia with preview, validation, and safe commit.

## Scope

- Broker-specific CSV parsers.
- Import preview endpoint.
- Import commit endpoint.
- Row-level validation display.
- Import history.

## Files And Areas

```txt
app/import/page.tsx
app/api/v1/imports/csv/preview/route.ts
app/api/v1/imports/csv/commit/route.ts
app/api/v1/imports/[id]/route.ts
features/imports/
lib/csv/
lib/csv/parsers/
tests/fixtures/csv/
tests/unit/csv/
tests/integration/imports/
```

## Adapter Interface

```ts
export interface CsvBrokerParser {
  brokerCode: 'ETORO' | 'XTB' | 'TRII' | 'ETRADING_BANCOLOMBIA';
  parse(input: string): ParsedCsvTrade[];
}
```

## Tasks

- [x] Create parser interface and shared parsed trade type. (`src/lib/csv/types.ts`, `src/lib/csv/registry.ts`.)
- [x] Add CSV fixtures for all four brokers. (`tests/fixtures/csv/`: `etoro-valid.csv`, `etoro-commission.csv`, `xtb-valid.csv`, `trii-valid.csv`, `etrading-bancolombia-valid.csv`; broker-provided XLSX/XLS in `tests/fixtures/files/`.)
- [x] Implement eToro parser. (`src/lib/csv/parsers/etoro.ts`.)
- [x] Implement XTB parser. (`src/lib/csv/parsers/xtb.ts` + `xtb-comment-parser.ts` for cash-operation comments.)
- [x] Implement Trii parser. (`src/lib/csv/parsers/trii.ts`.)
- [x] Implement eTrading Bancolombia parser. (`src/lib/csv/parsers/etrading-bancolombia.ts`.)
- [x] Build preview API that parses rows, validates them, and stores preview metadata. (`src/app/api/v1/imports/csv/preview/route.ts`; broker validation in `src/lib/csv/validation.ts`, date parsing in `src/lib/csv/date-parsers.ts`.)
- [x] Build commit API that inserts only valid rows. (`src/app/api/v1/imports/csv/commit/route.ts`; tested in `src/__tests__/api/csv-commit-asset-profile.test.ts` and `src/__tests__/api/imports-csv.test.ts`.)
- [x] Prevent duplicate commits for the same import. (Commit route checks for an already-committed `csv_imports` row and returns `409` on replay; covered by integration tests in `src/__tests__/api/imports-csv.test.ts`.)
- [x] Build import page with broker selector, file upload, preview table, validation errors, and commit action. (`src/app/import/page.tsx` + `src/features/imports/import-page-client.tsx`; broker copy in `src/lib/i18n/imports.ts`.)
- [x] Add import history view. (`src/features/imports/import-history.tsx` consumed by `src/app/import/page.tsx`; backed by `src/app/api/v1/imports/history/route.ts` and `src/app/api/v1/imports/[id]/route.ts`.)

## Validation Rules

- Unknown columns are allowed but ignored.
- Required broker columns must be present.
- Dates must parse deterministically.
- Tickers normalize to uppercase.
- Broker currency must match configured broker default unless row explicitly states otherwise.
- Duplicate rows in the same file must be flagged before commit.
- Invalid rows must not block valid rows unless the user chooses all-or-nothing mode later.

## Tests

- Unit test: each broker fixture parses expected trade count.
- Unit test: parser handles decimal separators correctly.
- Unit test: parser handles COP and USD currency fields.
- Unit test: duplicate rows are detected.
- Integration test: preview stores valid and invalid row counts.
- Integration test: commit inserts only valid rows.
- Integration test: second commit attempt is rejected with `409`.

## Acceptance Criteria

- User can import CSV from all four brokers.
- User sees row-level validation before commit.
- Valid rows can be committed safely.
- Original CSV files are not stored by default.
- Import errors are understandable in Spanish.

## Cost Controls

- Process CSV in memory.
- Store normalized rows and validation metadata only.
- Avoid Supabase Storage unless the user explicitly enables archival later.

