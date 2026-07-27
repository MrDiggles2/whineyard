# Analytics Dashboard Design (2026-07-27)

## Goal

Give PMs a `/dashboard.html` view of scored exit-feedback volume and actionability over a date range, with period-over-period comparison, CSV export of aggregates, and drill-through into the existing searchable table. Segment breakdowns (resource/plan/age/region) are out of scope.

## Architecture

- Static dashboard: `public/dashboard.html` + `public/dashboard.js`, Chart.js via CDN
- Aggregate API: `GET /api/analytics` and `GET /api/analytics/export` in `src/routes/analytics.ts`
- List API extended with optional `from` / `to` for drill-through
- Aggregation in SQL against `feedback_entries`; no schema migration

## Decisions

| Topic | Choice |
|-------|--------|
| Reason | Existing `category` field |
| Default range | Last 30 days (UTC) |
| Default population | Scored only (`status = 'scored'`); toggle `includeUnscored` |
| Granularity | Daily if range ≤ 60 days; else weekly |
| PoP prior window | Equal length immediately before `from` |
| Reason trends | Absolute volume default; client toggle to share of total |
| Charts | Chart.js CDN |
| Segments (6.4) | Skipped |

## API

### `GET /api/analytics`

Query: `from`, `to` (ISO dates), `includeUnscored` (`true`/`false`, default false).

Invalid dates → `400`.

Response includes: `range`, `compareRange`, `totalVolume`, `byReason`, `volumeOverTime`, `reasonOverTime`, `periodOverPeriod` (`current`, `prior`, `pctChange`; null pct when prior is 0), `actionability` (`avg`, `distribution`, `avgOverTime`, `avgOverTimeByReason`).

### `GET /api/analytics/export`

Same filters; CSV of aggregated series (not raw rows).

### `GET /api/feedback`

Optional `from` / `to` (inclusive on `created_at`) so dashboard clicks can pre-filter the table.

## UI

Dashboard controls: date range, presets (7d / 30d / 90d), include-unscored, volume↔share toggle, Export CSV, link to table.

Charts: total volume KPI; reason breakdown (donut/bar); volume over time; multi-series reason trends; PoP table; actionability avg + distribution + trend (filterable by reason client-side).

Drill-through: chart click → `/?category=&from=&to=&status=scored` (omit status when includeUnscored). Table hydrates filters from URL on load.

## Out of scope

- 6.4 segment dimensions
- Auth, caching, materialized views
- npm chart packages
