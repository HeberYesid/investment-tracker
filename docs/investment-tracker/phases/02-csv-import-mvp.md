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

- [ ] Create parser interface and shared parsed trade type.
- [ ] Add CSV fixtures for all four brokers.
- [ ] Implement eToro parser.
- [ ] Implement XTB parser.
- [ ] Implement Trii parser.
- [ ] Implement eTrading Bancolombia parser.
- [ ] Build preview API that parses rows, validates them, and stores preview metadata.
- [ ] Build commit API that inserts only valid rows.
- [ ] Prevent duplicate commits for the same import.
- [ ] Build import page with broker selector, file upload, preview table, validation errors, and commit action.
- [ ] Add import history view.

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

