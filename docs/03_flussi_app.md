# Flussi Applicativi

## Avvio locale

1. Root `npm run dev`.
2. `packages/backend` esegue `ts-node src/main.ts`.
3. `packages/frontend` esegue Vite su 3000.
4. Vite proxya `/api` e `/internal` al backend 3001.
5. Il frontend monta `App` tramite `main.tsx`, mostra preloader e poi decide la pagina da `location.pathname` e authStore.

Input: env, DB, localStorage auth.
Output: SPA e API.
Errori: porta occupata, DB non raggiungibile, env mancanti, seed/migrate falliti in Docker.

## Login utente agenzia

1. UI: `LoginPage` o flow interno in `App.tsx`.
2. POST `/api/auth/login`.
3. Backend cerca `User` per email, confronta password con bcrypt.
4. Se valido genera JWT access 7d e refresh 30d.
5. Frontend salva user/token/refreshToken in Zustand persistito.
6. `App` naviga verso `/dashboard`, poi carica onboarding status e dati base.

Persistenza: `User`, `Agency`; token in localStorage.
Validazioni: email/password lato UI in `LoginPage`; password lato backend.
Punti critici: `JWT_SECRET` fallback `dev-secret`; token in localStorage; demo credentials disallineate.

## Refresh token

1. Frontend wrapper `fetch` intercetta 401 su `/api`.
2. POST `/api/auth/refresh` con refreshToken.
3. Backend verifica refresh secret e utente attivo.
4. Frontend aggiorna token e ripete la richiesta.

Errori: se refresh fallisce, logout e redirect `/login`.

## Middleware auth API

1. `main.ts` intercetta richieste `/api`.
2. Esclude `/api/health`, `/api/auth/login`, `/api/auth/refresh`, `/api/public/*`, contact/visit booking pubblici e reminder sweep.
3. Legge Bearer token o `x-user-id`.
4. Verifica JWT oppure accetta token mock `mock-jwt-token-*`.
5. Carica user attivo e mette `(req as any).auth`.

Punti critici: fallback `x-user-id`/mock token e `dev-secret` sono comodi in dev ma rischiosi se esposti.

## Onboarding agenzia

1. Dopo login, `App` chiama `/api/onboarding/status`.
2. Backend valuta:
   - dati agenzia minimi,
   - presenza admin attivo,
   - configurazione base URL o portali attivi.
3. Se non completato, frontend forza `/onboarding`.
4. Step 1 PUT `/api/onboarding/agency`.
5. Step 2 POST `/api/onboarding/users`.
6. Step 3 PUT `/api/onboarding/portals`.
7. Step 4 POST `/api/onboarding/complete`.

Persistenza: `Agency`, `User`, `PortalConfig`.
Business logic: `evaluateOnboardingStatus` in backend; wizard in `App.tsx`.
Punti critici: `Salta per ora` in UI puo tentare dashboard; backend/frontend devono restare allineati sui campi obbligatori.

## Caricamento dashboard

1. `App.fetchData()` parte se `user && token`.
2. Chiamate parallele:
   - `/api/properties?limit=100`
   - `/api/contacts?limit=50&page=1`
   - `/api/appointments?limit=100`
   - `/api/activities?limit=100`
   - `/api/agents`
   - `/api/dashboard/stats`
3. Carica anche `/api/contract-templates` e `/api/contracts`.
4. Dashboard rende KPI, ricerca, task, appuntamenti, zone.

Persistenza: letture Prisma su entita core.
Punti critici: limite 100 immobili e retry custom; filtri agenti applicati sia backend sia frontend.

## CRUD immobili

1. UI `PropertiesPage`, `PropertyModalOneClick`, `PropertyDetailPage`.
2. Create POST `/api/properties`.
3. Backend normalizza campi numerici/booleani, assegna `agencyId`, `ownerId`, `oneClickData`, `portalTargets`.
4. Per agenti non admin puo marcare pending approval via tag in `notes`; admin pubblica direttamente.
5. Update PUT `/api/properties/:id`, Delete DELETE `/api/properties/:id`, dettaglio GET `/api/properties/:id`.
6. Approvazione admin POST `/api/properties/:id/approve`.

Persistenza: `Property`, `PortalSyncLog`, eventuali match calcolati al volo.
Validazioni: UI wizard + backend normalizzazione/validazione OneClick.
Punti critici: regole duplicate tra UI e backend; pending approval codificato in `notes`.

## Feed 1clickannunci

1. Portali UI abilita/configura `ONECLICKANNUNCI`.
2. Immobile deve avere `portalTargets` e `oneClickData` validi.
3. GET `/feeds/1clickannunci.xml`.
4. Backend legge immobili pubblicati, normalizza `oneClickData`, valida campi obbligatori e genera XML.

Persistenza: `Property`, `PortalConfig`, log portali.
Output: XML ISO-8859-1.
Errori: immobili invalidi vengono esclusi dal feed.
Punti critici: solo 1clickannunci e implementato; feed legacy tornano 410.

## Contatti e richieste

1. `ClientsPage` carica `/api/contacts` con paginazione e category.
2. POST/PUT/DELETE `/api/contacts`.
3. Una richiesta cliente e modellata su `Request` e spesso gestita insieme al contatto.
4. Import/export:
   - GET `/api/contacts/export`
   - GET `/api/contacts/import-template`
   - POST `/api/contacts/import`
5. Documenti proprietario:
   - GET/POST/DELETE `/api/contacts/:id/documents`
   - download stream da MinIO.

Persistenza: `Contact`, `Request`, `OwnerDocument`, MinIO.
Punti critici: mapping request dentro contatto e nomi `CLIENT`/`PROPRIETOR` sono convenzioni frontend, non enum DB.

## Matching domanda/offerta

1. UI `IncrocioPage`, `PropertyDetailPage`, post-create property.
2. Backend usa `computePropertyRequestMatch`.
3. Endpoint principali:
   - `/api/matching/for-request/:requestId`
   - `/api/matching/for-property/:propertyId`
   - `/api/matching/search`
   - `/api/matching/preview`
   - `/api/matching/recompute`
   - `/api/matching/:matchId/feedback`
4. Score basato su contratto, tipologia, prezzo, stanze, bagni, location.

Persistenza: feedback su `MatchFeedback`; `PropertyMatch` esiste ma diversi endpoint calcolano righe al volo.
Punti critici: "recompute" incrementa conteggi ma non sempre upserta record; chiarire comportamento atteso prima di modificare.

## Appuntamenti, attivita e notifiche

1. Appuntamenti:
   - GET/POST/PUT/DELETE `/api/appointments`.
   - Creazione puo generare una `Activity` automatica e notifica.
2. Attivita:
   - GET/POST/PUT/DELETE `/api/activities`.
   - PUT `/api/activities/:id/complete` registra completamento/report.
3. Reminder:
   - `/api/internal/reminders/appointments/sweep`
   - `/internal/reminders/appointments/sweep`
   - `maybeRunAppointmentReminderSweep()` viene invocata durante richieste autenticate.
4. Push:
   - `/api/push/public-key`
   - `/api/push/subscribe`
   - `/api/push/unsubscribe`
   - `/api/push/test`

Persistenza: `Appointment`, `Activity`, `Notification`.
Punti critici: subscription push salvate come righe `Notification` con tipo speciale; sweep reminder dipende da traffico o endpoint schedulato.

## Task di zona

1. UI `AgentZoneTasksPage`.
2. Base data:
   - `/api/geo/locations`
   - `/api/geo/pescara-caps`
   - `/api/agent-zones`
3. Admin assegna gruppi CAP con `/api/agent-zones/assign-cap-group` o assignments.
4. Workspace gruppo/via:
   - `/api/agent-zones/group-workspace`
   - `/api/agent-zones/street-workspace`
   - log workspace
   - market insights/listings/actions/status.

Persistenza: modelli `AgentZone*`, `ZoneStreet*`.
Integrazioni: dataset locale Pescara, scraping/listing/market insights dentro backend.
Punti critici: area molto ampia e specifica, difficile da testare senza dati reali.

## Area interna staff

1. Path `/internal` in frontend mostra `InternalLoginPage`.
2. POST `/internal/auth/login`, poi MFA se richiesto.
3. Token interno JWT breve.
4. Route protette da `requireInternalAuth` e IP allowlist globale `/internal`.
5. Funzioni: agenzie, istanze, subscription, utenti, audit, portali globali, richieste attivazione.

Persistenza: `InternalUser`, `Agency`, `Instance`, `Subscription`, `AuditLog`, `GlobalPortalSecret`.
Punti critici: alcune route interne come `/internal/portals/:portalId/activate` non usano `requireInternalAuth` direttamente, ma sono sotto `app.use('/internal', requireIpAllowlist)`.

## Checkout pubblico Stripe

1. UI `/public/checkout`.
2. POST `/api/public/checkout/create-session`.
3. Backend crea Stripe Checkout o fake checkout se env abilitata.
4. Stripe POST `/stripe/webhook`.
5. Webhook crea/aggiorna `Agency`, `Subscription`, status provisioning.

Persistenza: `Agency`, `Subscription`, audit.
Punti critici: webhook protetto da IP allowlist; se allowlist non configurata, comportamento dipende da `requireIpAllowlist`.

## Contratti

1. UI `ContractsPage` e `ContractModal`.
2. Backend `/api/contract-templates`, `/api/contracts`, `/api/contracts/:id/generate`.
3. Dati contratti sono array in memoria in `main.ts`.

Persistenza: nessuna DB per contratti attuali.
Punti critici: perdita dati a restart; non usare per dati reali senza implementare persistenza.
