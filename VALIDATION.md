# First public release validation — 2026-10-02

## Verified locally

- Installed the production dependencies with npm; lockfile generated for reproducible npm ci.
- npm test passed: 21 JavaScript syntax checks, 3 Python syntax checks, six original migration SHA-256 checks and representative quality parsing cases.
- All six migration files are byte-for-byte identical to the uploaded 2026-08-19 snapshot.
- compose.yaml and .github/workflows/ci.yml parsed as YAML.
- npm audit --omit=dev reported zero advisories for the installed dependency set on this date. This is not a complete security audit.
- Initialization without PGPASSWORD fails before connecting or executing SQL.
- Original XLSX integration test reports one skipped class because B13_XLSX_PATH is absent; no real-data tests passed in this environment.
- Original db/audit files were excluded; private Windows paths were replaced in documentation, UI placeholder and rebuild utilities.
- No .env, original survey workbook, photographs, database dump, node_modules or local audit output is included in the public release.

## Not verified locally

PostgreSQL/PostGIS and Docker are unavailable in the execution environment.
Fresh-database initialization, database smoke/checksum integration, native
PostgreSQL rebuild, live web/API behavior, Windows PowerShell execution and
real B-13 extraction/import have not been executed here. GitHub Actions has a
separate fresh PostgreSQL/PostGIS database job; inspect its actual result
before treating database initialization as verified.

## Scope

Public source is an early-stage research snapshot, not a validated maintenance
decision system. Normative thresholds and real deployment adoption were not
verified. Existing sample-text and historical case-count assertions are test
expectations, not newly computed field results.
