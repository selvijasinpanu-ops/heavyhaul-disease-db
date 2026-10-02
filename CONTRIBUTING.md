# Contributing

Report bugs with Node.js, PostgreSQL and PostGIS versions, the command used,
and a minimal reproducible example. Label invented test inputs as such.
Remove secrets and non-public railway records before sharing anything.

Run `npm ci` and `npm test` before a pull request. Database changes also require
`npm run db:smoke` and `npm run db:check` on an isolated database.

Do not rewrite published migrations 001—006: add a numbered migration and
update the checker. Record normative source, verification status and authority
separately from research assumptions. Do not turn unverified rules into
operational decisions.

Describe changed behavior and tests actually run, including skipped tests and
missing private fixtures. Contributions are under the MIT License.
