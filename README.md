# ane-safari

POC that ingests DigitalOcean DBaaS exit feedback, stores it in managed Postgres, scores it with DigitalOcean Inference **Batches**, and shows results in a simple HTML UI.

## Stack

- TypeScript (Node/Express) App Platform service — API + static UI + in-process scoring worker
- Managed Postgres
- Batches client: [`@digitalocean/dots`](https://github.com/digitalocean/dots) `InferenceClient` (Node ≥ 20.10 / `.nvmrc` 22)
- Scoring prompt: [`prompt.md`](prompt.md)
- UI remains plain HTML/JS in `public/`

## Local run

### Docker Compose (app + Postgres)

```bash
cp .env.example .env   # set MODEL_ACCESS_KEY for scoring (optional for UI/API smoke)
docker compose up --build
```

- App: http://localhost:8080/
- Postgres: `localhost:5432` (user/password/db: `ane` / `ane` / `whineyard`)

### Node on the host

```bash
nvm use   # or Node 22+
npm install
cp .env.example .env   # then edit DATABASE_URL / MODEL_ACCESS_KEY
# optional: only start Postgres — docker compose up db -d
npm run dev            # tsx; loads .env from project root
# or: npm run build && npm start
```

### Submit feedback

```bash
curl \
   -X POST \
   --header "Content-Type: application/json" \
   --data '{ "feedback": "I want to use PostGIS but it doesnt work" , "tags": [ "long-lived", "pricing" ]}' \
   http://localhost:8080/api/feedback/e1f74eb4-e763-4731-8a2c-e890813f450e 
```

## Deploy (DigitalOcean console)

No doctl required. The Dockerfile multi-stage builds TypeScript to `dist/`.

1. Push this repo to GitHub (or use a container image built from the `Dockerfile`).
2. In **Apps** → **Create App**, choose the repo (or Dockerfile source).
3. Use [`app.yaml`](app.yaml) as a starting point, or configure manually:
   - One web service, HTTP port `8080`, Dockerfile at repo root
   - Attach a **managed Postgres** database (dev DB is fine for the POC)
   - Bind `DATABASE_URL` from the database
   - Add secret `MODEL_ACCESS_KEY` (Inference / model access key)
   - Optional env: `MODEL_NAME=o3-mini`, `WORKER_POLL_MS=60000`, `MAX_IN_FLIGHT_BATCHES=5`
4. Create / deploy from the console and open the app URL.

Keep **instance count = 1**. The worker is in-process with no multi-instance locking.

## Smoke checklist

1. Open `/` — empty table loads without error.
2. `POST /feedback/550e8400-e29b-41d4-a716-446655440000` with a short feedback body → `201`.
3. Refresh UI — row appears with `status=pending`.
4. Wait for the worker (~60s + batch runtime) — status becomes `submitted`, then `scored` with category and actionability 1–5.
5. Filter by keyword / category / actionability / tag / status / date range; paginate if you have enough rows.
6. Open `/dashboard.html` — volume and actionability charts load for the last 30 days (scored-only by default).
7. Click a chart segment — table opens pre-filtered via query params.

## API

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/feedback/:formUuid` | `formUuid` must be a UUID; body `{ feedback, tags }` |
| `GET` | `/api/feedback` | Query: `q`, `tag`, `category`, `status`, `actionability`, `from`, `to`, `sort`, `order`, `page`, `pageSize` |
| `GET` | `/api/analytics` | Query: `from`, `to`, `includeUnscored` — aggregated volume, reason trends, PoP, actionability |
| `GET` | `/api/analytics/export` | Same filters as analytics; CSV of aggregates (not raw rows) |
