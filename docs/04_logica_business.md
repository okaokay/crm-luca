# Logica Business

## Multi-tenancy

Regola: quasi tutte le entita CRM appartengono a una `Agency`.

Dove vive:

- `schema.prisma`: campi `agencyId` e relazioni.
- `main.ts`: middleware auth imposta `auth.agencyId`; handler filtrano manualmente.
- Frontend: filtra ancora per ruolo/agente in `fetchData`.

Rischio: il filtro e manuale e non uniforme; ogni nuova route deve applicarlo esplicitamente.

## Ruoli

Ruoli utente agenzia:

- `SUPER_ADMIN`
- `AGENCY_ADMIN`
- `AGENT`
- `COLLABORATOR`

Regole osservate:

- Admin possono gestire portali, agenti, assegnazioni, appuntamenti di altri.
- Agenti vedono principalmente i propri immobili/appuntamenti/attivita.
- Alcune UI admin sono nascoste, ma il backend deve comunque proteggere.

Dove vive:

- `schema.prisma` enum `UserRole`.
- `main.ts`: helper `isAdminRole`, controlli inline.
- `App.tsx`: filtro navigation e rendering "Non autorizzato".

Rischio: duplicazione frontend/backend e controlli non centralizzati.

## Onboarding

Regola: un'agenzia deve completare dati minimi, team e config.

Dove vive:

- `main.ts` funzione `evaluateOnboardingStatus`.
- `App.tsx` wizard `/onboarding`.

Campi minimi rilevati:

- `name`
- `vatNumber`
- `address`
- `city`
- `zipCode`
- `phone`

Team completo: almeno un `SUPER_ADMIN` o `AGENCY_ADMIN`.
Config completa: `publicBaseUrl` oppure almeno un portale attivo.

Rischio: UI e backend possono divergere sui requisiti; modifiche vanno fatte in entrambi.

## Immobili

Regole principali:

- Ogni immobile ha `agencyId` e `ownerId`.
- Agenti non admin possono vedere/gestire solo propri immobili.
- Stati validi: `AVAILABLE`, `RESERVED`, `SOLD`, `RENTED`, `WITHDRAWN`.
- Contratto normalizzato in `SALE`, `RENT`, `BOTH`.
- Pubblicazione portale usa `isPublished`, `portalTargets`, `oneClickData`.
- Agente non admin puo inviare per approvazione; il backend usa tag testuale `[PENDING_APPROVAL]` nelle note.

Dove vive:

- `schema.prisma` modello `Property`.
- `main.ts` route `/api/properties*`.
- `PropertyModalOneClick.tsx` payload e validazioni UI.
- `oneclick.ts` validazione feed.

Rischio: pending approval in `notes` e fragile; servirebbe campo DB dedicato.

## 1clickannunci

Regole:

- Portale registry contiene `ONECLICKANNUNCI`.
- Campi obbligatori feed:
  - `idtipologiaimmobile`
  - `idtipologiaannuncio`
  - `comune_istat`
  - `riferimento`
  - `descrizione`
  - `data_inserimento`
  - `data_aggiornamento`
- `id_localita_immobiliareit` e `id_zona_immobiliareit` non possono coesistere.
- Titolo annuncio max 50 caratteri.
- Immagini max 40, video max 4.
- Exclusion portal codes derivano dalla differenza tra selezione attuale e baseline precedente.

Dove vive:

- `oneclick.ts`
- `PropertyModalOneClick.tsx`
- `main.ts` feed e CRUD property.

Duplicazioni:

- Validazioni obbligatorie ripetute in UI e backend.
- Dati dizionario backend e fallback UI.

## Matching

Regole scoring:

- Contratto: 20 punti, hard filter.
- Tipologia: 20 punti, hard filter.
- Prezzo: 25 punti, con tolleranza 10% a meta punteggio.
- Stanze: 15 punti, tolleranza +/-1.
- Bagni: 10 punti, tolleranza +/-1.
- Location: 10 punti; citta piena, provincia 60%.
- Label: `ALTO >= 80`, `MEDIO >= 60`, altrimenti `BASSO`.

Dove vive:

- `matchingEngine.ts`.
- `main.ts` helper `buildCriteriaFromRequest`, `getMatchesForRequest`, `getMatchesForProperty`, endpoint `/api/matching/*`.

Rischio: criteri come superficie, piano, elevator, parking, garden, terrace, furnished sono nel payload/schema ma non tutti entrano nello score attuale.

## Contatti e richieste

Regole:

- Tipi contatto DB: `BUYER`, `SELLER`, `TENANT`, `LANDLORD`, `LEAD`.
- Frontend raggruppa in `CLIENT` (`BUYER`, `TENANT`, `LEAD`) e `PROPRIETOR` (`SELLER`, `LANDLORD`).
- Richieste (`Request`) sono collegate a contatto e usate per matching.
- Import CSV legacy crea/aggiorna contatti e richieste usando `legacyCustomerId` e `legacyRequestId`.

Dove vive:

- `schema.prisma`.
- `main.ts` `/api/contacts*`, `/api/requests*`.
- `scripts/import-legacy-customers-requests.js`.
- `ClientsPage`, `ContactModal`.

Rischio: mapping "proprietario" verso `LANDLORD`/`SELLER` e dati richiesta appiattiti nella UI.

## Appuntamenti

Regole:

- Admin devono assegnare almeno un agente.
- Non admin creano appuntamenti assegnati a se stessi.
- Creazione appuntamento puo creare una `Activity` automatica di tipo `TASK`.
- Creazione genera una notifica `APPOINTMENT_CREATED`.
- Cambio startTime resetta `reminderSent`.

Dove vive:

- `main.ts` `/api/appointments*`.
- `App.tsx` `AppointmentsPage`, handler `handleCreateAppointment`.

Rischio: una creazione multi-agente genera piu appuntamenti separati.

## Attivita e reminder

Regole:

- Tipi: `CALL`, `EMAIL`, `MEETING`, `VIEWING`, `NOTE`, `TASK`.
- Completamento salva `completed`, `completedAt`, opzionale report.
- Reminder appuntamenti usano `reminder`, `reminderSent`.
- Sweep reminder e disponibile via endpoint e chiamato opportunisticamente durante richieste autenticate.

Dove vive:

- `main.ts` `/api/activities*`, reminder sweep.
- `ActivitiesPage`, `ReportPage`.

Rischio: schedulazione non robusta se non configurata esternamente.

## Notifiche push

Regole:

- Notifiche normali e push subscription condividono tabella `Notification`.
- Le subscription hanno tipo speciale `PUSH_SUBSCRIPTION` e `isRead: true`.
- Push richiede VAPID public/private key.

Dove vive:

- `main.ts` push endpoints e `createNotificationRecord`.
- `App.tsx` service worker, subscription, bell/notifiche.
- `public/sw.js`.

Rischio: usare `Notification` come store subscription complica query e cancellazioni.

## Zone agenti

Regole:

- Admin assegnano CAP/gruppi/vie ad agenti.
- Un gruppo/via ha assignment attivo unico per vincoli Prisma.
- Workspace registra log `NOTE`, `STATUS`, `STATISTICS`, `HANDOVER`.
- Listing di via hanno status `NEW`, `IN_PROGRESS`, `CONTACTED`, `VISIT_BOOKED`, `CLOSED`, `DISMISSED`.

Dove vive:

- `schema.prisma` modelli `Zone*`.
- `main.ts` route `/api/agent-zones*`.
- `AgentZoneTasksPage.tsx`.

Rischio: regole operative sparse tra UI e backend; molte informazioni archiviate in `metadata` JSON.

## Area interna e provisioning

Regole:

- Staff interno usa `InternalUser`, password hash, MFA speakeasy o sentinel `DISABLED`.
- Token interno ha durata breve.
- Agenzie possono essere create/preparate e passare per `PENDING_PROVISIONING`.
- Provisioner crea `Instance`, secrets e attende health.

Dove vive:

- `main.ts` `/internal/*`.
- `provisioner.ts`.
- `orchestrator/src/main.ts`.

Rischio: orchestrator in memoria e secret fallback in memoria.

## Contratti

Regole:

- Template e contratti sono gestiti in memoria.
- Generate sostituisce placeholder dal `data` contract.
- UI gestisce locatori/conduttori multipli e clausole.

Dove vive:

- `main.ts` sezione contract templates/contracts.
- `ContractModal.tsx`, `ContractsPage`.

Rischio: non persistente, non adatto a produzione senza tabella DB.
