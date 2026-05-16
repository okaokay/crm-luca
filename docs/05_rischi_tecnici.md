# Rischi Tecnici

## Debito tecnico principale

1. `packages/backend/src/main.ts` e monolitico e disabilita TypeScript con `// @ts-nocheck`.
2. `packages/frontend/src/App.tsx` contiene routing, stato, pagine, API client e UI in oltre 58k righe.
3. Regole business duplicate tra frontend e backend.
4. Tipi duplicati tra Prisma, `src/types/index.ts`, `app-types.d.ts` e tipi locali in componenti.
5. Molti stili inline; CSS globale corregge casi responsive con selector fragili.
6. README e struttura reale non allineati.
7. File backup/tmp/dati legacy nella root e in `src` aumentano rumore e rischio di modifica sbagliata.

## Fragilita backend

- Auth ha fallback `dev-secret`, mock token e supporto `x-user-id`.
- Multi-tenancy applicata manualmente in ogni handler.
- Alcune route hanno risposta non uniforme (`/api/agents` puo essere array o `{data}`).
- Contratti sono in memoria, quindi non persistono.
- Secret manager fallback in memoria non persiste.
- Orchestrator mantiene stack in memoria.
- Webhook Stripe dipende da IP allowlist; configurazione errata puo bloccare pagamenti.
- `Notification` usata sia per notifiche sia per push subscription.
- `notes` usato come storage stato approval immobile.
- Encoding 1click degrada caratteri non Latin-1.
- Route order fragile: ad esempio `/api/contacts/:id` deve fare `next()` per export/import.

## Fragilita frontend

- Routing manuale con `currentPage` e `navigate`, senza route dichiarative per tutte le pagine.
- API client non centralizzato; fetch wrapper locale in `App`, ma componenti separati usano fetch diretto.
- Molti fetch duplicano header Authorization.
- Token in localStorage.
- UI nasconde sezioni con `display: none` invece di rimuovere/feature flaggare.
- Mojibake patch runtime (`cleanupMojibakeInDocument`) maschera problemi encoding invece di risolverli alla fonte.
- `AppointmentCalendar.tsx` e implementazioni in `App.tsx` duplicano dominio appuntamenti.
- `PropertyModalOneClick.tsx` carica comuni da GitHub raw a runtime: rischio offline/rate/network.

## Dipendenze e configurazioni pericolose

- `packages/frontend/vercel.json` contiene URL backend hardcoded.
- Docker compose include credenziali placeholder.
- `.env` locali presenti nel repo workspace: non documentare o committare segreti.
- `package.json` root cita `packages/mobile`, assente.
- `nest-cli.json` presente nel backend, ma backend reale non e Nest.
- Redis e BullMQ sono dichiarati nel README/compose, ma l'uso reale non e evidente.

## Possibili bug o comportamenti ambigui

- `recomputeMatchesForRequest` e `recomputeMatchesForProperty` contano match ma non risultano sempre persistere `PropertyMatch`.
- `Contact` category frontend (`CLIENT`/`PROPRIETOR`) non esiste nel DB.
- Demo credentials in UI login e seed non sempre coincidono.
- `publicBaseUrl` puo derivare da host o singola agency; ambiguita in multi-tenant.
- Se esistono piu agency e nessun `PUBLIC_AGENCY_ID`, route pubbliche possono non risolvere agency.
- Import CSV legacy decide tipo contatto in modo euristico.
- `AgentZoneTasksPage` e backend zone usano molti `metadata` JSON, difficili da validare.
- Geocoding Nominatim in loop con timeout puo degradare prestazioni.
- `maybeRunAppointmentReminderSweep` legato alle richieste autenticate puo generare effetti collaterali inattesi.

## Test mancanti o deboli

- Mancano unit test backend per handler core.
- Test backend sono HTTP smoke/regression e richiedono server gia avviato.
- Test frontend coprono login, onboarding e PortalsPage base, ma non CRUD core.
- Nessun test end-to-end completo login -> CRUD -> feed.
- Nessun test per multi-tenancy/ruoli.
- Nessun test per import CSV, document upload, MinIO, Stripe webhook, push, zone tasks.

## Codice morto o probabilmente inutilizzato

- `appointments_old.tsx`: vecchia UI appuntamenti fuori workspace.
- `packages/frontend/src/components/AppointmentCalendar.tsx`: possibile legacy, dato che App usa `AppointmentsPage`.
- Backup `App_*`, `.bak*`, `.ftfy*`, `.trans_try`: non runtime, da archiviare fuori src.
- README sezioni Nest/mobile/Swagger/BullMQ sembrano aspirazionali.
- Feed legacy `/feeds/trovit.xml`, `/feeds/meta_catalog.csv`, `/feeds/gestionaleimmobiliare.xml`, `/feeds/gestionale_sync.tar.gz` tornano 410.
- UI APIMO/GestionaleImmobiliare in impostazioni e portali e in parte nascosta.

## Duplicazioni

- Validazione OneClick: backend `oneclick.ts` e frontend `PropertyModalOneClick.tsx`.
- Auth/fetch: `App.tsx`, `LoginPage.tsx`, componenti separati.
- Tipi entita: Prisma, `types/index.ts`, `app-types.d.ts`, componenti locali.
- Appuntamenti: componente separato e pagina interna.
- Config portali: registry backend, UI portal status, test storici.
- CSV parsing: script import e backend import contatti implementano parser separati.

## Naming ambiguo

- `ownerId` su `Property` indica agente/responsabile, non proprietario reale; i dati proprietario sono campi `ownerFirstName`, ecc.
- `Contact.type` e `category` frontend possono confondere clienti/proprietari.
- `AgencyStatus.ACTIVE` e `isActive` coesistono.
- `PortalConfig.active` e `status` coesistono.
- `Notification` include subscription push.
- `Request` e termine generico, ma rappresenta richiesta immobiliare.

## Aree ad alto rischio regressione

1. Auth e refresh token.
2. Filtri `agencyId` e ruolo in ogni endpoint.
3. CRUD immobili e wizard 1click.
4. Feed 1clickannunci.
5. Matching domanda/offerta.
6. Import/export contatti/richieste.
7. Appuntamenti, reminder e notifiche push.
8. Zone agenti e listing di via.
9. Stripe checkout/webhook/provisioning.
10. Deploy Vercel rewrites/proxy backend.

## Refactor consigliati

- Estrarre backend in moduli: auth, agencies, properties, contacts, matching, portals, zoneTasks, notifications, public.
- Rimuovere `// @ts-nocheck` progressivamente dopo aver tipizzato helper e handler.
- Centralizzare auth/multi-tenancy e response format.
- Creare API client frontend unico.
- Spezzare `App.tsx` in route/page components reali.
- Generare tipi frontend da Prisma/OpenAPI o almeno centralizzarli.
- Spostare contratti su DB.
- Sostituire pending approval in `notes` con campo dedicato.
- Portare config Vercel backend URL su env.
- Archiviare backup/tmp fuori da `src` e root runtime.
