## ADDED Requirements

### Requirement: Indexes on filtered trade columns

The database MUST provide indexes on `trades(broker_id)`, `trades(trade_type)`, and `trades(currency_original)` to support the filter query parameters of `GET /api/v1/trades` (`broker_id`, `trade_type`, `currency_original`). These indexes MUST be created in a new numbered migration `0007_performance_indexes.sql` (the `0001_foundation.sql` migration is immutable and MUST NOT be edited). Row-Level Security on `trades` MUST remain enabled and unchanged.

#### Scenario: Filtering trades by broker
- **WHEN** `GET /api/v1/trades?broker_id=<id>` is executed
- **THEN** the query plan uses an index on `trades(broker_id)` rather than a sequential scan

#### Scenario: Migration is additive and reversible
- **WHEN** migration `0007_performance_indexes.sql` is applied to a database that already ran `0001`–`0006`
- **THEN** it succeeds without altering existing tables' RLS or data, and rolling it back (dropping the indexes) restores the prior state

### Requirement: Index on import rows lookup

The database MUST provide a composite index on `csv_import_rows(import_id, validation_status)` to support the CSV commit query that filters rows by `import_id` and `validation_status = 'VALID'`. The index MUST be created in `0007_performance_indexes.sql`.

#### Scenario: Commit reads valid rows for an import
- **WHEN** the CSV commit handler queries `csv_import_rows` filtered by `import_id` and `validation_status = 'VALID'`
- **THEN** the query plan uses the composite index and avoids a full scan of `csv_import_rows`
