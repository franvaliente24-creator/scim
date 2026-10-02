# Performance Fixes — V4.5

## Summary

Profiling showed the main bottleneck was the database schema check running on
every API request, not the size of `api/index.php`. Each request ran the full
migration routine — roughly a hundred create-table and alter-table statements —
before doing any real work, adding about 0.7 to 1.5 seconds to every call.
Frontend polling multiplied this cost across all seven dashboard requests and
every background refresh.

The work was done on branch `perf/request-overhead` in small commits, so each
change can be reverted independently. The stable version remains on `main`
at commit `3639886`.

## What was changed

### 1. Schema migration gate (`f3712aa`)

`api/index.php` now keeps a `schema_migrations` sentinel table. On every
request the migration routine runs one fast version lookup; if the stored
version matches the current schema constant it returns immediately instead of
re-running the full migration body. The version is written only after the
migration completes, so a failed or interrupted migration is retried on the
next request rather than being skipped. Databases that predate the sentinel
run the existing idempotent migration once and are then stamped.

A CLI entry point was added for deployments:

```
php api/index.php migrate          # run pending migrations
php api/index.php migrate --force  # re-run the full migration body
```

This lets schema changes be applied during deployment so no HTTP request ever
pays the migration cost. On hosts without CLI access the first request after
a deploy performs the same work automatically.

### 2. Database indexes (`4c1c0f1`)

Indexes were added on the columns that hot queries filter and sort by, all
created idempotently inside the migration so existing databases pick them up
once when the version bumps. Covered columns include asset status, deletion
and archive markers, category, and created date; transaction created date,
action, and zone; purchase-order status, deletion marker, and expected
delivery; scan-log asset and created date; document and requisition status
and deletion markers; session-token expiry; and vendor deletion and archive
markers. These columns previously forced full table scans that would grow
linearly with data volume.

### 3. Fresh-database migration fix (`f42f2eb`)

While testing the gate against a brand-new database, the migration crashed
copying rows from the legacy `document_logs` table into `documents`. On new
installs the source table never existed. The copy is now skipped unless the
legacy table is present, so fresh installs migrate cleanly.

### 4. Dashboard request consolidation (`080ce24`)

The dashboard previously issued seven parallel API calls on load and every
sixty-second poll. After auditing what each response actually supplies, the
seven calls were replaced with one `/api/v1/dashboard/summary` endpoint that
returns only the data the dashboard renders: headline stats, zone occupancy,
recent scans, purchase orders, a pending-document count, integration sync
streams, low-stock alerts, and the KPI metrics/scorecard/chart series.

The supplier list and document list were only needed by the CSV export, not
by anything rendered on screen, so the export now fetches the supplier list
on demand when clicked instead of every poll.

The original endpoints (`dashboard`, `pos`, `suppliers`, `documents`,
`sync-status`, `stock-alerts`, `dashboard/metrics`) are unchanged and remain
available for other pages.

## OPCache

The shared XAMPP `php.ini` had the OPcache extension commented out entirely.
It was enabled (`zend_extension=opcache`, `opcache.enable=1`, 128 MB shared
memory). This removes the roughly 80 ms PHP parse cost per request under
Apache. Because `php.ini` lives outside the repository, this change is not in
Git — it takes effect the next time Apache loads the configuration (i.e.,
after an Apache restart). The same setting must be applied on the production
host's PHP configuration for the benefit to carry over.

## Polling review

The existing poll intervals were left unchanged. Inventory refreshes every
30 seconds only while its ledger tab is active; fleet requests poll every 30
seconds; documents every 45; the dashboard every 60; the notification bell
every 60. With the migration tax removed, each poll is now a single request
of roughly 10–20 ms, so further consolidation would buy little while risking
the real-time behavior the modules rely on.

## Measured results

All timings were taken locally against the live `hf_db_5tyoddp0` database
using PHP's built-in server with a router emulating the Apache rewrite rules.

| Measurement | Before | After |
|---|---|---|
| Single authenticated API request | ~730 ms | ~10–20 ms |
| Warm migration cost per request | ~1.5 s | ~1 ms (sentinel lookup) |
| Dashboard data load (wall-clock) | several seconds of DB churn | ~20 ms server time |
| Dashboard requests per poll | 7 | 1 |
| DB queries per dashboard poll | 66 (plus ~100+ migration statements per request before the gate) | 35 total |
| Unauthenticated 401 rejection | ~730 ms | ~10 ms |

The biggest win by far is the migration gate: it removes roughly 98% of
per-request overhead on its own. Index creation and dashboard consolidation
reduce database work and frontend requests further but build on that fix.

## Verification performed

- PHP syntax check passes on `api/index.php`; `dashboard.js` parses cleanly.
- Fresh-database migration now completes end-to-end (35 tables created,
  version stamped at 2).
- Deleting the sentinel table and dropping `scan_logs` on a test database
  self-heals on the next migration run; `--force` re-runs the body even when
  the sentinel is current.
- The summary endpoint returns every field the dashboard consumes; the page
  renders identical sections.
- MariaDB query log confirmed 35 queries for the consolidated call versus 66
  for the previous seven-call fan-out.

## Rollback

Each change is a separate commit on `perf/request-overhead`:

- `f3712aa` — migration gate
- `4c1c0f1` — indexes
- `f42f2eb` — fresh-DB migration fix
- `080ce24` — dashboard consolidation

Revert any single commit with `git revert <sha>`, or return to the stable
state entirely with `git checkout main` / `git reset --hard 3639886`.

## Out of scope

The 3,767-line `api/index.php` was deliberately not split into
controllers/services/repositories. That restructure is a maintainability
decision, not a performance one, and remains available as follow-up work once
these fixes prove stable.
