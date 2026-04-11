# Dual Runtime: Docker + Vercel

Questa codebase supporta due runtime ufficiali con parita funzionale:

1. `docker`: stack completo in container.
2. `vercel`: frontend Vite + backend Express serverless.

## 1) Runtime locale / Docker

### Locale (backend/frontend locali + infra docker)
```bash
npm run dev:local:ready
npm run dev
```

### Full Docker
```bash
npm run dev:docker
```

## 2) Runtime Vercel

## Backend (project separato)

Root project: `packages/backend`

File usati:
- `packages/backend/vercel.json`
- `packages/backend/api/index.ts`
- `packages/backend/src/main.ts` (export `app`, no `listen` in runtime vercel)

Variabili minime:
- `APP_RUNTIME=vercel`
- `DATABASE_URL=...` (Postgres managed)
- `JWT_SECRET=...`
- `INTERNAL_JWT_SECRET=...`
- `FRONTEND_URL=https://<frontend-domain>`
- `JSON_BODY_LIMIT=50mb` (o valore richiesto)

Storage (parita con MinIO tramite client S3-compatible):
- `STORAGE_PROVIDER=minio`
- `MINIO_ENDPOINT=<s3 endpoint>`
- `MINIO_PORT=443`
- `MINIO_USE_SSL=true`
- `MINIO_ACCESS_KEY=...`
- `MINIO_SECRET_KEY=...`
- `MINIO_OWNER_DOCUMENTS_BUCKET=owner-documents`
- `STORAGE_AUTO_CREATE_BUCKET=false`

Scraping hardening:
- `SCRAPE_TIMEOUT_MS=55000`
- `SCRAPE_RETRIES=1`
- `SCRAPE_RETRY_BACKOFF_MS=1200`
- `SCRAPER_ENABLE_NESTORIA_FALLBACK=true`

## Frontend (project separato)

Root project: `packages/frontend`

File usato:
- `packages/frontend/vercel.json`

Dopo il primo deploy backend, sostituire in `packages/frontend/vercel.json`:
- `https://YOUR_BACKEND_VERCEL_DOMAIN`

con il dominio reale backend (es. `https://crm-backend.vercel.app`).

## 3) Note operative importanti

- In runtime `vercel` il backend non avvia `app.listen()`.
- In runtime non-vercel (local/docker) il comportamento resta invariato.
- Lo scraping e i fallback mantengono gli stessi endpoint e payload (`success/data/message`).
- Le route Task di zona / gruppo / via / immobili non cambiano lato frontend.

## 4) Smoke test consigliato (post-deploy)

1. Login e dashboard (`/api/auth/login`, `/api/dashboard/stats`).
2. Task di zona:
   - apertura gruppo,
   - apertura scheda via,
   - aggiornamento listings via.
3. Upload documenti contatto e download file.
4. Salvataggio note / clienti di zona / cartelli.
