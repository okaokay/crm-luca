### Task 1 – Definire i modelli master Agency, Instance, Subscription

- Obiettivo  
  Introdurre nel database master le entità di base per rappresentare agenzie, istanze Docker e abbonamenti, creando la struttura minima per la super‑dashboard.

- Prerequisiti  
  - Nessuno.

- Attività
  - Prisma (schema DB master):
    - Aggiungere i model `Agency`, `Instance`, `Subscription` con i campi elencati nella sezione 10.1.1.
    - Definire relazioni:
      - `Agency` 1‑N `Instance`.
      - `Agency` 1‑1 o 1‑N `Subscription` a seconda del modello scelto (storico o meno).
    - Aggiungere indici:
      - univoco su `Agency.slug`.
      - indici su `Agency.status` e `Subscription.status`.
  - Backend master:
    - Rigenerare il client Prisma.
    - Creare repository/funzioni per:
      - `createAgency`, `getAgencyById`, `listAgencies`, `updateAgency`.
      - `createInstance`, `getInstanceById`, `listInstances`.
      - `createSubscription`, `getSubscriptionById`, `updateSubscription`.
  - Frontend:
    - Nessun cambiamento visibile; verificare solo che build e test passino.

- Criteri di accettazione
  - Le migrazioni del DB master si applicano senza errori.
  - È possibile creare/leggere/aggiornare `Agency`, `Instance`, `Subscription` dal backend senza errori di schema.
  - Non sono state rotte funzionalità esistenti.

### Task 2 – Introdurre Ticket, TicketMessage, PortalActivationRequest, AuditLog nel master

- Obiettivo  
  Avere un modello dati completo per ticketing, richieste di attivazione portali e audit log delle azioni nella super‑dashboard.

- Prerequisiti  
  - Task 1 completato.

- Attività
  - Prisma (master):
    - Aggiungere i model `Ticket`, `TicketMessage`, `PortalActivationRequest`, `AuditLog` con i campi descritti in 10.1.1 e 10.9.3.
    - Definire relazioni:
      - `Agency` 1‑N `Ticket`.
      - `Ticket` 1‑N `TicketMessage`.
      - `Agency` 1‑N `PortalActivationRequest`.
  - Backend master:
    - Implementare repository:
      - `createTicket`, `listTickets`, `getTicketById`, `updateTicketStatus`.
      - `addTicketMessage`.
      - `createPortalActivationRequest`, `listPortalActivationRequests`, `updatePortalActivationRequest`.
      - utilità `writeAuditLog(action, entityType, entityId, userId, ip)`.
  - Frontend:
    - Nessuna UI nuova, ma assicurarsi che le funzioni possano essere usate in seguito dalle schermate ticket/portali.

- Criteri di accettazione
  - Le nuove tabelle sono presenti nel DB master e collegate alle agenzie.
  - È possibile creare un ticket con almeno un messaggio e una PortalActivationRequest via codice backend.
  - Le chiamate di audit log inseriscono correttamente record in `AuditLog`.

### Task 3 – Adeguare Prisma delle istanze agenzia (PortalConfig, PortalLog, ruoli)

- Obiettivo  
  Allineare lo schema di ogni istanza agenzia con il nuovo modello di portali e ruoli, preparando la UI Portali e i job di sync.

- Prerequisiti  
  - Task 1 completato.

- Attività
  - Prisma (schema istanza):
    - Definire/estendere `PortalConfig` con campi:
      - `portalId`, `type` (`CENTRALIZZATO` | `PER_AGENZIA`), `status`, eventuali parametri extra.
    - Aggiungere `PortalLog` con `portalId`, `operation`, `status`, `message`, `createdAt`.
    - Verificare/aggiungere ruolo utente `AGENCY_ADMIN` nel modello utenti/ruoli.
  - Backend istanza:
    - Aggiornare repository per leggere/scrivere `PortalConfig`.
    - Aggiungere funzioni per scrivere log in `PortalLog` durante i sync.
  - Frontend istanza:
    - Definire tipi/DTO per `PortalConfig` e `PortalLog` usati dalla pagina Portali e dallo storico.

- Criteri di accettazione
  - Migrazioni schema istanza applicate con successo in ambiente di sviluppo.
  - È possibile creare e leggere record `PortalConfig` e `PortalLog` via backend.
  - Il ruolo `AGENCY_ADMIN` esiste e viene riconosciuto dal sistema di permessi.

### Task 4 – Applicare e testare le migrazioni Prisma (master + istanza)

- Obiettivo  
  Garantire che tutte le modifiche di schema introdotte dai task 1–3 siano stabili, ripetibili e non rompano il sistema.

- Prerequisiti  
  - Task 1 completato.  
  - Task 2 completato.  
  - Task 3 completato.

- Attività
  - Generare e applicare le migrazioni Prisma sul DB master.
  - Generare e applicare le migrazioni Prisma sul DB di almeno una istanza agenzia di sviluppo.
  - Eseguire i test automatici esistenti (se presenti) e verificare che non ci siano regressioni.
  - Documentare la sequenza di comandi da eseguire in futuro (per ambienti staging/produzione).

- Criteri di accettazione
  - Nessuna migrazione fallisce in locale.
  - Non si verificano errori di runtime per mancanza di colonne / tabelle nelle parti esistenti dell’app.
  - La procedura di migrazione è ripetibile (stessi comandi, stesso risultato).

### Task 5 – Implementare autenticazione e ruoli interni nella super‑dashboard

- Obiettivo  
  Creare un sistema di login dedicato per lo staff del SaaS, con MFA e ruoli interni separati dagli utenti delle agenzie.

- Prerequisiti  
  - Task 1 completato.  
  - Task 2 completato.  
  - Task 4 completato.

- Attività
  - Prisma:
    - Aggiungere model `InternalUser` con `email`, `passwordHash`, `role`, `mfaSecret`.
  - Backend master:
    - Implementare endpoint:
      - `POST /internal/auth/login` (email + password).
      - `POST /internal/auth/mfa/verify` (codice TOTP).
    - Implementare generazione di token (JWT o sessione) per utenti interni.
    - Integrare una libreria TOTP per MFA.
  - Frontend super‑dashboard:
    - Implementare schermata login:
      - primo step: email/password.
      - secondo step: inserimento codice MFA.
    - Gestire salvataggio del token e logout.
  - Infrastruttura:
    - Definire chiavi di firma dei token e variabili di configurazione MFA in `.env`.

- Criteri di accettazione
  - Un utente `InternalUser` può autenticarsi con email/password + codice MFA.
  - Le API interne rifiutano richieste senza token valido.
  - Le richieste errate (password o codice sbagliato) producono errori chiari ma non rivelano dettagli sensibili.

### Task 6 – Implementare API CRUD agenzie e istanze nella super‑dashboard

- Obiettivo  
  Permettere allo staff di visualizzare e gestire l’elenco delle agenzie e delle istanze collegate.

- Prerequisiti  
  - Task 1 completato.  
  - Task 2 completato.  
  - Task 4 completato.  
  - Task 5 completato.

- Attività
  - Backend master:
    - Implementare API protette:
      - `POST /internal/agencies` (creazione agenzia base).
      - `GET /internal/agencies` con filtri su `status`, `plan`.
      - `GET /internal/agencies/{id}`.
      - `PATCH /internal/agencies/{id}` per modificare dati e stato.
      - `GET /internal/instances` e `GET /internal/instances/{id}`.
    - Applicare controllo ruoli: solo `OWNER` e `OPS_ADMIN` possono creare/modificare agenzie.
  - Frontend super‑dashboard:
    - Creare schermata elenco agenzie:
      - tabella con nome, slug, stato, piano, data creazione.
      - filtri per stato.
      - pulsante “Nuova agenzia”.
    - Creare schermata dettaglio agenzia:
      - modulo dati base.
      - sezione istanza con stato e link a `base_url`.

- Criteri di accettazione
  - Uno user interno può vedere tutte le agenzie con i filtri.
  - È possibile creare una nuova agenzia dal pannello e vederla nel DB master.
  - Le modifiche allo stato vengono salvate e riflettono le regole di ruolo.

### Task 7 – Gestire Subscription e collegamento a Stripe nel master

- Obiettivo  
  Collegare il concetto di abbonamento interno (`Subscription`) allo stato reale su Stripe.

- Prerequisiti  
  - Task 1 completato.  
  - Task 2 completato.  
  - Task 4 completato.  
  - Task 5 completato.  
  - Task 6 completato.

- Attività
  - Backend master:
    - Implementare API:
      - `GET /internal/subscriptions`.
      - `GET /internal/subscriptions/{id}`.
      - `PATCH /internal/subscriptions/{id}` (modifiche manuali controllate).
    - Integrazione Stripe:
      - assicurarsi che `stripe_customer_id` e `stripe_subscription_id` siano salvati quando disponibili.
  - Frontend super‑dashboard:
    - In dettaglio agenzia, aggiungere tab “Abbonamento”:
      - mostra piano, prezzo, data rinnovo, stato.
      - permette agli utenti `OWNER`/`BILLING` modifiche mirate (solo se necessario).
  - Infrastruttura:
    - Aggiungere chiavi Stripe alle variabili ambiente del backend master.

- Criteri di accettazione
  - Ogni `Subscription` ha i riferimenti Stripe corretti dopo la creazione via webhook.
  - Lo staff può vedere e, se necessario, correggere manualmente i dati di un abbonamento.

### Task 8 – Implementare endpoint pubblico di checkout Stripe

- Obiettivo  
  Permettere a una nuova agenzia di acquistare il gestionale in autonomia, avviando il flusso Stripe.

- Prerequisiti  
  - Task 1 completato.  
  - Task 2 completato.  
  - Task 4 completato.  
  - Task 7 completato.

- Attività
  - Backend pubblico:
    - Implementare `POST /public/checkout/create-session` che:
      - riceve piano scelto + dati base (ragione sociale, email admin).
      - crea/riutilizza `Customer` Stripe.
      - crea `CheckoutSession` in modalità `subscription`.
      - restituisce `url` di checkout.
  - Frontend pubblico:
    - Creare pagina “Acquista il gestionale”:
      - selezione piano.
      - form dati agenzia.
      - chiamata all’endpoint e redirect verso Stripe.

- Criteri di accettazione
  - È possibile completare una sessione di checkout in test mode su Stripe a partire dalla pagina pubblica.
  - La pagina gestisce correttamente errori (es. piano non valido).

### Task 9 – Implementare webhook Stripe e creazione Agency/Subscription automatica

- Obiettivo  
  Trasformare il risultato di Stripe (checkout concluso, rinnovi, fallimenti) in stato interno coerente di Agency/Subscription.

- Prerequisiti  
  - Task 1 completato.  
  - Task 2 completato.  
  - Task 4 completato.  
  - Task 7 completato.  
  - Task 8 completato.

- Attività
  - Backend master:
    - Implementare `POST /stripe/webhook` con verifica firma.
    - Gestire eventi:
      - `checkout.session.completed`:
        - leggere metadata e riferimenti.
        - creare `Agency` (se non esiste) e `Subscription` con stato `ACTIVE` o `TRIALING`.
        - impostare `Agency.status = PENDING_PROVISIONING`.
      - `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
        - aggiornare `Subscription.status` e, se necessario, `Agency.status`.
    - Scrivere in `AuditLog` i cambi di stato significativi.
  - Frontend:
    - Nella super‑dashboard, mostrare lo stato abbonamento aggiornato (refresh manuale o polling).

- Criteri di accettazione
  - Dopo un checkout Stripe completato, esiste un record `Agency` + `Subscription` coerente nel DB master.
  - Il passaggio a `PAST_DUE` o `CANCELED` su Stripe è riflesso nel DB interno.

### Task 10 – Implementare il provisioner per creare istanze Docker

- Obiettivo  
  Automatizzare la creazione delle istanze per agenzia (backend, frontend, DB) partendo dallo stato `PENDING_PROVISIONING`.

- Prerequisiti  
  - Task 1 completato.  
  - Task 2 completato.  
  - Task 3 completato.  
  - Task 4 completato.  
  - Task 9 completato.

- Attività
  - Backend/infrastruttura:
    - Implementare un microservizio (Node.js o simile) che:
      - legge periodicamente agenzie `PENDING_PROVISIONING`.
      - genera `slug` e credenziali DB.
      - invoca l’orchestratore per creare lo stack (template definito in 10.4.1).
      - esegue migrazioni Prisma sull’istanza.
      - crea l’utente `AGENCY_ADMIN`.
      - popola `PortalConfig` per tutti i portali supportati.
      - aggiorna `Instance.base_url` e `Instance.status = READY`, `Agency.status = ACTIVE`.
  - Frontend super‑dashboard:
    - Visualizzare `Instance.status` e il relativo `base_url`.

- Criteri di accettazione
  - Una nuova agenzia `PENDING_PROVISIONING` viene portata automaticamente a `ACTIVE` con istanza funzionante.
  - In caso di errore, `Instance.status = ERROR` e viene registrato un log utile alla diagnosi.

### Task 11 – Configurare reverse proxy e routing dinamico per le istanze

- Obiettivo  
  Assicurare che ogni istanza agenzia sia raggiungibile via `https://slug.tuo-saas.com` con certificato valido.

- Prerequisiti  
  - Task 10 completato.

- Attività
  - Infrastruttura:
    - Configurare Traefik/Nginx/Caddy per:
      - creare dinamicamente regole di routing in base a label o configurazione esterna.
      - generare certificati HTTPS con Let’s Encrypt.
    - Collegare il provisioner:
      - alla creazione dello stack deve essere impostato il routing corretto.
  - Frontend super‑dashboard:
    - Mostrare per ogni `Instance` il link cliccabile `base_url`.

- Criteri di accettazione
  - Dopo provisioning, l’URL dell’agenzia risponde in HTTPS e punta alla sua istanza.
  - L’aggiunta di una nuova agenzia non richiede modifiche manuali alla configurazione del reverse proxy.

### Task 12 – Definire e usare un registro portali condiviso

- Obiettivo  
  Centralizzare la definizione dei portali (id, tipo, parametri) per evitare duplicazioni e incoerenze tra master e istanze.

- Prerequisiti  
  - Task 3 completato.  
  - Task 4 completato.  
  - Task 10 completato.

- Attività
  - Backend:
    - Creare `PORTAL_REGISTRY` in un file comune (id, name, type, impostazioni).
    - Usarlo:
      - nel seed iniziale di `PortalConfig`.
      - nella logica della super‑dashboard (lista portali).
  - Frontend:
    - Riutilizzare le stesse costanti per mostrare nomi e icone dei portali nella UI agenzia.

- Criteri di accettazione
  - L’elenco portali mostrato nella UI agenzia coincide con quello usato nel backend.
  - Aggiungere o rimuovere un portale richiede modifiche in un solo punto (registro).

### Task 13 – Implementare gestione portali centralizzati nella super‑dashboard

- Obiettivo  
  Permettere allo staff di configurare una volta sola le credenziali tecniche dei portali centralizzati.

- Prerequisiti  
  - Task 1 completato.  
  - Task 2 completato.  
  - Task 4 completato.  
  - Task 7 completato.  
  - Task 12 completato.

- Attività
  - Backend master:
    - API:
      - `GET /internal/global-portals`.
      - `PATCH /internal/global-portals/{portalId}` per aggiornare credenziali nel secret manager.
  - Frontend super‑dashboard:
    - Schermata “Portali globali”:
      - elenco portali centralizzati.
      - form per credenziali (user, password, API key, endpoint).
      - pulsante “Test connessione” che chiama un endpoint di test.

- Criteri di accettazione
  - Per ciascun portale centralizzato è possibile inserire e aggiornare credenziali dal pannello.
  - Le credenziali non vengono mai esposte alle agenzie.

### Task 14 – Implementare API e UI per portali centralizzati nelle istanze

- Obiettivo  
  Consentire all’agenzia di attivare/sospendere portali centralizzati senza gestire dettagli tecnici.

- Prerequisiti  
  - Task 3 completato.  
  - Task 4 completato.  
  - Task 10 completato.  
  - Task 12 completato.  
  - Task 13 completato.

- Attività
  - Backend istanza:
    - API:
      - `GET /agency/portals` per elenco `PortalConfig`.
      - `PATCH /agency/portals/{portalId}` per cambiare `status` (solo `CENTRALIZZATO`).
  - Frontend istanza:
    - Aggiornare pagina Portali:
      - mostrare i portali `CENTRALIZZATO` con toggle Attiva/Sospendi.
      - salvare stato chiamando `PATCH`.

- Criteri di accettazione
  - Cambiare il toggle in UI aggiorna `PortalConfig.status`.
  - I portali centralizzati non mostrano mai campi tecnici all’agenzia.

### Task 15 – Implementare flow “Richiedi attivazione” per portali per‑agenzia

- Obiettivo  
  Realizzare il modello di richiesta di attivazione per tutti i portali che richiedono credenziali per singola agenzia.

- Prerequisiti  
  - Task 2 completato.  
  - Task 3 completato.  
  - Task 4 completato.  
  - Task 12 completato.  
  - Task 14 completato.

- Attività
  - Backend istanza:
    - API `POST /agency/portals/{portalId}/request-activation`:
      - crea richiesta via `POST /internal/portal-activation-requests`.
      - imposta `PortalConfig.status = IN_ATTIVAZIONE`.
  - Backend master:
    - API `POST /internal/portal-activation-requests`:
      - crea record `PortalActivationRequest`.
      - registra `AuditLog` con azione “REQUEST_PORTAL_ACTIVATION”.
  - Frontend istanza:
    - Bottone “Richiedi attivazione [Portale]” per portali `PER_AGENZIA`.
    - Subito dopo la richiesta, lo stato visualizzato passa a “In attivazione”.

- Criteri di accettazione
  - Per ogni portale `PER_AGENZIA`, il click su “Richiedi attivazione” genera un record `PortalActivationRequest` nel master.
  - L’agenzia vede chiaramente che la richiesta è in corso e non può inviarne duplicati.

### Task 16 – Implementare pannello operativo per PortalActivationRequest

- Obiettivo  
  Fornire allo staff uno strumento per lavorare le richieste di attivazione portali in modo strutturato.

- Prerequisiti  
  - Task 2 completato.  
  - Task 4 completato.  
  - Task 12 completato.  
  - Task 15 completato.

- Attività
  - Backend master:
    - API:
      - `GET /internal/portal-activation-requests` con filtri.
      - `GET /internal/portal-activation-requests/{id}`.
      - `PATCH /internal/portal-activation-requests/{id}` per `assigned_to`, `status`, `notes`.
  - Frontend super‑dashboard:
    - Schermata “Richieste portali”:
      - elenco richieste con portale, agenzia, stato, assegnatario.
      - vista dettaglio con note interne + form per aggiornare stato e inserire credenziali.

- Criteri di accettazione
  - Lo staff può filtrare richieste per portale/agenzia/stato.
  - È possibile assegnare una richiesta a un operatore e aggiornarne lo stato fino a `COMPLETED` o `BLOCKED`.  

### Task 17 – Integrare secret manager per salvataggio credenziali per‑agenzia

- Obiettivo  
  Salvare in modo sicuro le credenziali fornite dai portali per le singole agenzie, senza esporle nelle istanze o nel DB in chiaro.

- Prerequisiti  
  - Task 2 completato.  
  - Task 4 completato.  
  - Task 12 completato.  
  - Task 15 completato.  
  - Task 16 completato.

- Attività
  - Backend master:
    - Integrare client del secret manager scelto.
    - Alla chiusura positiva di una PortalActivationRequest:
      - salvare credenziali tecniche sotto chiave `portal/{portalId}/agency/{agencyId}`.
      - chiamare API interna dell’istanza per segnalare l’attivazione (`PortalConfig.status = ATTIVO`).
  - Backend istanza:
    - Esporre endpoint interno per aggiornare lo stato del portale a `ATTIVO` dopo conferma dal master.

- Criteri di accettazione
  - Le credenziali portale specifiche per agenzia non sono memorizzate in chiaro nei DB.
  - In caso di perdita dell’istanza agenzia, le credenziali restano nel secret manager centrale.

### Task 18 – Estendere job di sincronizzazione portali (centralizzati e per‑agenzia)

- Obiettivo  
  Adeguare i job di sync per usare il nuovo modello di configurazioni portali e credenziali.

- Prerequisiti  
  - Task 3 completato.  
  - Task 4 completato.  
  - Task 10 completato.  
  - Task 12 completato.  
  - Task 15 completato.  
  - Task 17 completato.

- Attività
  - Backend istanza:
    - Nei job di sync:
      - per portali `CENTRALIZZATO`:
        - usare credenziali globali lette dal master o da config centralizzata.
        - includere identificatore agenzia nel feed.
      - per portali `PER_AGENZIA`:
        - leggere credenziali specifiche dal secret manager.
        - lavorare solo immobili dell’agenzia.
      - scrivere esito su `PortalLog`.
      - in caso di errori ripetuti, creare ticket automatico nel master.

- Criteri di accettazione
  - I portali centralizzati continuano a funzionare per tutte le agenzie con il nuovo modello.
  - I portali per‑agenzia iniziano a funzionare solo dopo completamento della richiesta di attivazione.

### Task 19 – Implementare ticketing lato agenzia e lato super‑dashboard

- Obiettivo  
  Fornire un sistema completo di supporto interno/cliente, utilizzando i model `Ticket` e `TicketMessage`.

- Prerequisiti  
  - Task 2 completato.  
  - Task 4 completato.  
  - Task 5 completato.  
  - Task 6 completato.

- Attività
  - Backend istanza:
    - API:
      - `POST /agency/support/tickets` per creare un ticket.
      - `GET /agency/support/tickets` e `GET /agency/support/tickets/{id}` per elenco/dettaglio.
    - Ogni creazione di ticket chiama `POST /internal/tickets` sul master.
  - Backend master:
    - Completare API `POST /internal/tickets`, `POST /internal/tickets/{id}/messages`, `GET /internal/tickets`, `GET /internal/tickets/{id}`.
  - Frontend:
    - Lato agenzia:
      - pagina “Supporto” con lista ticket, stato e conversazione.
    - Lato super‑dashboard:
      - pagina “Ticket” con filtri, assegnazione a staff, area risposta.

- Criteri di accettazione
  - Un admin di agenzia può aprire un ticket e vedere le risposte dello staff.
  - Lo staff può filtrare ticket, rispondere e chiuderli.

### Task 20 – Completare sicurezza: MFA, audit log, IP allowlist

- Obiettivo  
  Portare la super‑dashboard a un livello di sicurezza elevato con MFA, tracciamento completo e restrizioni IP.

- Prerequisiti  
  - Task 2 completato.  
  - Task 4 completato.  
  - Task 5 completato.  
  - Task 6 completato.  
  - Task 7 completato.  
  - Task 19 completato.

- Attività
  - Backend master:
    - Completare flusso MFA (attivazione, verifica, disattivazione).
    - Implementare scrittura `AuditLog` per:
      - login/logout.
      - creazione/modifica agenzie/istanze/abbonamenti.
      - cambi stato portali.
      - gestione ticket.
    - Implementare middleware IP allowlist per endpoint critici (provisioner, billing).
  - Frontend:
    - Aggiungere schermata impostazioni sicurezza per utenti interni:
      - attivazione/disattivazione MFA.

- Criteri di accettazione
  - Nessun endpoint critico è accessibile senza MFA e fuori dagli IP autorizzati.
  - Ogni azione importante compare in `AuditLog` con user, timestamp, IP.

### Task 21 – Monitoring centralizzato e backup automatici

- Obiettivo  
  Avere visibilità sullo stato del sistema e una strategia di backup affidabile per master e istanze.

- Prerequisiti  
  - Task 10 completato.  
  - Task 11 completato.  
  - Task 20 completato.

- Attività
  - Infrastruttura:
    - Deploy stack di monitoraggio (Prometheus/Grafana o equivalente).
    - Configurare exporter su cluster, provisioner, servizi principali.
    - Configurare job di backup DB:
      - master.
      - tutte le istanze agenzia (script automatizzato).
  - Backend:
    - Se necessario, esporre endpoint `/metrics` compatibile con il sistema di monitoring.

- Criteri di accettazione
  - Dashboard di monitoraggio mostra lo stato delle istanze e del provisioner.
  - I backup vengono eseguiti secondo la retention decisa e i log lo dimostrano.

### Task 22 – Scrivere script di migrazione dati per agenzie esistenti

- Obiettivo  
  Spostare le agenzie già presenti sul sistema attuale nel nuovo modello multi‑istanza senza perdita di dati.

- Prerequisiti  
  - Task 1 completato.  
  - Task 2 completato.  
  - Task 3 completato.  
  - Task 4 completato.  
  - Task 6 completato.  
  - Task 7 completato.  
  - Task 10 completato.  
  - Task 11 completato.  
  - Task 12 completato.  
  - Task 13 completato.  
  - Task 14 completato.  
  - Task 15 completato.  
  - Task 16 completato.  
  - Task 17 completato.  
  - Task 18 completato.  
  - Task 21 completato.

- Attività
  - Analizzare schema legacy e definire mapping verso i nuovi model.
  - Scrivere script di migrazione che per ogni agenzia:
    - crea `Agency` e `Subscription` nel master.
    - invoca il provisioner per creare l’istanza.
    - copia dati (immobili, clienti, utenti, configurazioni base) nel DB della nuova istanza usando Prisma.

- Criteri di accettazione
  - Almeno una agenzia reale viene migrata con successo in ambiente di test, con dati coerenti.
  - Vengono documentati tempi e rischi per la migrazione in produzione.

### Task 23 – Eseguire test end‑to‑end e rollout graduale

- Obiettivo  
  Validare l’intero flusso nuovo (dall’acquisto al supporto) e portarlo in produzione in modo controllato.

- Prerequisiti  
  - Task 1 completato.  
  - Task 2 completato.  
  - Task 3 completato.  
  - Task 4 completato.  
  - Task 5 completato.  
  - Task 6 completato.  
  - Task 7 completato.  
  - Task 8 completato.  
  - Task 9 completato.  
  - Task 10 completato.  
  - Task 11 completato.  
  - Task 12 completato.  
  - Task 13 completato.  
  - Task 14 completato.  
  - Task 15 completato.  
  - Task 16 completato.  
  - Task 17 completato.  
  - Task 18 completato.  
  - Task 19 completato.  
  - Task 20 completato.  
  - Task 21 completato.  
  - Task 22 completato.

- Attività
  - Definire scenari di test E2E:
    - acquisto con Stripe → provisioning → primo login → richiesta attivazione portale → sync annunci → apertura ticket → gestione abbonamento.
  - Eseguire i test:
    - su istanza demo.
    - su gruppo di agenzie pilota migrate.
  - Raccogliere feedback da utenti reali e correggere eventuali problemi.
  - Pianificare rollout completo sulle restanti agenzie.

- Criteri di accettazione
  - Tutti gli scenari E2E passano in ambiente di test senza errori bloccanti.
  - Le agenzie pilota funzionano operativamente sul nuovo sistema per un periodo concordato.
  - Viene definita una data di passaggio definitivo e un piano di rollback.

### Task 24 – Progettare e implementare la UI della super‑dashboard (stile Apple)

- Obiettivo  
  Progettare e realizzare da zero l’interfaccia completa della super‑dashboard di gestione SaaS per lo staff, con un look & feel moderno e pulito ispirato alle interfacce Apple dove compatibile con lo stack esistente; in alternativa adottare comunque uno stile minimale e coerente.

- Prerequisiti  
  - Task 5 completato.  
  - Task 6 completato.  
  - Task 7 completato.  
  - Task 13 completato.  
  - Task 16 completato.  
  - Task 19 completato.  
  - Task 20 completato.  
  - Task 21 completato.

- Attività
  - Architettura frontend:
    - Definire la “app shell” della super‑dashboard (header, sidebar, contenuto centrale, area notifiche).
    - Riutilizzare il framework e le librerie di componenti già presenti nel progetto; solo se non esistono, definire un set minimo di componenti custom (button, card, input, tab, table) mantenendo performance e semplicità.
  - Design system (stile Apple‑like dove possibile):
    - Definire palette colori chiara con forti contrasti per testo/contenuti e accenti limitati.
    - Impostare tipografia leggibile con gerarchie chiare (titoli grandi, sottotitoli, body).
    - Stabilire regole di spaziatura generose, angoli arrotondati morbidi, ombre leggere.
    - Introdurre micro‑animazioni/transizioni fluide ma non invasive (hover, focus, apertura modali).
  - Navigazione e struttura delle pagine:
    - Definire mappa di navigazione principale: Home, Agenzie, Istanze, Portali globali, Richieste portali, Ticket, Abbonamenti/Stripe, Sicurezza, Monitoring/Log.
    - Implementare la sidebar con icone e label, evidenziando sezione attiva.
    - Integrare breadcrumb o titoli di pagina chiari per orientare l’operatore.
  - Composizione delle schermate esistenti:
    - Applicare il nuovo layout e il design system alle pagine già previste dai task 5–7, 13, 16, 19, 20, 21 (login, elenco agenzie, dettaglio agenzia/istanza, portali globali, richieste portali, ticket, sicurezza, monitoring).
    - Uniformare pulsanti primari/secondari, tabelle, form, badge di stato.
  - Responsività e accessibilità:
    - Garantire una resa almeno tablet‑friendly (layout che “collassa” sidebar e mantiene leggibilità in viewport ridotte).
    - Curare contrasti colore, dimensioni minime touch, stato focus visibile per tastiera.
  - Limitazioni operative:
    - Verificare che eventuali effetti stile “blur” o ombre non impattino in modo significativo su performance in ambienti meno performanti; in caso di problemi, prevedere una variante visiva più leggera mantenendo coerenza.

- Criteri di accettazione
  - Tutte le schermate della super‑dashboard condividono la stessa app shell, palette, tipografia e componenti base, senza incoerenze visive.
  - Almeno uno stakeholder business conferma che la UI risulta moderna, chiara e “pulita”; dove possibile richiama lo stile Apple senza introdurre vincoli tecnici o di performance.
  - I flussi funzionali già definiti nei task 5–7, 13, 16, 19, 20, 21 restano invariati e completamente utilizzabili all’interno del nuovo layout.
  - Build, lint e test automatici del frontend passano con successo dopo l’introduzione della super‑dashboard.

Questi 24 task, strutturati con obiettivi, attività e criteri di accettazione, coprono in modo collegato Prisma, backend, frontend e infrastruttura, e possono essere usati come base per la pianificazione operativa del progetto.
