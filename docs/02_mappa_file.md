# Mappa File

## Root

### `package.json`

Ruolo: definisce workspace, script dev/build/test/db.
Dipendenze ingresso: npm workspace.
Dipendenze uscita: comandi verso backend/frontend/prisma/docker.
Punti critici: script `dev:mobile` cita `packages/mobile`, non presente nella struttura attuale.

### `README.md`

Ruolo: documentazione storica/prodotto.
Dipendenze: nessuna runtime.
Punti critici: contiene mojibake e descrive architettura Nest/mobile non allineata al codice reale.

### `docker-compose.yml`

Ruolo: ambiente sviluppo full Docker.
Uscita: Postgres, Redis, MinIO, backend, frontend.
Punti critici: backend usa comando lungo con install/migrate/seed a runtime; `JWT_SECRET` demo hardcoded.

### `docker-compose.prod.yml`

Ruolo: ambiente produzione Docker con Traefik.
Uscita: servizi infra, backend, frontend.
Punti critici: password DB/JWT hardcoded come placeholder; HTTP senza TLS diretto nel compose.

### File root CSV/PDF/tmp/backups

Ruolo: dati legacy, specifiche portali, prove, esportazioni, conversazioni e backup.
Punti critici: non sono parte del build, ma alcuni CSV (`customers.csv`, `richieste.csv`, `zone.csv`) alimentano import o logiche di zona.

## Backend

### `packages/backend/src/main.ts`

Ruolo: entry point Express e centro della logica applicativa.
Ingresso: Express, Prisma, env, `oneclick`, `matchingEngine`, `portalRegistry`, `secretManagerClient`, MinIO, Stripe, web-push.
Uscita: route `/api`, `/agency`, `/internal`, `/feeds`, `/metrics`, DB, MinIO, Stripe, Nominatim, AI provider, APIMO/portali.
Funzioni principali: middleware auth, onboarding, portal config, Stripe webhook, CRUD CRM, matching, zone tasks, notifiche, contratti, reset, internal admin.
Effetti collaterali: scrive DB, invia push, chiama servizi esterni, genera feed, gestisce upload/download, aggiorna audit/log/ticket.
Criticita: `// @ts-nocheck`, file enorme, molte regole duplicate, route order fragile, testabilita bassa.

### `packages/backend/api/index.ts`

Ruolo: adapter Vercel, esporta app Express.
Ingresso: `../src/main`.
Uscita: default export per `@vercel/node`.
Criticita: importa l'intero server; attenzione a side effect globali.

### `packages/backend/src/oneclick.ts`

Ruolo: dizionari, normalizzazione, validazione e XML feed 1clickannunci.
Ingresso: property base e `oneClickData`.
Uscita: XML ISO-8859-1, errori di validazione, default data.
Funzioni principali: `normalizeOneClickData`, `applyOneClickPortalSelectionDelta`, `validateOneClickData`, `buildOneClickFeedXml`.
Effetti collaterali: nessuno diretto.
Criticita: molte costanti portali/tipologie; encoding Latin-1 degrada caratteri non rappresentabili a `?`.

### `packages/backend/src/matchingEngine.ts`

Ruolo: calcolo score tra immobile e richiesta.
Ingresso: property, criteria, pesi.
Uscita: score, label, reasons, gaps.
Funzioni: `computePropertyRequestMatch`, `getMatchStatusFromScore`.
Effetti collaterali: nessuno.
Criticita: considera solo parte dei criteri definiti nello schema; alcune funzioni backend chiamate "recompute" non persistono sempre i risultati.

### `packages/backend/src/portalRegistry.ts`

Ruolo: registry portali disponibili.
Ingresso: nessuno.
Uscita: `PORTAL_REGISTRY`.
Criticita: oggi contiene solo `ONECLICKANNUNCI`, mentre UI/test storici citano altri portali.

### `packages/backend/src/secretManagerClient.ts`

Ruolo: salvataggio/lettura segreti remoto opzionale o in memoria.
Ingresso: env `SECRET_MANAGER_*`.
Uscita: chiamate HTTP a secret manager o Map in-memory.
Criticita: fallback in memoria non persiste e non e condiviso tra processi.

### `packages/backend/src/provisioner.ts`

Ruolo: poller per agenzie `PENDING_PROVISIONING`.
Ingresso: DB, env `INSTANCE_*`, `saveSecret`.
Uscita: crea/aggiorna `Instance`, `Agency`, `AuditLog`; esegue comando esterno; healthcheck.
Criticita: loop infinito senza graceful shutdown; errori generici; provisioning reale dipende da env.

### `packages/backend/prisma/schema.prisma`

Ruolo: contratto dati centrale.
Ingresso: Prisma.
Uscita: client Prisma e migrazioni.
Criticita: molte aree nello stesso schema; modifiche richiedono migrazione attenta e verifica frontend/backend.

### `packages/backend/prisma/seed.ts`

Ruolo: crea utente interno e dati demo se DB vuoto.
Uscita: Agency, Users, Contacts, Properties, Requests, Appointments, Activities, Matches, Campaign, AuditLog.
Criticita: credenziali demo note; salta se esistono utenti/properties/contacts.

### `packages/backend/prisma/portal-config-bootstrap.ts`

Ruolo: allinea `PortalConfig` alle properties pubblicate e al registry.
Criticita: imposta active/status in base all'uso corrente, non a scelta esplicita utente.

### `packages/backend/prisma/migrate-legacy-agencies.ts`

Ruolo: prepara agenzie legacy per provisioning multi-istanza.
Effetti: status `PENDING_PROVISIONING`, subscription default, audit.
Criticita: script operativo potente, da usare con env corrette.

### `packages/backend/scripts/import-legacy-customers-requests.js`

Ruolo: importa CSV legacy clienti/richieste.
Ingresso: `customers.csv`, `richieste.csv`, agencyId, assignedToId.
Uscita: upsert `Contact`, `Request`.
Criticita: mapping legacy euristico; concurrency 20; genera report ma non file.

### `packages/backend/test/feeds-regression.ts`

Ruolo: test HTTP feed.
Ingresso: server gia avviato.
Uscita: verifica feed 1click e 410 feed legacy.
Criticita: non avvia il server; richiede dati pubblicabili.

### `packages/backend/test/portals-compat.ts`

Ruolo: test compatibilita `/api/portals`.
Ingresso: server avviato, `COMPAT_EMAIL`, `COMPAT_PASSWORD`.
Criticita: si aspetta un solo portale `ONECLICKANNUNCI`.

### `packages/backend/data/pescara-caps.json` e `packages/backend/zone.csv`

Ruolo: dataset CAP/vie/zone per task di zona.
Ingresso: route geo/zone.
Criticita: dati locali specifici, da validare prima di estendere ad altre citta.

## Frontend

### `packages/frontend/src/main.tsx`

Ruolo: entry point React.
Ingresso: `App`, `index.css`.
Uscita: render nel DOM, preloader.
Criticita: preloader fisso 900ms.

### `packages/frontend/src/App.tsx`

Ruolo: shell SPA e quasi tutte le pagine.
Ingresso: React Router, authStore, componenti, API backend.
Uscita: render UI, fetch API, local state, local notifications.
Funzioni/pagine principali: `App`, `DashboardPage`, `PropertiesPage`, `ClientsPage`, `IncrocioPage`, `AppointmentsPage`, `ActivitiesPage`, `ReportPage`, `PropertyDetailPage`, `PublicCheckoutPage`, `PublicPropertyPage`, `PortalsPage`, `PortalDetailPage`, `AgentsPage`, `SettingsPage`.
Effetti collaterali: localStorage, service worker, push, fetch, navigation.
Criticita: file enorme, routing manuale, molte chiamate API duplicate, mojibake patch, stili inline, tipi globali paralleli.

### `packages/frontend/src/app-types.d.ts`

Ruolo: tipi globali usati da App.
Criticita: duplica e diverge da `src/types/index.ts` e schema Prisma.

### `packages/frontend/src/store/authStore.ts`

Ruolo: Zustand persistito per user/token/refreshToken.
Ingresso: payload login backend.
Uscita: localStorage `auth-storage`.
Criticita: token persistiti in localStorage; logout solo client-side salvo area internal separata.

### `packages/frontend/src/types/index.ts`

Ruolo: tipi TypeScript piu strutturati per entita CRM.
Criticita: non e fonte unica; alcuni campi sono mancanti o divergenti da Prisma/App.

### `packages/frontend/src/PropertyModalOneClick.tsx`

Ruolo: wizard immobile in 16 step per dati core + 1clickannunci + proprietario + assegnazione.
Ingresso: property, dictionaries `/api/oneclick/dictionaries`, agents, comuni GitHub, geocoding.
Uscita: payload property con `oneClickData`, `portalTargets`, `submitForApproval`.
Criticita: molte regole di validazione duplicate rispetto a backend `oneclick.ts`.

### `packages/frontend/src/components/AgentZoneTasksPage.tsx`

Ruolo: pagina task di zona, assegnazioni CAP/gruppi, workspace, log, market/listing insights.
Ingresso: `/api/geo/*`, `/api/agent-zones/*`, Leaflet.
Uscita: crea assegnazioni, logs, status listing, contatti/visite pubbliche.
Criticita: componente molto grande, stato complesso, logica operativa e UI mescolate.

### `packages/frontend/src/components/AiVoiceAssistantPage.tsx`

Ruolo: assistente vocale/testuale con comandi locali e fallback AI.
Ingresso: Web Speech API, `/api/ai-assist/respond`.
Uscita: navigazione pagine, sintesi vocale.
Criticita: dipende da supporto browser; naming visuale non allineato in alcune stringhe.

### `packages/frontend/src/components/AppointmentCalendar.tsx`

Ruolo: calendario appuntamenti legacy/separato.
Criticita: `App.tsx` contiene una pagina appuntamenti piu recente con react-big-calendar; rischio duplicazione/morto.

### `packages/frontend/src/components/ContractModal.tsx`

Ruolo: modal creazione/generazione contratti.
Ingresso: template, property/contact/agent, `/api/contracts`.
Uscita: contratto salvato e testo generato.
Criticita: contratti backend sono in-memory, quindi non persistono a restart.

### `packages/frontend/src/pages/auth/LoginPage.tsx`

Ruolo: pagina login con react-hook-form/zod.
Ingresso: `/api/auth/login`.
Uscita: authStore e navigate dashboard.
Criticita: App usa anche logiche auth proprie; credenziali demo mostrate non coincidono sempre con seed.

### `packages/frontend/src/index.css`

Ruolo: Tailwind base + patch responsive/globali + tema modali + preloader.
Criticita: molte regole correggono stili inline tramite selector `[style*=...]`; fragili.

### `packages/frontend/vite.config.ts`

Ruolo: config Vite, alias e proxy.
Criticita: `strictPort: true`; se 3000 occupata fallisce.

### `packages/frontend/vercel.json`

Ruolo: deploy Vercel frontend.
Criticita: backend Vercel hardcoded (`backend-delta-two-35.vercel.app`).

### File backup `App_old`, `App_backup`, `.bak*`, `.ftfy*`, `.trans_try`, `.recovered`, `.broken-backup`

Ruolo: snapshot/backup di recupero.
Criticita: non dovrebbero entrare nel build, ma restano nel repo e confondono ricerche/review.

## Orchestrator

### `packages/orchestrator/src/main.ts`

Ruolo: API provisioning stack agenzia.
Ingresso: body JSON, env comandi.
Uscita: stato stack in memoria, comandi esterni.
Criticita: nessuna persistenza, nessuna auth, password DB/JWT in memoria processo.

## File probabilmente secondari o legacy

- `scripts/mojibake_fix_app.js`: utility riparazione encoding App, non runtime.
- `scripts/start-docker.ps1`, `scripts/setup.sh`: helper ambiente.
- `appointments_old.tsx`: vecchia implementazione appuntamenti.
- `tmp_*`, `.tmp_*`, chat/export HTML: artefatti analisi/prove.
- `fattibilita*.md`, `task*.md`, `PORTALI.md`, report vari: documentazione storica/prodotto.
