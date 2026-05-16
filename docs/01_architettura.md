# Architettura

## Struttura generale

```text
.
├─ package.json                  # workspace root e script cross-package
├─ docker-compose*.yml            # sviluppo/prod Docker
├─ docs/                          # documentazione tecnica
├─ packages/
│  ├─ backend/                    # API Express + Prisma
│  ├─ frontend/                   # SPA React/Vite
│  └─ orchestrator/               # servizio provisioning stack
├─ scripts/                       # script shell/root
└─ *.csv, *.pdf, tmp*, backup      # dati legacy, prove e artefatti
```

## Backend

Responsabilita:

- Espone API CRM, API pubbliche, feed XML, area interna e metriche.
- Gestisce autenticazione JWT utenti agenzia e autenticazione interna staff.
- Applica filtri multi-tenant per `agencyId`.
- Accede a PostgreSQL tramite Prisma.
- Gestisce documenti tramite MinIO/S3.
- Genera feed 1clickannunci.
- Esegue matching tra immobili e richieste.
- Integra Stripe, push notification, Nominatim, APIMO/Immobiliare.it/GestionaleImmobiliare.

Pattern effettivo:

- Monolite Express con handler inline.
- Prisma come unico repository reale.
- Poche funzioni helper estratte in file separati (`oneclick`, `matchingEngine`, `portalRegistry`, `secretManagerClient`).
- Route ordinate per blocchi, ma senza controller/service separati.

Relazioni principali:

- `api/index.ts` importa `src/main.ts` per Vercel.
- `src/main.ts` importa Prisma Client, `oneclick.ts`, `matchingEngine.ts`, `portalRegistry.ts`, `secretManagerClient.ts`.
- `schema.prisma` definisce tutte le entita usate dagli handler.
- `seed.ts`, script import e bootstrap usano lo stesso schema.

## Frontend

Responsabilita:

- Shell applicativa, login, onboarding, dashboard e navigazione.
- CRUD immobili/contatti/agenti/appuntamenti/attivita.
- UI portali e feed 1clickannunci.
- Dettaglio immobile pubblico e checkout pubblico.
- Task di zona con mappe, gruppi CAP e lavorazioni.
- Contratti, notifiche, impostazioni, AI assist.

Pattern effettivo:

- SPA con `BrowserRouter`, ma routing applicativo manuale basato su `currentPage` in `App.tsx`.
- Stato auth globale in Zustand persistito su localStorage.
- Stato dati principale in `App.tsx`, con fetch manuali.
- Componenti separati solo per alcune aree.
- Stili prevalentemente inline, CSS globale usato come patch responsive e tema modali.

Relazioni principali:

- `main.tsx` monta `App`.
- `App.tsx` usa `authStore`, `PropertyModalOneClick`, `AgentZoneTasksPage`, `AiVoiceAssistantPage`, `ContractModal`.
- `vite.config.ts` proxy `/api` e `/internal` verso backend.
- `public/sw.js` e Web Push sono integrati dalla shell.

## Database

Il modello dati e centralizzato in `packages/backend/prisma/schema.prisma`.

Aree principali:

- Tenant e utenti: `Agency`, `User`, `InternalUser`.
- Core CRM: `Property`, `Contact`, `Request`, `Appointment`, `Activity`, `Campaign`.
- Matching: `PropertyMatch`, `MatchFeedback`.
- Portali: `PortalConfig`, `PortalSyncLog`, `PortalLog`, `GlobalPortalSecret`, campi APIMO/Immobiliare.it su `Agency` e `Property`.
- Onboarding/provisioning: `Instance`, `Subscription`, status enum.
- Supporto interno: `Ticket`, `TicketMessage`, `PortalActivationRequest`, `AuditLog`.
- Zone agenti: `AgentZone`, `ZoneStreet`, `ZoneStreetGroup`, assignment, logs, market snapshots, listing snapshots/actions/history.
- Documenti: `OwnerDocument`.
- Notifiche: `Notification`, usata anche per salvare subscription push.

## Deployment e runtime

- Local mode: frontend Vite su 3000, backend su 3001, infra Docker opzionale.
- Full Docker: `docker-compose.yml` avvia Postgres, Redis, MinIO, backend, frontend.
- Prod Docker: `docker-compose.prod.yml` aggiunge Traefik e healthcheck.
- Vercel: frontend e backend separati; frontend riscrive `/api/*` e `/internal/*` verso deployment backend hardcoded in `packages/frontend/vercel.json`.
- Orchestrator: servizio separato su porta 4100, stato in memoria, comandi operativi via env.

## Pattern architetturali osservati

- Monolite applicativo, non modulare.
- Multi-tenancy per `agencyId`, applicato manualmente negli handler.
- Role-based access manuale con controlli `SUPER_ADMIN`, `AGENCY_ADMIN`, `AGENT`.
- Response JSON prevalente `{ success, data, message }`, ma con eccezioni (`/api/agents` puo tornare array).
- Route pubbliche e private convivono nello stesso server.
- Import/export CSV implementato direttamente nel backend.
- Feed pull generato al volo dal DB.
- Configurazioni e segreti mescolati tra env, DB e secret manager opzionale.

## Dubbi e verifiche consigliate

- Il README cita Nest, Swagger, BullMQ, Redis queue e mobile, ma il codice corrente non mostra implementazione effettiva di questi moduli.
- Redis e MinIO sono nel compose, ma Redis non appare usato in modo sostanziale nel codice analizzato.
- Alcune route per APIMO/Immobiliare.it sono presenti, ma parte della UI le nasconde con `display: none`; verificare requisito prodotto prima di rimuoverle.
- L'orchestrator usa memoria locale: non e affidabile dopo restart senza persistenza esterna.
