# Keyword and status filters — design

## Goal

Let operators narrow the exit-feedback list from the web UI by free-text keyword (feedback body) and by scoring pipeline status, alongside the existing tag / category / actionability filters.

## Scope

In scope:

- Optional `q` and `status` query params on `GET /api/feedback`
- Matching UI controls on the existing filter form
- Unit coverage via `buildListFilters`
- README API / smoke notes

Out of scope:

- Full-text search, ranking, or indexes beyond current schema
- Client-only filtering
- Changing sort columns or pagination behavior

## API

`GET /api/feedback` gains two optional filters. All filters AND together.

| Param | Behavior |
|-------|----------|
| `q` | Case-insensitive substring match on `feedback`. Empty/missing → no keyword filter. Escape `%` and `_` in the user value (literal), then bind `'%' + escaped + '%'` as a param and use `feedback ILIKE $n`. |
| `status` | Exact match on `status`. Allowed: `pending`, `submitted`, `scored`, `failed`. Any other non-empty value → `400`. Empty/missing → no status filter. |

Existing params (`tag`, `category`, `actionability`, `sort`, `order`, `page`, `pageSize`) unchanged.

Implementation detail: extend `buildListFilters` and have the GET handler call it (stop duplicating filter SQL in the route). Invalid `actionability` / `status` throw from `buildListFilters`; the handler returns `400`.

## UI

Add to `#filters` in `public/index.html`:

- Keyword text input, `name="q"`, placeholder optional
- Status `<select name="status">` with `Any` (empty) plus the four statuses

`public/app.js` already serializes non-empty form fields into the query string — no JS logic changes required unless wiring breaks that assumption.

## Testing

Extend the existing `buildListFilters` unit test to assert:

- `q` produces an `ILIKE` clause and escaped pattern param
- `status` produces `status = $n` with the given value
- Invalid `status` throws from `buildListFilters` (same pattern as invalid `actionability`); the GET handler catches that and returns `400`

## Docs

Update README API table and smoke checklist to mention keyword and status filters.
