# Hostinger Deploy/Update Runbook (crm-luca)

## Obiettivo
Aggiornare il codice su Hostinger senza eliminare il progetto Docker e senza perdere dati.

## Prerequisiti
- Repo: `okaokay/crm-luca`
- Branch deploy: `main`
- Compose: `docker-compose.hostinger.yml`
- Progetto Hostinger Docker Manager: `crm-luca`
- In GitHub:
  - Secret `HOSTINGER_API_KEY`
  - Variable `HOSTINGER_VM_ID` (es. `1664237`)

## Flusso standard
1. Fai commit/push su `main`.
2. GitHub Action `deploy-hostinger.yml` parte automaticamente.
3. Hostinger aggiorna il progetto `crm-luca`.
4. In Hostinger controlla stato container e log.

## Regole anti-perdita dati
- Non usare `docker compose down -v` in produzione.
- Mantieni i named volumes:
  - `crm-luca_postgres_data`
  - `crm-luca_redis_data`
  - `crm-luca_minio_data`
- Usa migrazioni Prisma:
  - bootstrap backend: `npx prisma migrate deploy`

## Seed in produzione
- Di default è disattivato (`SEED_ON_BOOT=false`).
- Attivalo solo quando serve (operazioni controllate), poi riportalo a `false`.

## Quando usare Upgrade vs Recreate
- `Upgrade`: sempre per fix/nuove versioni.
- `Elimina + Componi`: solo per recovery grave o replatform.

## Nota aggiornamento
- Ultimo controllo operativo del runbook: 2026-05-20.
