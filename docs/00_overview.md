# Overview

## Scopo del progetto

Il progetto e un CRM immobiliare per agenzie, con gestione di immobili, clienti, richieste, appuntamenti, attivita, agenti, portali, feed 1clickannunci, onboarding agenzia, notifiche push, area interna amministrativa e task di zona.

Il codice reale non corrisponde pienamente al README storico: non e un backend Nest modulare, ma un backend Express/TypeScript concentrato in un unico file principale. Il frontend e una SPA React/Vite anch'essa concentrata soprattutto in `packages/frontend/src/App.tsx`.

## Stack tecnologico effettivo

- Monorepo npm workspaces: `packages/backend`, `packages/frontend`, `packages/orchestrator`.
- Backend: Node.js, Express, TypeScript, Prisma, PostgreSQL.
- Frontend: React 18, Vite, TypeScript, Zustand, React Router, Tailwind CSS parziale, molti stili inline.
- DB: PostgreSQL tramite Prisma.
- Storage documenti: MinIO/S3-compatible tramite pacchetto `minio`.
- Push: `web-push`, VAPID keys.
- Pagamenti/onboarding commerciale: Stripe checkout/webhook.
- Metriche: `prom-client` su `/metrics`.
- Mappe/geocoding: Leaflet frontend, Nominatim backend.
- Portali: feed XML 1clickannunci; endpoint legacy dismessi per altri feed.
- AI: integrazione HTTP verso provider esterno configurato da env, indicato in UI come GROQ.
- Deploy: Docker Compose, Vercel separato frontend/backend, orchestrator HTTP opzionale.

## Componenti principali

- `packages/backend/src/main.ts`: server Express, middleware, auth, route API, route interne, business logic, persistenza Prisma, integrazioni esterne.
- `packages/backend/prisma/schema.prisma`: modello dati centrale.
- `packages/backend/src/oneclick.ts`: normalizzazione, validazione e generazione XML 1clickannunci.
- `packages/backend/src/matchingEngine.ts`: scoring domanda/offerta.
- `packages/frontend/src/App.tsx`: shell SPA, routing manuale, layout, pagine e handler CRUD principali.
- `packages/frontend/src/store/authStore.ts`: stato auth persistito.
- `packages/frontend/src/PropertyModalOneClick.tsx`: wizard creazione/modifica immobile orientato a 1clickannunci.
- `packages/frontend/src/components/AgentZoneTasksPage.tsx`: UI operativa per zone, CAP, gruppi vie, lavorazioni e listing.
- `packages/orchestrator/src/main.ts`: servizio HTTP in memoria per provisioning stack agenzia.

## Entry point

- Root dev: `npm run dev` avvia backend e frontend.
- Backend locale: `packages/backend/src/main.ts`, script `npm run start:dev`.
- Backend Vercel: `packages/backend/api/index.ts` esporta l'app Express.
- Frontend: `packages/frontend/src/main.tsx`, montato in `packages/frontend/index.html`.
- Orchestrator: `packages/orchestrator/src/main.ts`.
- DB schema/seed: `packages/backend/prisma/schema.prisma`, `packages/backend/prisma/seed.ts`.

## Dipendenze esterne

- PostgreSQL: persistenza principale.
- MinIO/S3: documenti proprietari e allegati.
- Stripe: checkout pubblico e webhook subscription.
- Nominatim/OpenStreetMap: autocomplete indirizzi.
- OpenStreetMap tile server: mappe Leaflet frontend.
- GitHub raw `comuni-json`: elenco comuni/province nel wizard immobile.
- Web Push provider browser: notifiche push.
- Secret manager remoto opzionale: `SECRET_MANAGER_BASE_URL`.
- Orchestrator/provisioner esterno opzionale: comandi da env.
- Provider AI/GROQ: usato da route `/api/ai/*` e `/api/ai-assist/respond`.

## Sintesi generale

Il sistema e una SPA React che parla con un backend Express tramite `/api`, `/agency`, `/internal` e `/feeds`. Il backend autentica gli utenti CRM con JWT, limita i dati per `agencyId` e ruolo, usa Prisma per leggere/scrivere PostgreSQL e contiene direttamente la maggior parte delle regole applicative.

L'area CRM ordinaria usa `/api/*`: immobili, contatti, richieste, matching, appuntamenti, attivita, notifiche, agenti, dashboard, onboarding e configurazioni. L'area interna usa `/internal/*`: login staff, MFA, agenzie, istanze, subscription, audit log, portali globali e richieste di attivazione. Le route pubbliche sono `/api/public/*`, `/public/property/:id`, `/api/contact-requests`, `/api/visit-bookings` e i feed `/feeds/*`.

Il rischio principale e la concentrazione di responsabilita: `main.ts` e `App.tsx` sono molto grandi, con logica business, validazioni, mapping dati, UI e integrazioni mescolate. Le future modifiche vanno fatte partendo dalla mappa file e dai flussi documentati, evitando interventi localizzati solo nel punto visibile della UI.
