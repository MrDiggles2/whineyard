# ane-safari

POC that ingests DigitalOcean DBaaS exit feedback, stores it in managed Postgres, scores it with DigitalOcean Inference **Batches**, and shows results in a simple HTML UI.

## Stack

- One Node/Express App Platform service (API + static UI + in-process scoring worker)
- Managed Postgres
- Scoring prompt: [`prompt.md`](prompt.md)

## Local run

```bash
npm install
export DATABASE_URL='postgres://user:pass@localhost:5432/ane_safari'
export MODEL_ACCESS_KEY='...'   # DO Inference key
# optional: DATABASE_SSL=false for local Postgres without TLS
npm start
```

- UI: http://localhost:8080/
- Ingest: `POST /feedback/<uuid>` with `{ "feedback": "...", "tags": ["a"] }`

```bash
npm test
```

## Deploy (DigitalOcean console)

No doctl required.

1. Push this repo to GitHub (or use a container image built from the `Dockerfile`).
2. In **Apps** → **Create App**, choose the repo (or Dockerfile source).
3. Use [`app.yaml`](app.yaml) as a starting point, or configure manually:
   - One web service, HTTP port `8080`, Dockerfile at repo root
   - Attach a **managed Postgres** database (dev DB is fine for the POC)
   - Bind `DATABASE_URL` from the database
   - Add secret `MODEL_ACCESS_KEY` (Inference / model access key)
   - Optional env: `MODEL_NAME=o3-mini`, `WORKER_POLL_MS=60000`
4. Create / deploy from the console and open the app URL.

Keep **instance count = 1**. The worker is in-process with no multi-instance locking.

## Smoke checklist

1. Open `/` — empty table loads without error.
2. `POST /feedback/550e8400-e29b-41d4-a716-446655440000` with a short feedback body → `201`.
3. Refresh UI — row appears with `status=pending`.
4. Wait for the worker (~60s + batch runtime) — status becomes `submitted`, then `scored` with category and actionability 1–5.
5. Filter by category / actionability / tag; paginate if you have enough rows.

## API

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/feedback/:formUuid` | `formUuid` must be a UUID; body `{ feedback, tags }` |
| `GET` | `/api/feedback` | Query: `tag`, `category`, `actionability`, `sort`, `order`, `page`, `pageSize` |
