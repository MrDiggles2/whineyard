# ANE Safari Design (2026-07-24)

## Goal

Ingest DBaaS exit feedback, persist it, score category + actionability via DigitalOcean Inference Batches, browse results in a simple UI.

## Architecture

- TypeScript Node/Express App Platform service (API + static UI + in-process scoring worker)
- Batches via `@digitalocean/dots` `InferenceClient`

- `POST /feedback/:formUuid` — ingest
- `GET /api/feedback` — list with filter/sort/pagination
- `public/` static UI
- In-process worker (~60s) submits/polls DO Batches

Managed Postgres via `DATABASE_URL`. Manual console deploy (`Dockerfile` + `app.yaml`). No doctl, no separate nginx/worker. Batch HTTP calls go through `@digitalocean/dots` `InferenceClient`.

## Decisions

| Topic | Choice |
|-------|--------|
| Scoring | True DO Batches API |
| Process layout | Single Express process |
| formUuid | UUID format validation only |
| Prompt | [`prompt.md`](../../../prompt.md) (actionability 1–5) |
| Auth | None (POC) |

## Data model

`feedback_entries`: id, form_uuid, feedback, tags (jsonb), category, actionability, status (`pending`\|`submitted`\|`scored`\|`failed`), batch_id, custom_id, created_at, scored_at.

## Worker

1. Resolve `submitted` batches (GET batch → on completed download results → write scores)
2. If no in-flight work, take pending rows → JSONL → upload + create batch → mark `submitted`
