# Database release baseline

This release preserves the original migration bytes from the author's
2026-08-19 snapshot. Apply 001 -> 002 -> 003 -> 004 -> 005 -> 006 to a new
PostgreSQL 18 database with PostGIS and topology available. Use
`npm run db:init`; it refuses existing project schemas.

`migration_checksums.json` records the six original SHA-256 values. Never
rewrite these migrations to match a later local database. Add a new migration.

Seeds contain 17 project disease types, 27 indicators and 27 type-indicator
links. They are a research vocabulary, not verified operational thresholds.
No real survey records, coordinates, photos or private database audit files
are published. B-13 integration requires the original authorized private
workbook; its extraction/import expectations are case-specific.

Run `npm run db:smoke`, `npm run db:check` and
`node tests/migration_checksum_test.js` on an isolated initialized database.
Historical verification statements in the original snapshot are not new
verification evidence. See ../VALIDATION.md for this release's actual checks.
