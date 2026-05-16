# Punti Di Modifica Rapida

## Se devo modificare UI

Guardare prima:

- `packages/frontend/src/App.tsx`: quasi tutte le pagine e layout.
- `packages/frontend/src/index.css`: patch responsive, tema modali, preloader.
- `packages/frontend/src/main.tsx`: boot/preloader/router.

Per aree specifiche:

- Login: `packages/frontend/src/pages/auth/LoginPage.tsx`.
- Immobili wizard: `packages/frontend/src/PropertyModalOneClick.tsx`.
- Portali: `App.tsx` `PortalsPage`, `PortalDetailPage`, `PropertyPortalsTab`.
- Zone/task: `packages/frontend/src/components/AgentZoneTasksPage.tsx`.
- AI assist: `packages/frontend/src/components/AiVoiceAssistantPage.tsx`.
- Contratti modal: `packages/frontend/src/components/ContractModal.tsx`.
- Auth layout: `packages/frontend/src/components/layout/AuthLayout.tsx`.

Verificare anche:

- `packages/frontend/src/app-types.d.ts`
- `packages/frontend/src/types/index.ts`
- Test in `packages/frontend/src/*.test.tsx` e `packages/frontend/src/pages/**/*.test.tsx`.

## Se devo modificare validazioni

Guardare prima:

- Backend generale: `packages/backend/src/main.ts`.
- OneClick/feed: `packages/backend/src/oneclick.ts`.
- Matching criteria: `packages/backend/src/matchingEngine.ts` e helper in `main.ts`.
- Frontend immobile: `packages/frontend/src/PropertyModalOneClick.tsx`.
- Login: `packages/frontend/src/pages/auth/LoginPage.tsx`.
- Onboarding: `main.ts` `evaluateOnboardingStatus` e wizard in `App.tsx`.
- Import CSV: `main.ts` import contacts e `packages/backend/scripts/import-legacy-customers-requests.js`.

Nota: se la validazione ha impatto prodotto, aggiornarla sia lato backend sia lato UI.

## Se devo modificare business rules

Guardare prima:

- Core backend: `packages/backend/src/main.ts`.
- Schema dati: `packages/backend/prisma/schema.prisma`.
- Matching: `packages/backend/src/matchingEngine.ts`.
- Portali/feed: `packages/backend/src/portalRegistry.ts`, `packages/backend/src/oneclick.ts`.
- Zone: route `/api/agent-zones*` in `main.ts` e `AgentZoneTasksPage.tsx`.
- Onboarding/provisioning: `main.ts`, `packages/backend/src/provisioner.ts`, `packages/orchestrator/src/main.ts`.

Per evitare regressioni:

- Cercare endpoint corrispondente con `rg "/api/nome" packages/backend/src/main.ts packages/frontend/src`.
- Verificare filtri `agencyId` e ruolo.
- Aggiornare tipi frontend se cambia payload.

## Se devo modificare DB

Guardare prima:

- `packages/backend/prisma/schema.prisma`.
- `packages/backend/prisma/migrations/*`.
- `packages/backend/prisma/seed.ts`.
- Handler Prisma in `packages/backend/src/main.ts`.
- Tipi frontend: `app-types.d.ts`, `types/index.ts`.

Passi tipici:

- Modifica schema.
- Crea migrazione Prisma.
- Aggiorna seed/import se necessario.
- Aggiorna query/select/create/update in backend.
- Aggiorna UI/tipi/test.

## Se devo modificare API

Guardare prima:

- `packages/backend/src/main.ts`: definizione route.
- `packages/backend/api/index.ts`: adapter Vercel.
- `packages/frontend/vite.config.ts`: proxy dev.
- `packages/frontend/vercel.json`: rewrite produzione frontend.
- Chiamanti frontend con `rg "/api/endpoint" packages/frontend/src`.

Route principali:

- Auth: `/api/auth/*`.
- Onboarding: `/api/onboarding/*`.
- Immobili: `/api/properties*`.
- Contatti: `/api/contacts*`.
- Matching: `/api/matching*`.
- Appuntamenti: `/api/appointments*`.
- Attivita: `/api/activities*`.
- Portali: `/api/portals*`, `/agency/portals*`, `/feeds/*`.
- Zone: `/api/agent-zones*`, `/api/geo/*`.
- Internal: `/internal/*`.

## Se devo modificare configurazioni

Guardare prima:

- Root `package.json`.
- `docker-compose.yml`, `docker-compose.prod.yml`.
- `packages/backend/package.json`.
- `packages/backend/vercel.json`.
- `packages/frontend/package.json`.
- `packages/frontend/vite.config.ts`.
- `packages/frontend/vercel.json`.
- `packages/frontend/nginx.conf`.
- Env backend `.env.example` e deployment environment.

Variabili sensibili/importanti:

- `DATABASE_URL`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `INTERNAL_JWT_SECRET`, `INTERNAL_IP_ALLOWLIST`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price ids
- `PUBLIC_BASE_URL`, `FRONTEND_URL`, `PUBLIC_AGENCY_ID`
- `WEB_PUSH_VAPID_*`
- `GLOBAL_PORTALS_SECRET_KEY`
- `SECRET_MANAGER_*`
- `INSTANCE_*`, `ORCHESTRATOR_*`
- Config AI/GROQ.

## Se devo modificare autenticazione/autorizzazione

Guardare prima:

- Backend middleware auth in `packages/backend/src/main.ts` dopo `getBearerToken/getAuth`.
- `/api/auth/login`, `/api/auth/refresh`, `/api/auth/change-password`.
- Internal auth `/internal/auth/*` e `requireInternalAuth`.
- `packages/frontend/src/store/authStore.ts`.
- `packages/frontend/src/pages/auth/LoginPage.tsx`.
- Fetch wrapper in `App.tsx`.
- Navigation role filter in `App.tsx`.

Controlli da non dimenticare:

- `agencyId` su ogni query.
- Ruoli admin vs agent.
- Route pubbliche escluse dal middleware.
- Route internal protette da IP allowlist e JWT interno.

## Se devo modificare job/processi schedulati

Guardare prima:

- Reminder appuntamenti: `main.ts` `handleAppointmentReminderSweepRequest`, `maybeRunAppointmentReminderSweep`, docs `push-reminders-scheduler.md`.
- Provisioning: `packages/backend/src/provisioner.ts`.
- Orchestrator: `packages/orchestrator/src/main.ts`.
- Docker commands in `docker-compose.yml`.
- Vercel cron/eventuale scheduler esterno, se configurato.

Punti critici:

- Non esiste un job runner robusto centralizzato.
- Reminder puo dipendere da chiamate HTTP.
- Provisioner e loop infinito.

## Se devo modificare logging/error handling

Guardare prima:

- `packages/backend/src/main.ts`: `console.error`, response `success:false`, Prometheus metrics.
- Portal logs: `PortalLog`, `PortalSyncLog`, helper `writePortalLog`.
- Audit: helper `writeAuditLog` e route internal audit.
- Frontend: alert/toast/console in `App.tsx` e componenti.

Migliorie consigliate:

- Centralizzare error handler Express.
- Uniformare payload errore.
- Aggiungere correlation/request id.
- Separare log applicativi da audit e da log portali.

## Mappa "se devo modificare X"

| Richiesta futura | File da guardare prima |
|---|---|
| Login utente CRM | `backend/src/main.ts`, `frontend/src/pages/auth/LoginPage.tsx`, `frontend/src/store/authStore.ts` |
| Refresh token/logout | `backend/src/main.ts`, `frontend/src/App.tsx`, `authStore.ts` |
| Onboarding | `backend/src/main.ts`, `frontend/src/App.tsx`, `App.onboarding.test.tsx` |
| Dashboard KPI | `backend/src/main.ts` `/api/dashboard/stats`, `frontend/src/App.tsx` `DashboardPage` |
| Lista/CRUD immobili | `backend/src/main.ts` `/api/properties`, `frontend/src/App.tsx` `PropertiesPage`, `PropertyModalOneClick.tsx` |
| Dettaglio immobile | `backend/src/main.ts`, `frontend/src/App.tsx` `PropertyDetailPage` |
| Pubblicazione 1click | `backend/src/oneclick.ts`, `backend/src/portalRegistry.ts`, `backend/src/main.ts`, `PropertyModalOneClick.tsx` |
| Feed XML | `backend/src/oneclick.ts`, `backend/src/main.ts` `/feeds/1clickannunci.xml`, `test/feeds-regression.ts` |
| Contatti/clienti | `backend/src/main.ts` `/api/contacts`, `frontend/src/App.tsx` `ClientsPage`, `ContactModal` |
| Import/export contatti | `backend/src/main.ts`, `backend/scripts/import-legacy-customers-requests.js`, `ClientsPage` |
| Richieste cliente | `schema.prisma` `Request`, `main.ts`, `ContactModal`, `IncrocioPage` |
| Matching/incrocio | `backend/src/matchingEngine.ts`, `backend/src/main.ts`, `frontend/src/App.tsx` `IncrocioPage` |
| Appuntamenti | `backend/src/main.ts`, `frontend/src/App.tsx` `AppointmentsPage`, forse `AppointmentCalendar.tsx` |
| Attivita/report | `backend/src/main.ts`, `frontend/src/App.tsx` `ActivitiesPage`, `ReportPage` |
| Notifiche/push | `backend/src/main.ts`, `frontend/src/App.tsx`, `frontend/public/sw.js` |
| Agenti | `backend/src/main.ts` `/api/agents`, `frontend/src/App.tsx` `AgentsPage`, `AgentModal` |
| Zone task | `backend/src/main.ts` `/api/agent-zones*`, `schema.prisma` zone models, `AgentZoneTasksPage.tsx` |
| Portali dashboard | `backend/src/main.ts` `/api/portals*`, `/agency/portals*`, `App.tsx` `PortalsPage` |
| Internal admin | `backend/src/main.ts` `/internal/*`, `App.tsx` `InternalLoginPage` |
| Stripe checkout | `backend/src/main.ts` `/api/public/checkout*`, `/stripe/webhook`, `PublicCheckoutPage` |
| Contratti | `backend/src/main.ts` contract section, `ContractModal.tsx`, `ContractsPage` |
| DB schema | `backend/prisma/schema.prisma`, migrations, seed, affected route handlers |
| Deploy Vercel | `backend/vercel.json`, `frontend/vercel.json`, Vercel env |
| Docker | root compose files, package Dockerfiles, nginx config |

## I 20 file piu importanti

1. `packages/backend/src/main.ts`
2. `packages/backend/prisma/schema.prisma`
3. `packages/frontend/src/App.tsx`
4. `packages/frontend/src/PropertyModalOneClick.tsx`
5. `packages/backend/src/oneclick.ts`
6. `packages/backend/src/matchingEngine.ts`
7. `packages/frontend/src/components/AgentZoneTasksPage.tsx`
8. `packages/frontend/src/store/authStore.ts`
9. `packages/backend/src/portalRegistry.ts`
10. `packages/backend/src/provisioner.ts`
11. `packages/orchestrator/src/main.ts`
12. `packages/backend/prisma/seed.ts`
13. `packages/backend/scripts/import-legacy-customers-requests.js`
14. `packages/frontend/src/main.tsx`
15. `packages/frontend/src/index.css`
16. `packages/frontend/src/app-types.d.ts`
17. `packages/frontend/src/types/index.ts`
18. `packages/frontend/vite.config.ts`
19. `packages/backend/vercel.json`
20. `packages/frontend/vercel.json`
