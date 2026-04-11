# Task Orchestrazione Completa CRM (acquisto → istanza → onboarding)

Questo documento elenca i task da implementare per ottenere il flusso completo:

- Acquisto piano (Stripe Checkout, anche solo in modalità test)
- Creazione/aggiornamento Agenzia e Subscription nel master
- Provisioning automatizzato dell’istanza Docker figlio
- Redirect dell’utente alla propria istanza
- Wizard di onboarding nella nuova istanza

---

## 1. Orchestratore Docker reale (al posto della simulazione)

### 1.1 Design architetturale
- [ ] Definire la strategia di deploy per le istanze figlio:
  - opzione A: un container backend + uno frontend per agenzia,
  - opzione B: solo backend per agenzia, frontend multi‑tenant.
- [ ] Progettare l’insieme di env che ogni istanza deve ricevere:
  - `DATABASE_URL` unico per agenzia,
  - `JWT_SECRET`,
  - `INSTANCE_BASE_URL`,
  - eventuali chiavi MinIO/S3 per storage dedicato.
- [ ] Definire il naming convention per i container / stack:
  - es. `crm_agency_<slug>`.

### 1.2 Implementazione orchestrator
- [ ] Sostituire la logica “in memoria” di `orchestrator/src/main.ts` con chiamate reali:
  - verso Docker CLI o Docker API,
  - oppure verso Docker Compose / Swarm / Kubernetes (in base all’infrastruttura scelta).
- [ ] Implementare `POST /stacks` per:
  - creare la stack/servizi Docker per una specifica agenzia usando `slug` e parametri ricevuti dal provisioner,
  - ritornare `id`/`reference` della stack e `baseUrl`.
- [ ] Implementare `/stacks/:id/migrate` per:
  - eseguire le migrazioni DB nell’istanza figlio,
  - eventualmente lanciare uno script di bootstrap.
- [ ] Implementare `/stacks/:id/admin` per:
  - creare l’utente admin nell’istanza figlio (via API o comando interno),
  - salvare eventuali credenziali o trigger di reset password.
- [ ] Implementare `/stacks/:id/bootstrap-portals` per:
  - inizializzare dati portali / configurazioni base nell’istanza figlio.

### 1.3 Integrazione con `provisioner.ts`
- [ ] Configurare `INSTANCE_PROVISIONER_COMMAND` in `.env` per richiamare l’orchestratore reale.
- [ ] Aggiornare `runOrchestrator()` in `provisioner.ts` per passare:
  - `slug`, `baseUrl`, `dbName`, `dbUser`, `dbPass`, `jwtSecret`.
- [ ] Verificare che `waitForInstanceHealth(baseUrl, ...)` punti alla health API reale dell’istanza figlio.

### 1.4 Logging e osservabilità
- [ ] Aggiungere log strutturati nel provisioner e orchestratore:
  - inizio provisioning, stato PROVISIONING, READY, ERROR,
  - causa errore (messaggi da Docker/orchestrator).
- [ ] Prevedere un endpoint interno per consultare lo stato di una stack (per il Super‑dashboard).

### 1.5 Test
- [ ] Testare provisioning locale:
  - creare un’agenzia con `PENDING_PROVISIONING`,
  - verificare che venga creato il container figlio,
  - controllare che la health dell’istanza figlio risponda.
- [ ] Testare scenari di errore:
  - DB non raggiungibile,
  - immagine Docker mancante,
  - problema di migrazione.

---

## 2. Collegamento Stripe → `PENDING_PROVISIONING` nel webhook

### 2.1 Analisi e modello dati
- [ ] Mappare gli eventi Stripe già gestiti dal backend (checkout.session, invoice, subscription) e individuare quello migliore come trigger iniziale (es. `checkout.session.completed` o `customer.subscription.created`).
- [ ] Verificare lo schema Prisma per `Agency`, `Subscription` (o modello equivalente) e i campi disponibili per salvare:
  - `stripeCustomerId`
  - `stripeSubscriptionId`
  - `planCode`
  - stato dell’abbonamento.
- [ ] Definire chiaramente i metadati che Stripe deve sempre inviare:
  - `agency_name`
  - `admin_email`
  - `plan_code`

### 2.2 Implementazione logica webhook
- [ ] Aggiornare l’handler `/stripe/webhook` per:
  - leggere i metadati dalla sessione / subscription,
  - normalizzare `agency_name`, `admin_email`, `plan_code`.
- [ ] Implementare la creazione Agenzia se non esiste:
  - `Agency.name = agency_name`
  - `Agency.email = admin_email`
  - `Agency.status = PENDING_PROVISIONING`
  - altri campi minimi richiesti (slug eventuale, language, etc.).
- [ ] Implementare l’aggiornamento Agenzia se già esiste:
  - associare eventuale nuovo `stripeSubscriptionId` / `planCode`,
  - evitare duplicati se l’utente rifà il checkout con la stessa email.
- [ ] Creare/aggiornare il record Subscription (se presente nel modello):
  - salvare `stripeCustomerId`, `stripeSubscriptionId`,
  - salvare `planCode`,
  - mappare lo stato Stripe su enum locale (es. `ACTIVE`, `TRIALING`, ecc.).
- [ ] Gestire gli errori:
  - log chiari in caso di metadati mancanti,
  - risposta 2xx al webhook anche in caso di problemi non critici, ma con log per indagine.

### 2.3 Integrazione con il provisioner
- [ ] Garantire che, al termine del webhook, l’agenzia sia con `status = PENDING_PROVISIONING` quando la subscription è valida.
- [ ] Verificare che il job `provisioner.ts` intercetti correttamente le agenzie `PENDING_PROVISIONING` e avvii `provisionAgency()`.
- [ ] Aggiungere eventuali filtri (es. non provisionare se `planCode` non è previsto).

### 2.4 Test
- [ ] Scrivere test di integrazione (anche manuali con Stripe CLI) per verificare:
  - creazione Agenzia da un `checkout.session.completed` con metadati corretti,
  - aggiornamento Agenzia esistente,
  - popolamento corretto di `stripeCustomerId`, `stripeSubscriptionId`, `planCode`,
  - impostazione `Agency.status = PENDING_PROVISIONING`.

---

## 3. API di stato provisioning + polling dalla thank‑you page

### 3.1 Backend – API stato provisioning
- [ ] Definire una nuova API pubblica, ad esempio:
  - `GET /api/public/checkout/status?session_id=...`
- [ ] Implementare la risalita da `session_id` a:
  - subscription Stripe,
  - record Subscription locale,
  - relativa `Agency` e `Instance`.
- [ ] Definire un payload di risposta standard:

```json
{
  "success": true,
  "data": {
    "status": "PENDING" | "PROVISIONING" | "READY" | "ERROR",
    "baseUrl": "https://agency-xxx.tuodominio.it",
    "message": "Testo opzionale per UX"
  }
}
```

- [ ] Mappare `Agency.status` + `Instance.status` sullo stato esposto:
  - se non c’è ancora `Instance` → `status = PENDING`
  - se `Instance.status = PROVISIONING` → `status = PROVISIONING`
  - se `Instance.status = READY` → `status = READY` e includere `baseUrl`
  - se `Instance.status = ERROR` → `status = ERROR` e messaggio esplicativo.

### 3.2 Frontend – thank‑you page con polling
- [ ] Estendere `PublicCheckoutPage` per gestire i tre stati:
  - `form` (prima del pagamento),
  - `success` (dopo return da Stripe),
  - `cancel`.
- [ ] Nello stato `success`:
  - leggere `session_id` dalla query string,
  - avviare un polling (es. ogni 5–10 secondi) verso `/api/public/checkout/status`,
  - limitare il polling con timeout globale (es. 10–15 minuti).
- [ ] Gestire transizioni UX:
  - mostrare messaggi “Stiamo preparando il tuo gestionale…”
  - se `status = READY` con `baseUrl`, fare redirect:
    - `window.location.href = baseUrl`
  - se `status = ERROR`, mostrare errore e contatti supporto.

### 3.3 Test
- [ ] Verificare manualmente il flusso completo:
  - checkout Stripe → success URL → polling → redirect alla istanza.
- [ ] Aggiungere test end‑to‑end (se fattibile) o script di smoke‑test per l’API di stato.

---

## 4. Wizard di onboarding nella nuova istanza figlio

### 4.1 Estensioni modello dati
- [ ] Aggiungere a livello di istanza (schema Prisma per il CRM dell’agenzia):
  - campo `onboardingStatus` su `Agency` (`PENDING`, `IN_PROGRESS`, `COMPLETED`),
  - eventuali campi per tracciare lo step corrente (se serve).
- [ ] Valutare quali dati sono obbligatori per considerare l’onboarding “completato”:
  - dati fiscali agenzia,
  - dati di contatto (telefono, indirizzo),
  - almeno 1 utente admin o agency manager,
  - configurazione minima portali / dominio pubblico.

### 4.2 Backend – API onboarding istanza figlio
- [ ] Aggiungere endpoint per:
  - `GET /api/onboarding/status` → restituisce stato corrente e campi mancanti.
  - `PUT /api/onboarding/agency` → aggiorna dati anagrafici agenzia.
  - `POST /api/onboarding/users` → crea utenti principali (es. titolare, agenti).
  - `PUT /api/onboarding/portals` → salva impostazioni base portali/domino pubblico.
  - `POST /api/onboarding/complete` → marca `onboardingStatus = COMPLETED` dopo validazione.
- [ ] Inserire controlli di sicurezza:
  - accesso solo a utenti autenticati,
  - idealmente limitato al ruolo admin iniziale.

### 4.3 Frontend – wizard di onboarding
- [ ] Creare una pagina dedicata (es. `OnboardingWizardPage`) nell’app dell’istanza figlio con step:
  - Step 1: Dati agenzia (nome, indirizzo, P.IVA, logo).
  - Step 2: Team (creazione utenti chiave).
  - Step 3: Configurazioni (orari, portali, dominio pubblico).
  - Step 4: Riepilogo e conferma.
- [ ] All’avvio post‑login:
  - aggiungere un controllo globale (es. in App.tsx o nel layout):
    - chiamare `GET /api/onboarding/status`,
    - se `status !== COMPLETED`, forzare redirect alla pagina `/onboarding`.
- [ ] Permettere il resume:
  - se l’utente chiude il browser a metà wizard, al prossimo login riparte dallo stesso step.

### 4.4 UX e contenuti
- [ ] Preparare testi guida chiari per ogni step (anche placeholder, da rifinire dopo).
- [ ] Prevedere un pulsante “Salta per ora” solo se concordato (di solito meglio obbligare onboarding minimo).
- [ ] Aggiungere un link rapido al supporto per eventuali blocchi durante l’onboarding.

### 4.5 Test
- [ ] Testare il primo accesso dopo provisioning:
  - login admin nella istanza figlio,
  - verifica che venga mostrato il wizard e non la dashboard.
- [ ] Completare tutti gli step e verificare:
  - aggiornamento corretto dei dati in DB,
  - cambio `onboardingStatus` a `COMPLETED`,
  - accesso diretto alla dashboard dai login successivi.
- [ ] Testare casi limite:
  - refresh pagina a metà wizard,
  - uscita e rientro,
  - tentativo di accedere manualmente alle pagine interne senza aver completato l’onboarding.

---

## 5. Allineamento con Super‑dashboard interno

### 5.1 Visibilità provisioning e onboarding
- [ ] Estendere il Super‑dashboard per mostrare:
  - stato provisioning istanza (PROVISIONING, READY, ERROR),
  - stato onboarding interno (PENDING, COMPLETED),
  - link diretto alla istanza figlio.

### 5.2 Operazioni di supporto
- [ ] Aggiungere azioni interne per lo staff:
  - riprovare provisioning in caso di errore,
  - resettare onboarding (se necessario),
  - aprire rapidamente l’istanza figlio per supporto tecnico.

--- 

Questo elenco di task copre l’intero flusso:

- pagamento (anche solo test Stripe),
- creazione agenzia e subscription,
- provisioning automatico della istanza Docker figlio,
- redirect dall’area pubblica alla nuova istanza,
- onboarding guidato del nuovo cliente.
