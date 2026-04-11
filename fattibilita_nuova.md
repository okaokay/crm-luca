## Studio di fattibilità completo – SaaS immobiliare multi‑agenzia

Questo documento integra e amplia le richieste presenti in `fattibilita.md`, includendo:
- modello di attivazione portali “per‑agenzia” tramite richieste interne
- onboarding automatico di nuove agenzie
- super‑dashboard con sicurezza molto elevata
- provisioning automatico di istanze Docker (una per agenzia) in una sola VPN/VPC
- ticketing centralizzato e gestione abbonamenti.

L’obiettivo è valutare la fattibilità tecnica e operativa di un gestionale immobiliare erogato come SaaS, con forte isolamento tra agenzie ma gestione centralizzata da parte del proprietario del SaaS.

---

## 1. Modelli di integrazione con i portali

### 1.1 Modello centralizzato (partner unico)

- Concetto:
  - Il gestore del SaaS firma un accordo “partner/gestionale” con il portale.
  - Esiste un set di credenziali tecniche globale o per pochi cluster.
  - Ogni annuncio contiene un identificativo agenzia (es. `agencyId`, `source`, codice cliente).
- UX lato agenzia:
  - L’agenzia vede solo un toggle tipo “Attiva/Sospendi [Portale]”.
  - Non vede né gestisce credenziali tecniche.
- UX lato super‑dashboard:
  - Sezione “Configurazione portali globali”.
  - Per ogni portale centralizzato:
    - credenziali tecniche globali (utente, password, token, endpoint API/XML)
    - parametri tecnici condivisi (formato feed, mapping campi, ecc.).
- Fattibilità:
  - Alta, quando il portale supporta o accetta la modalità partner.
  - Richiede un accordo commerciale/tecnico con ciascun portale.

### 1.2 Modello “richiesta di attivazione” per portali per‑agenzia

Questa parte riprende e formalizza il punto 3 di `fattibilita.md`.

- Scenario:
  - Il portale richiede credenziali / contratto separato per ogni agenzia.
  - Non si vuole che l’admin dell’agenzia gestisca parametri tecnici (endpoint XML, user, password, codici cliente).

- Flusso uniforme per tutti i portali per‑agenzia:
  - L’istanza dell’agenzia (Docker dedicato) mostra per ogni portale:
    - stato: `Non attivo / In attivazione / Attivo / Sospeso`
    - pulsante: **“Richiedi attivazione [NomePortale]”**.
  - Quando l’admin clicca:
    - l’istanza invia una richiesta verso la super‑dashboard:
      - creazione record `PortalActivationRequest` con:
        - `agencyId`
        - `portalId`
        - eventuali note dell’agenzia
        - stato iniziale `OPEN`.
    - l’istanza aggiorna la propria `PortalConfig` locale:
      - `status = IN_ATTIVAZIONE`.
  - La super‑dashboard:
    - mostra tutte le `PortalActivationRequest` in una vista filtrabile per:
      - portale
      - agenzia
      - stato (open, in_progress, completed, blocked).
  - Il team operativo del SaaS:
    - contatta il portale
    - apre/collega il contratto commerciale
    - ottiene credenziali tecniche: user/password, endpoint, codici cliente, source, API key.
    - inserisce questi dati in un pannello interno:
      - vengono salvati in un secret manager associato all’istanza dell’agenzia.
    - clicca “Attiva”.
  - Il sistema:
    - aggiorna l’istanza dell’agenzia tramite API interna:
      - `PortalConfig.status = ATTIVO`.
      - eventuali parametri non sensibili (es. codice cliente) copiati in chiaro se necessario.
    - marca `PortalActivationRequest` come `COMPLETED`.
  - Da quel momento:
    - i job di sincronizzazione della singola istanza iniziano a pubblicare/aggiornare annunci su quel portale usando le credenziali salvate.

- Perché è fattibile per tutti:
  - Non dipende da un rapporto partner unico con il portale.
  - Funziona anche quando ogni agenzia ha user/pass separati.
  - Il carico operativo resta lato team SaaS ma:
    - è tracciato
    - può essere scalato con tooling interno (filtri, code, assegnazione a operatori).

- Pro:
  - UX semplice e uniforme:
    - l’agenzia fa sempre “Richiedi attivazione” invece di inserire parametri tecnici.
  - Nessun dato tecnico in mano ai clienti:
    - riduce errori, aumenta sicurezza.
  - Facilmente estendibile a nuovi portali:
    - basta aggiungere una voce in `PortalConfig` e nei flussi di ticket.

- Contro:
  - Maggior lavoro manuale per il supporto, soprattutto con molti portali/agenzie.
  - Serve tooling interno per:
    - lista richieste
    - stato lavorazione
    - storicizzazione.

Conclusione: questo modello è sempre implementabile, anche dove il modello centralizzato non è possibile, e convive bene con il modello partner unico.

---

## 2. Onboarding automatico di una nuova agenzia

Questa sezione formalizza il punto 4 di `fattibilita.md` e lo collega al provisioning Docker.

### 2.1 Step logici di onboarding

Quando una nuova agenzia acquista il gestionale:

1. **Creazione Agency e ordine**
   - La super‑dashboard, o un sistema di pagamento (Stripe/Paddle), crea:
     - record `Agency`:
       - dati fiscali
       - contatto principale
       - piano scelto (es. basic/pro/enterprise)
       - stato iniziale `PENDING_PROVISIONING`.

2. **Provisioning automatico istanza Docker**
   - Un servizio “provisioner” rileva le agenzie `PENDING_PROVISIONING` e:
     - genera uno `slug` univoco (es. `agenzia-123`).
     - crea lo stack Docker dedicato per l’agenzia:
       - container backend
       - container frontend
       - container DB (o DB/schemi dedicati).
     - assegna variabili d’ambiente specifiche:
       - `DB_USER`, `DB_PASS`, `DB_NAME`
       - `JWT_SECRET` univoco
       - URL di base (es. `https://slug.tuo-saas.com`).
     - registra il routing nel reverse proxy:
       - `https://slug.tuo-saas.com → stack agenzia`.

3. **Configurazione portali di default**
   - Nella nuova istanza viene eseguita una migrazione/seed che:
     - crea tutte le `PortalConfig` per i portali supportati:
       - Immobiliare, Idealista, Casa.it, Trovit, Meta, GestionaleImmobiliare, ecc.
       - tutte con stato `NON_ATTIVO` o `NON_CONFIGURATO`.
     - imposta per ciascuno il tipo:
       - `CENTRALIZZATO` (usa credenziali globali) oppure
       - `PER_AGENZIA` (usa modello richiesta di attivazione).

4. **Creazione admin iniziale agenzia**
   - Il provisioner:
     - crea un utente con ruolo `AGENCY_ADMIN` nell’istanza:
       - email specificata in fase di acquisto.
       - password temporanea o token one‑time per impostare la password.

5. **Notifica e primo login**
   - L’admin dell’agenzia riceve un’email:
     - con link `https://slug.tuo-saas.com` e token di attivazione.
   - Al primo accesso:
     - deve impostare una password forte
     - completare un wizard di setup (logo, dati azienda, ecc.).

### 2.2 UI dell’agenzia dopo onboarding

- Pagina “Portali”:
  - Elenco di tutti i portali disponibili.
  - Per portali centralizzati:
    - toggle “Attiva/Sospendi”.
  - Per portali per‑agenzia:
    - pulsante “Richiedi attivazione”.
    - stato: `Non attivo / In attivazione / Attivo / Sospeso`.

### 2.3 UI super‑dashboard dopo onboarding

- Vista per singola agenzia:
  - dettagli dell’agenzia
  - stato istanza (attiva/sospesa/errore)
  - elenco portali con:
    - stato
    - parametri tecnici (non visibili all’agenzia)
    - link rapido alle richieste di attivazione.

- Vista globale:
  - tutte le `PortalActivationRequest` per tutte le agenzie
  - filtri per:
    - portale
    - stato
    - operatore assegnato.

Conclusione: l’onboarding automatico è perfettamente compatibile con il modello multi‑istanza Docker e con la gestione dei portali definita in `fattibilita.md`.

---

## 3. Architettura infrastrutturale: un Docker per agenzia

Questa parte sintetizza e dettaglia il punto “Modello architetturale: un Docker per agenzia”.

### 3.1 Scenario

- Un’unica VPN / VPC nel cloud (o rete privata su server dedicati).
- Per ogni agenzia:
  - 1 container backend
  - 1 container frontend
  - 1 database dedicato (consigliato) oppure schema dedicato su DB condiviso.
- Un reverse proxy centrale (Traefik/Nginx/Caddy) che instrada i domini e sottodomini verso lo stack giusto.

### 3.2 Fattibilità tecnica

- Con Docker + orchestratore (Kubernetes, Docker Swarm, Nomad, o anche script automatizzati):
  - si possono definire template di stack:
    - `docker-compose` o Helm chart parametrizzati.
  - il provisioner genera un nuovo stack per ogni agenzia:
    - nomi univoci:
      - `agenzia-123-backend`, `agenzia-123-db`, ecc.
    - variabili d’ambiente specifiche per stack.
- Il reverse proxy:
  - si configura dinamicamente (label Docker o config API) per mappare:
    - `agenzia1.tuo-saas.com` → stack agenzia 1
    - `agenzia2.tuo-saas.com` → stack agenzia 2.

### 3.3 Pro e contro

- Pro:
  - isolamento forte tra agenzie:
    - un problema di performance o bug non impatta direttamente le altre istanze.
  - flessibilità:
    - possibilità di personalizzazioni future per agenzie grandi.
  - compliance/privacy:
    - dati di ogni agenzia separati e più facilmente esportabili.

- Contro:
  - overhead operativo:
    - servono strumenti per creare, aggiornare, monitorare e fare backup di molte istanze.
  - aggiornamenti:
    - una nuova release richiede deploy su tutte le istanze (servono pipeline automatizzate).
  - costi:
    - tanti DB e container possono essere sovradimensionati per agenzie piccole.

Conclusione: la soluzione è tecnicamente fattibile e allineata a un SaaS “premium”, ma richiede investimenti DevOps e attenzione ai costi.

---

## 4. Super‑dashboard con sicurezza elevata

### 4.1 Separazione logica

- La super‑dashboard è:
  - un’applicazione separata o un sotto‑dominio dedicato (es. `admin.tuo-saas.com`).
  - non accessibile ai normali utenti delle agenzie.
  - collegata solo alle API interne e ai servizi di orchestrazione.

### 4.2 Autenticazione e autorizzazione

- Autenticazione:
  - MFA obbligatoria per tutti gli utenti interni.
  - opzionale: limitazioni IP (allowlist per uffici o VPN del team).
  - password policy avanzata.
- Autorizzazioni (RBAC interno):
  - ruoli tipo:
    - `OWNER`: pieno controllo.
    - `OPS_ADMIN`: provisioning, gestione istanze, accesso log tecnici.
    - `SUPPORT`: gestione ticket e richieste portali ma senza permessi infrastrutturali.
    - `BILLING`: gestione piani e abbonamenti, senza accesso tecnico.
  - granularità per azioni critiche:
    - creare/chiudere istanze
    - reset password admin agenzia
    - cambiare piano o sospendere un abbonamento.

### 4.3 Sicurezza dei segreti

- Tutte le credenziali sensibili devono essere memorizzate in un secret manager:
  - provider cloud (AWS, GCP, Azure) o Vault.
  - chiavi API dei portali, credenziali DB delle istanze, ecc.
- I container delle istanze ricevono i segreti:
  - tramite variabili d’ambiente generate al volo
  - o tramite volume/sidecar sicuro.
- Nessun segreto in chiaro nel codice, nel controllo versione o nella UI delle agenzie.

### 4.4 Audit e logging

- Ogni azione nella super‑dashboard genera log di audit:
  - chi ha fatto cosa
  - su quale agenzia/istanza
  - quando
  - da quale IP.
- Alert automatici per:
  - pattern sospetti (es. molti reset password in poco tempo)
  - cambi di piano improvvisi
  - provisioning falliti.

Conclusione: raggiungere un livello di sicurezza molto alto è fattibile, purché la super‑dashboard sia progettata come un sistema critico a sé stante.

---

## 5. Automazione acquisto → provisioning → primo accesso

Questa sezione consolida il flusso “acquisto → nuova installazione Docker”.

### 5.1 Step 1 – Acquisto / ordine

- L’admin della nuova agenzia:
  - acquista il gestionale tramite:
    - pagina pubblica integrata con provider pagamenti (Stripe/Paddle)
    - oppure ordine gestito manualmente dal tuo team nella super‑dashboard.
- Creazione record:
  - `Agency`
  - `Subscription` con:
    - piano
    - prezzo
    - data rinnovo.
- Stato:
  - `Agency.status = PENDING_PROVISIONING`.

### 5.2 Step 2 – Provisioning automatico istanza

- Servizio provisioner:
  - monitora le agenzie in stato `PENDING_PROVISIONING`.
  - per ognuna:
    - genera `slug`.
    - crea stack Docker parametrizzato.
    - esegue migrazioni DB iniziali.
    - effettua il seed delle `PortalConfig`.
    - registra il routing nel reverse proxy.
    - crea admin iniziale agenzia.
  - alla fine:
    - `Agency.status = ACTIVE`.

### 5.3 Step 3 – Primo accesso

- Email automatica all’admin:
  - link di attivazione con token.
  - URL personalizzato dell’istanza.
- Al primo login:
  - obbligo cambio password.
  - eventuale configurazione iniziale guidata.

Conclusione: l’intero flusso può essere automatizzato tramite webhook dei pagamenti e un servizio provisioner dedicato.

---

## 6. Ticket, richieste portali e abbonamenti

### 6.1 Ticket e richieste dai clienti

- Ogni istanza agenzia deve poter:
  - creare ticket verso la super‑dashboard tramite API:
    - problemi tecnici
    - richieste di attivazione portali (oltre a quelle standard).
- Struttura dati:
  - tabella `Ticket` centralizzata con:
    - `id`
    - `agencyId`
    - `type` (supporto, portale, billing, ecc.)
    - `status` (open, in_progress, done, blocked)
    - storico messaggi.
- La super‑dashboard:
  - vista globale di tutti i ticket
  - filtri per agenzia, tipo, stato, operatore assegnato.

### 6.2 PortalActivationRequest e legame con i ticket

- Ogni click su “Richiedi attivazione [Portale]”:
  - crea un record `PortalActivationRequest` centralizzato.
  - opzionalmente crea o collega un ticket dedicato.
- La super‑dashboard:
  - permette di:
    - assegnare la richiesta a un operatore
    - inserire note interne (contatti con il portale)
    - chiudere la richiesta dopo la configurazione.

### 6.3 Gestione abbonamenti

- Entità `Subscription` collegata a `Agency`:
  - piano (es. numero utenti, immobili, portali attivabili)
  - prezzo
  - periodo di fatturazione
  - stato (active, past_due, canceled, trial).
- Integrazione con provider pagamenti:
  - webhook per:
    - creazione abbonamento
    - rinnovi
    - fallimento pagamento
    - cancellazioni.
- Comportamenti automatici:
  - pagamento fallito:
    - cambiare `Subscription.status` → `PAST_DUE`.
    - eventualmente impostare `Agency.status = SUSPENDED` dopo N giorni:
      - bloccare accesso admin agenzia (o solo funzionalità non critiche).
  - upgrade/downgrade:
    - aggiornare limiti nel DB:
      - numero massimo utenti
      - portali attivabili
      - spazio disco o altri parametri.

Conclusione: la parte abbonamenti è standard per un SaaS e si integra bene con l’architettura proposta.

---

## 7. Sicurezza, VPN unica e isolamento

### 7.1 VPN / VPC unica

- Tutte le istanze Docker per agenzia risiedono nella stessa rete privata:
  - accessibili solo tramite reverse proxy HTTPS.
- Accesso agli host:
  - solo mediante VPN amministrativa e chiavi SSH.
- Nessun servizio DB esposto direttamente su Internet.

### 7.2 Isolamento tra agenzie

- Ogni istanza ha:
  - DB dedicato o schema dedicato.
  - container backend che usa solo quel DB.
- La rete interna:
  - non deve permettere ad un container agenzia di chiamare direttamente il DB di un’altra.
- Le API interne tra super‑dashboard e istanze:
  - devono essere autenticate e autorizzate.

### 7.3 Backup e disaster recovery

- Backup regolari delle basi dati per ogni agenzia:
  - snapshot o dump programmati.
- Possibilità di ripristinare:
  - una singola agenzia
  - o l’intero cluster in caso di incidente maggiore.

Conclusione: usare una sola VPN/VPC è compatibile con sicurezza elevata, purché si progetti bene l’accesso alle risorse e l’isolamento tra istanze.

---

## 8. Valutazione complessiva di fattibilità

### 8.1 Dal punto di vista tecnico

- Tutte le richieste descritte in `fattibilita.md` sono:
  - compatibili tra loro
  - implementabili con le tecnologie attuali (Docker, orchestratori, secret manager, provider pagamenti).
- Il modello ibrido:
  - portali centralizzati + portali per‑agenzia con “richiesta di attivazione”
  - è robusto e si adatta bene ai diversi comportamenti dei portali immobiliari.

### 8.2 Dal punto di vista operativo

- Richiede:
  - un team con competenze DevOps per:
    - provisioning automatico
    - CI/CD per molte istanze
    - monitoring e logging centralizzati.
  - processi interni per:
    - gestione ticket
    - gestione abbonamenti
    - gestione attivazioni portali.

### 8.3 Dal punto di vista di prodotto

- Il risultato è un SaaS:
  - molto più solido di un gestionale “installato a mano” per ogni cliente.
  - con UX semplice per le agenzie (niente parametri tecnici, solo richieste e attivazioni).
  - con un pannello master che ti permette di:
    - governare tutte le istanze
    - controllare abbonamenti
    - gestire i portali in modo strutturato.

### 8.4 Rischi principali

- Complessità iniziale:
  - progettazione infrastruttura
  - sviluppo dashboard master
  - automazione provisioning.
- Costi di esercizio:
  - molti container/DB possono aumentare i costi cloud rispetto a un multi‑tenant puro.
- Dipendenza da portali:
  - alcuni portali potrebbero non supportare bene integrazioni partner o automatismi sofisticati.

### 8.5 Conclusione finale

Lo studio di fattibilità, esteso con tutte le richieste contenute in `fattibilita.md`, conferma che:

- il modello “un Docker per agenzia” con super‑dashboard, ticketing, abbonamenti e gestione portali è **fattibile**;
- il modello “richiesta di attivazione” per portali per‑agenzia è **generalizzabile a tutti i portali** dove non puoi essere partner unico;
- l’onboarding automatico di nuove agenzie, con creazione di istanze, configurazioni portali e flussi di pagamento, è **implementabile** con un effort significativo ma ben definito.

Si tratta di un progetto strutturato, da affrontare per fasi (MVP, poi estensioni), ma la direzione è coerente con un SaaS moderno e scalabile nel tempo.

---

## 9. Roadmap operativa e task dettagliati

Questa sezione traduce lo studio di fattibilità in una serie di task operativi dettagliati, organizzati per fasi. Ogni fase presuppone che le precedenti siano state completate.

### 9.1 Fase 0 – Preparazione e allineamento architetturale

1. Inventario stato attuale:
   - mappare configurazione esistente di:
     - portali
     - gestione agenzie
     - autenticazione
     - infrastruttura (server, Docker, DB).
2. Definizione stack infrastrutturale target:
   - scegliere ambiente cloud/hosting principale.
   - scegliere orchestratore:
     - Kubernetes, Docker Swarm, Nomad o script Docker automatizzati.
   - scegliere secret manager:
     - AWS/GCP/Azure o Vault, oppure soluzione equivalente.
3. Definizione ambienti:
   - definire environment:
     - `local`
     - `staging`
     - `production`.
   - stabilire:
     - naming convention per agenzie e istanze (`slug`).
     - naming convention per DB e container.
4. Allineamento ruoli e security:
   - definire ruoli interni:
     - `OWNER`, `OPS_ADMIN`, `SUPPORT`, `BILLING`.
   - definire ruoli agenzia:
     - `AGENCY_ADMIN`, eventuali ruoli operativi.
   - definire policy MFA e password per super‑dashboard.

### 9.2 Fase 1 – Modello dati e groundwork back‑end

5. Definire modello dati master (super‑dashboard):
   - entità `Agency`:
     - identificativo, dati fiscali, contatto, stato (`PENDING_PROVISIONING`, `ACTIVE`, `SUSPENDED`, ecc.).
   - entità `Instance`:
     - `agencyId`, `slug`, stato (`PROVISIONING`, `READY`, `ERROR`), endpoint URL.
   - entità `Subscription`:
     - legata ad `Agency`, con piano, limiti e stato.
   - entità `Ticket`:
     - `agencyId`, tipo, stato, storico messaggi.
   - entità `PortalActivationRequest`:
     - `agencyId`, `portalId`, stato (`OPEN`, `IN_PROGRESS`, `COMPLETED`, `BLOCKED`), note interne.
6. Definire modello dati nelle istanze agenzia:
   - verificare/estendere tabella `PortalConfig`:
     - `portalId`, stato (`NON_ATTIVO`, `IN_ATTIVAZIONE`, `ATTIVO`, `SOSPESO`), tipo (`CENTRALIZZATO`, `PER_AGENZIA`).
   - definire eventuale tabella per log portali locali se non esiste.
   - definire modello utente/ruoli per `AGENCY_ADMIN` e altri ruoli dell’agenzia.
7. Definire costanti/registro portali:
   - elenco portali supportati con:
     - `id`, `nome`, tipo (`CENTRALIZZATO` o `PER_AGENZIA`), impostazioni base.
   - garantire sincronizzazione tra:
     - super‑dashboard
     - codice delle istanze.

### 9.3 Fase 2 – Super‑dashboard base

8. Implementare autenticazione interna super‑dashboard:
   - login separato dal gestionale agenzia.
   - abilitare MFA per tutti gli utenti interni.
   - impostare RBAC con i ruoli interni definiti.
9. Implementare gestione agenzie:
   - schermata elenco agenzie:
     - filtro per stato.
     - accesso ai dettagli.
   - schermata dettagli agenzia:
     - dati anagrafici.
     - stato.
     - collegamento alla `Instance`.
     - collegamento a `Subscription`.
10. Implementare gestione istanze:
    - schermata elenco istanze:
      - `slug`, agenzia, stato, URL.
    - azioni:
      - visualizzare stato provisioning.
      - link di apertura istanza (solo se attiva).
11. Implementare gestione base abbonamenti:
    - schermata `Subscription` associata all’agenzia:
      - piano, prezzo, rinnovo, stato.
    - azioni:
      - aggiornare manualmente piano/stato.

### 9.4 Fase 3 – Provisioner e orchestration Docker

12. Definire template di stack per istanza agenzia:
    - creare configurazione parametrica per:
      - backend.
      - frontend.
      - DB.
    - definire variabili richieste:
      - `SLUG`, `DB_USER`, `DB_PASS`, `DB_NAME`, `JWT_SECRET`, `BASE_URL`, ecc.
13. Implementare servizio provisioner:
    - processo schedulato o worker che:
      - legge agenzie `PENDING_PROVISIONING`.
      - genera lo `slug`.
      - crea stack Docker utilizzando il template.
      - genera credenziali DB e le salva nel secret manager.
      - inizializza il DB:
        - migrazioni.
        - seed di base (incluso `PortalConfig`).
      - crea l’utente `AGENCY_ADMIN` iniziale.
      - aggiorna:
        - `Instance` (stato `READY`, URL).
        - `Agency` (stato `ACTIVE`).
14. Integrare il reverse proxy:
    - configurare Traefik/Nginx/Caddy per:
      - mappare `https://slug.tuo-saas.com` allo stack corrispondente.
      - generare certificati HTTPS (es. Let’s Encrypt).
    - collegare il provisioner alla configurazione del reverse proxy:
      - aggiunta di regole routing all’atto della creazione dell’istanza.

### 9.5 Fase 4 – Integrazione Stripe per abbonamenti

15. Preparare account Stripe:
    - creare prodotti e piani corrispondenti alle tipologie di abbonamento:
      - es. Basic, Pro, Enterprise.
    - definire eventuali add‑on:
      - portali extra.
      - utenti aggiuntivi.
16. Integrare Stripe lato pubblico:
    - creare pagina o flusso di acquisto:
      - utilizzo di Stripe Checkout o Billing Portal.
      - raccolta dati minimi per creare l’agenzia:
        - ragione sociale.
        - email amministratore.
    - alla conferma:
      - ricevere evento Stripe `checkout.session.completed` o `customer.subscription.created`.
17. Integrare Stripe con super‑dashboard:
    - implementare endpoint webhook Stripe:
      - eventi di interesse:
        - creazione abbonamento.
        - rinnovi.
        - pagamenti falliti.
        - cancellazioni.
      - mappare:
        - `customer` Stripe → `Agency`.
        - `subscription` Stripe → `Subscription`.
    - aggiornare automaticamente:
      - piano.
      - stato abbonamento.
18. Gestire scenari critici Stripe:
    - pagamento fallito:
      - aggiornare `Subscription.status` a `PAST_DUE`.
      - inviare notifica all’agenzia.
      - se la situazione persiste:
        - impostare `Agency.status = SUSPENDED`.
    - cancellazione:
      - impostare `Subscription.status = CANCELED`.
      - definire policy:
        - data di fine accesso.
19. Gestire upgrade/downgrade:
    - quando l’abbonamento cambia piano in Stripe:
      - aggiornare limiti e parametri nel DB.
      - eventualmente abilitare/disabilitare:
        - numero massimo di portali attivabili.
        - numero utenti interni.

### 9.6 Fase 5 – Flusso portali centralizzati

20. Implementare configurazione globale portali centralizzati:
    - in super‑dashboard:
      - schermata “Portali globali”.
      - per ogni portale centralizzato:
        - credenziali tecniche globali.
        - parametri di integrazione.
21. Implementare logica di attivazione lato agenzia:
    - nella UI istanza agenzia:
      - per portali di tipo `CENTRALIZZATO`:
        - mostrare toggle “Attiva/Sospendi”.
    - quando l’admin cambia stato:
      - aggiornare `PortalConfig.status`.
      - schedulare eventuali job iniziali di sync.
22. Implementare sync multi‑agenzia:
    - estendere logica di sincronizzazione portali:
      - ogni job di sync:
        - legge configurazione globale portale.
        - filtra agenzie con stato portale `ATTIVO`.
        - utilizza l’identificativo dell’agenzia nel feed per separare gli annunci.

### 9.7 Fase 6 – Flusso “richiesta di attivazione” portali per‑agenzia

23. Implementare UI richiesta attivazione nell’istanza agenzia:
    - pagina “Portali”:
      - per portali di tipo `PER_AGENZIA`:
        - pulsante “Richiedi attivazione”.
        - visualizzazione stato corrente:
          - `NON_ATTIVO`, `IN_ATTIVAZIONE`, `ATTIVO`, `SOSPESO`.
24. Implementare API tra istanza e super‑dashboard:
    - endpoint nell’istanza:
      - che crea una richiesta via API chiamando la super‑dashboard.
    - endpoint nella super‑dashboard:
      - che riceve la richiesta e crea `PortalActivationRequest`.
    - aggiornare `PortalConfig.status` a `IN_ATTIVAZIONE`.
25. Implementare gestione operativa nella super‑dashboard:
    - schermata elenco `PortalActivationRequest`:
      - filtri per portale, agenzia, stato.
      - possibilità di assegnare a un operatore.
    - schermata dettaglio richiesta:
      - dati dell’agenzia.
      - note.
      - campo per inserire credenziali tecniche ottenute dal portale.
26. Integrazione con secret manager:
    - quando l’operatore inserisce credenziali:
      - salvarle nel secret manager con chiavi legate all’istanza e al portale.
27. Aggiornamento istanza agenzia dopo attivazione:
    - la super‑dashboard chiama un’API interna dell’istanza:
      - per aggiornare `PortalConfig.status` a `ATTIVO`.
      - per salvare eventuali parametri non sensibili.
    - la richiesta `PortalActivationRequest` viene segnato come `COMPLETED`.
28. Abilitazione sync:
    - i job di sincronizzazione dell’istanza:
      - rilevano lo stato `ATTIVO` e l’esistenza di credenziali nel secret manager.
      - iniziano a pubblicare gli annunci sul portale specifico.

### 9.8 Fase 7 – Ticketing centrale

29. Implementare API ticket nelle istanze:
    - endpoint per creare un ticket verso la super‑dashboard:
      - parametri:
        - tipo (supporto tecnico, portale, billing).
        - descrizione.
30. Implementare ricezione ticket nella super‑dashboard:
    - endpoint che crea record `Ticket`:
      - associa `agencyId`.
      - stato iniziale `OPEN`.
31. Implementare UI ticket nella super‑dashboard:
    - lista globale di tutti i ticket.
    - filtri per:
      - agenzia.
      - tipo.
      - stato.
      - operatore assegnato.
    - sezione dettaglio ticket:
      - cronologia messaggi.
      - pulsanti per cambiare stato.
32. Implementare UI ticket lato agenzia:
    - lista ticket aperti/chiusi.
    - possibilità di aggiungere aggiornamenti.
    - visualizzazione stato in tempo reale.

### 9.9 Fase 8 – Hardening sicurezza e operatività

33. Implementare MFA e policy password in super‑dashboard:
    - MFA obbligatoria.
    - gestione dispositivo secondario e recovery.
34. Implementare IP allowlist per operazioni critiche:
    - limitare accesso alle funzionalità di provisioning e gestione abbonamenti a:
      - IP degli uffici.
      - IP della VPN interna.
35. Implementare audit log completo:
    - tracciare:
      - collegamenti alla super‑dashboard.
      - creazione/sospensione istanze.
      - modifiche porta portali.
      - modifiche `Subscription`.
    - conservare log per periodo definito.
36. Implementare monitoring centralizzato:
    - raccolta metriche per:
      - stato istanze.
      - errori di sync portali.
      - utilizzo risorse.
37. Implementare strategia backup e disaster recovery:
    - configurare backup automatici per DB di ogni istanza.
    - documentare procedure di ripristino:
      - per singola agenzia.
      - per intero cluster.

### 9.10 Fase 9 – Rollout e migrazione

38. Pianificare strategia di migrazione:
    - decidere ordine di migrazione delle agenzie esistenti verso il nuovo modello.
    - definire procedure per:
      - esportare dati da sistema attuale.
      - importarli nelle nuove istanze Docker.
39. Migrare agenzie pilota:
    - selezionare un gruppo ristretto di agenzie.
    - eseguire:
      - creazione istanza.
      - migrazione dati.
      - configurazione portali.
    - monitorare risultato.
40. Estendere la migrazione a tutte le agenzie:
    - iterare il processo raffinato sulle pilota.
    - gestire eventuali downtime pianificati.
41. Attivare definitivamente i flussi Stripe:
    - passare dalla gestione manuale degli abbonamenti a quella automatizzata.
    - dismettere eventuali sistemi precedenti di fatturazione.

Completati tutti i task elencati, l’intero gestionale opererà secondo l’architettura descritta nello studio di fattibilità, con:
- provisioning automatico per agenzia.
- super‑dashboard sicura.
- gestione portali ibrida.
- ticketing centralizzato.
- abbonamenti gestiti tramite Stripe.

---

## 10. Piano operativo dettagliato (step‑by‑step)

Questa sezione entra a livello ancora più operativo: per ogni area indica passi specifici da eseguire in ordine, includendo livelli applicativi (DB, backend, frontend, infrastruttura) e dipendenze tra task.

### 10.1 Modello dati master e istanze (DB e schema)

10.1.1 Definire modello dati master (super‑dashboard) in dettaglio:
- Aggiornare lo schema del database master aggiungendo tabelle:
  - `Agency`:
    - campi chiave:
      - `id` (chiave primaria).
      - `slug` univoco di riferimento.
      - `ragione_sociale`, `partita_iva`, `indirizzo`, `email_admin`.
      - `status` con valori ammessi: `PENDING_PROVISIONING`, `ACTIVE`, `SUSPENDED`, `CANCELED`.
      - `created_at`, `updated_at`.
  - `Instance`:
    - `id`, `agency_id` (FK verso `Agency`), `slug`, `base_url`.
    - `status`: `NONE`, `PROVISIONING`, `READY`, `ERROR`, `DECOMMISSIONED`.
    - `orchestrator_reference` (id stack Kubernetes/Docker).
    - `created_at`, `updated_at`.
  - `Subscription`:
    - `id`, `agency_id` (FK), `stripe_customer_id`, `stripe_subscription_id`.
    - `plan_code` (es. `basic`, `pro`, `enterprise`).
    - `status`: `ACTIVE`, `PAST_DUE`, `TRIALING`, `CANCELED`.
    - `current_period_end` (data fine periodo).
    - `created_at`, `updated_at`.
  - `Ticket`:
    - `id`, `agency_id`, `type`, `status`, `subject`, `created_by`.
    - `status`: `OPEN`, `IN_PROGRESS`, `DONE`, `BLOCKED`.
    - `created_at`, `updated_at`.
  - `TicketMessage`:
    - per ogni ticket:
      - `id`, `ticket_id`, `sender_type` (`AGENCY`, `STAFF`), `message`, `created_at`.
  - `PortalActivationRequest`:
    - `id`, `agency_id`, `portal_id`.
    - `status`: `OPEN`, `IN_PROGRESS`, `COMPLETED`, `BLOCKED`.
    - `assigned_to` (utente interno).
    - `notes`, `created_at`, `updated_at`.

10.1.2 Definire modello dati per istanze agenzia:
- Aggiornare schema DB dell’applicazione agenzia aggiungendo/normalizzando:
  - `PortalConfig`:
    - `id`, `agency_id` (se necessario), `portal_id`.
    - `type`: `CENTRALIZZATO` o `PER_AGENZIA`.
    - `status`: `NON_ATTIVO`, `IN_ATTIVAZIONE`, `ATTIVO`, `SOSPESO`.
    - eventuali parametri visibili all’agenzia (es. etichetta, eventuale codice pubblico).
  - eventuale `PortalLog`:
    - `id`, `portal_id`, `operation` (`SYNC`, `PUBLISH`, `UNPUBLISH`).
    - `status` (`SUCCESS`, `ERROR`), `message`, `created_at`.
  - tabelle utenti/ruoli:
    - assicurarsi che esista un ruolo `AGENCY_ADMIN` con permessi massimi sull’istanza.

10.1.3 Allineare migrazioni:
- Scrivere migrazioni DB per:
  - creare le nuove tabelle nel master.
  - creare/aggiornare tabelle nelle istanze agenzia.
- Verificare:
  - esecuzione corretta in ambiente di sviluppo.
  - idempotenza delle migrazioni.

### 10.2 Super‑dashboard – backend e API

10.2.1 Backend autenticazione interna:
- Implementare endpoint per:
  - login utenti interni (`POST /internal/auth/login`).
  - refresh token o sessione.
- Memorizzare utenti interni in tabella dedicata:
  - campi: `id`, `email`, `password_hash`, `role`, `mfa_secret`, `created_at`.
- Implementare MFA:
  - generazione `mfa_secret` (TOTP).
  - endpoint verifica codice TOTP.

10.2.2 API gestione agenzie:
- Implementare endpoint nel backend master:
  - `POST /internal/agencies`:
    - crea `Agency` + `Subscription` iniziale manuale (per ordini non Stripe).
  - `GET /internal/agencies`:
    - elenco con filtri per stato.
  - `GET /internal/agencies/{id}`:
    - dettaglio.
  - `PATCH /internal/agencies/{id}`:
    - aggiornamento dati anagrafici o stato.

10.2.3 API gestione istanze:
- Endpoint:
  - `GET /internal/instances`:
    - elenco con filtri per stato.
  - `GET /internal/instances/{id}`:
    - dettagli, incluso `orchestrator_reference`.
  - `POST /internal/instances/provision`:
    - crea una nuova istanza per `agency_id` fornito:
      - chiamato dal provisioner o manualmente per test.

10.2.4 API gestione Subscription:
- Endpoint:
  - `GET /internal/subscriptions` (filtrabile per stato/plan).
  - `GET /internal/subscriptions/{id}`.
  - `PATCH /internal/subscriptions/{id}`:
    - modifica manuale stato/piano in casi eccezionali.

10.2.5 API gestione PortalActivationRequest:
- Endpoint:
  - `GET /internal/portal-activation-requests`:
    - filtri: `portal_id`, `agency_id`, `status`.
  - `GET /internal/portal-activation-requests/{id}`:
    - dettaglio con log storico.
  - `PATCH /internal/portal-activation-requests/{id}`:
    - aggiornare `status`.
    - impostare `assigned_to`.
    - salvare `notes`.

### 10.3 Super‑dashboard – frontend e UX

10.3.1 Layout base:
- Creare applicazione frontend separata (o sezione) per super‑dashboard:
  - sidebar con sezioni:
    - Agenzie.
    - Istanze.
    - Portali globali.
    - Richieste portali.
    - Ticket.
    - Abbonamenti.

10.3.2 Schermata elenco agenzie:
- Tabella con colonne:
  - nome agenzia, slug, stato, piano, data creazione.
- Azioni rapide:
  - apri dettagli.
  - crea istanza (se mancante).
  - sospendi/riattiva agenzia.

10.3.3 Schermata dettaglio agenzia:
- Sezioni:
  - Dati aziendali (modificabili).
  - Istanza associata:
    - stato, URL, pulsante “Apri istanza”.
  - Abbonamento:
    - piano, prezzo, stato, data rinnovo.
  - Portali:
    - elenco portali con stato attuale.
    - link per aprire eventuali `PortalActivationRequest`.
  - Ticket:
    - elenco ultimi ticket collegati.

10.3.4 Schermata richieste portali:
- Tabella con:
  - agenzia, portale, stato, assegnatario, data creazione.
- Filtri multipli:
  - per portale.
  - per stato.
  - per operatore.
- Vista dettaglio:
  - mostra note interne.
  - pulsante per impostare stato `IN_PROGRESS`.
  - form per inserire note e confermare `COMPLETED`.

### 10.4 Provisioner e orchestrazione Docker

10.4.1 Template stack istanza:
- Creare un template (ad esempio `agency-stack-template.yml` o chart Helm) con:
  - servizio backend:
    - immagine docker corrente del backend.
    - variabili: `DATABASE_URL`, `JWT_SECRET`, `BASE_URL`, ecc.
  - servizio frontend:
    - immagine frontend.
    - variabile: `API_BASE_URL`.
  - servizio DB:
    - immagine (es. PostgreSQL).
    - volume dati.

10.4.2 Implementare servizio provisioner:
- Implementare un servizio (microservizio separato o job schedulato) che:
  - interroga il DB master per agenzie con stato `PENDING_PROVISIONING`.
  - per ciascuna:
    - genera `slug` se non presente.
    - genera credenziali DB e le scrive nel secret manager.
    - invoca l’orchestratore (API Kubernetes o Docker) per:
      - creare stack a partire dal template.
      - passare i parametri specifici.
    - attende che i pod/container risultino in stato `READY`.
    - lancia migrazioni DB sull’istanza:
      - esecuzione comando (es. `npm run prisma:migrate`) all’interno del container backend.
    - crea utente `AGENCY_ADMIN` usando API interne dell’istanza (o direttamente nel DB).
    - popola `PortalConfig` con i portali predefiniti tramite script di seed.
    - aggiorna:
      - `Instance` con `base_url` e `status = READY`.
      - `Agency.status = ACTIVE`.

10.4.3 Logging e retry:
- Ogni operazione del provisioner:
  - registra log dettagliato (DB o sistema di log centralizzato).
  - in caso di errore:
    - imposta `Instance.status = ERROR`.
    - memorizza motivo.
    - invia notifica al team.

### 10.5 Integrazione Stripe – dettagli operativi

10.5.1 Configurazione prodotti e prezzi:
- Creare in Stripe:
  - un `Product` per il gestionale.
  - più `Price` associati:
    - es. mensile/annuale per piani Basic, Pro, Enterprise.
- Annotare gli `id` dei `Price` in una configurazione del backend master.

10.5.2 Flusso di acquisto:
- Creare endpoint nel backend pubblico:
  - `POST /public/checkout/create-session`:
    - input: piano scelto, dati minimi agenzia (email, ragione sociale).
    - azioni:
      - creare un `Customer` Stripe se non esiste per l’email.
      - creare una `CheckoutSession` con:
        - `mode = subscription`.
        - `success_url` e `cancel_url`.
        - metadata con:
          - nome agenzia.
          - email admin.
    - restituisce l’URL di Stripe Checkout.

10.5.3 Webhook Stripe:
- Implementare endpoint:
  - `POST /stripe/webhook`.
- Gestire eventi principali:
  - `checkout.session.completed`:
    - leggere metadata e `customer`, `subscription`.
    - creare `Agency` se non esiste.
    - creare `Subscription` con:
      - `stripe_customer_id`, `stripe_subscription_id`, `plan_code` derivato dal `Price`.
      - `status = ACTIVE` o `TRIALING`.
    - impostare `Agency.status = PENDING_PROVISIONING`.
  - `invoice.payment_failed`:
    - trovare `Subscription` collegata.
    - aggiornare `Subscription.status = PAST_DUE`.
    - opzionale: inviare email all’agenzia.
  - `customer.subscription.deleted` o `canceled`:
    - aggiornare `Subscription.status = CANCELED`.
    - impostare politica di scadenza accesso.

10.5.4 Collegamento con provisioner:
- Il provisioner deve:
  - monitorare agenzie con `status = PENDING_PROVISIONING` create via webhook.
  - eseguire provisioning come descritto nella sezione 10.4.

### 10.6 Portali centralizzati – implementazione dettagliata

10.6.1 Registro portali globali:
- Implementare un registro (config) con:
  - `portalId`, `nome`, `type = CENTRALIZZATO`, endpoint API/feed.
- Memorizzare credenziali globali:
  - in secret manager, chiave per portale.

10.6.2 UI super‑dashboard per portali globali:
- Pagina “Portali globali”:
  - elenco portali centralizzati.
  - form per inserire/aggiornare credenziali:
    - user, password, API key, endpoint.
  - test di connessione:
    - pulsante “Test connessione” che esegue una chiamata di prova.

10.6.3 Logica di attivazione lato istanza:
- Nella UI agenzia:
  - per portali `CENTRALIZZATO`:
    - toggle che chiama API dell’istanza:
      - `PATCH /agency/portals/{portalId}` con `status = ATTIVO` o `SOSPESO`.
- Nei job di sync:
  - caricare:
    - configurazione globale dal master o da config centralizzata.
    - `PortalConfig` locale.
  - costruire feed/ API call includendo:
    - identificatore agenzia.
    - dati annunci.

### 10.7 Portali per‑agenzia – implementazione dettagliata

10.7.1 UI richiesta attivazione:
- Nella pagina portali dell’istanza:
  - per portali con `type = PER_AGENZIA`:
    - mostrare bottone “Richiedi attivazione”.
    - quando lo stato è `IN_ATTIVAZIONE`, disabilitare bottone e mostrare messaggio “In lavorazione dal team”.

10.7.2 API dalla istanza alla super‑dashboard:
- Endpoint istanza:
  - `POST /internal/master/portal-activation-request`:
    - payload:
      - `portalId`, eventuali note.
  - questo endpoint chiama la super‑dashboard con credenziali interne per creare record `PortalActivationRequest`.
- Aggiornare `PortalConfig.status = IN_ATTIVAZIONE` dopo la creazione della richiesta.

10.7.3 Gestione credenziali per‑agenzia:
- Nella super‑dashboard:
  - nella schermata dettaglio `PortalActivationRequest`:
    - form per inserire credenziali ricevute dal portale.
  - alla conferma:
    - salvare credenziali nel secret manager usando una chiave del tipo:
      - `portal/{portalId}/agency/{agencyId}`.
    - inviare chiamata verso istanza:
      - endpoint interno ad hoc per impostare `PortalConfig.status = ATTIVO`.

10.7.4 Sync operativo:
- Nei job di sync dell’istanza:
  - per portali `PER_AGENZIA`:
    - se `PortalConfig.status = ATTIVO`:
      - recuperare credenziali dal secret manager.
      - inviare feed/annunci al portale.
    - in caso di errore:
      - loggare su `PortalLog`.
      - eventualmente creare un `Ticket` automatico nel master.

### 10.8 Ticketing centrale – implementazione dettagliata

10.8.1 API ticket lato istanza:
- Endpoint:
  - `POST /agency/support/tickets`:
    - creato dall’admin dell’agenzia.
    - dati: tipo, soggetto, descrizione.
  - il backend dell’istanza chiama API master:
    - `POST /internal/tickets` con:
      - `agencyId`, `type`, `subject`, `message iniziale`.

10.8.2 API ticket lato master:
- Endpoint:
  - `GET /internal/tickets` (con filtri).
  - `GET /internal/tickets/{id}`.
  - `POST /internal/tickets` (creazione da istanza).
  - `POST /internal/tickets/{id}/messages`:
    - aggiunge messaggio da staff.
  - `PATCH /internal/tickets/{id}`:
    - cambia stato, assegna operatore.

10.8.3 UI ticket:
- Nel master:
  - tabella completa con filtri.
  - vista dettaglio, chat stile “conversazione”.
- Nell’istanza:
  - elenco ticket dell’agenzia.
  - vista dettaglio, chat con staff.

### 10.9 Sicurezza, monitoring e backup – implementazione dettagliata

10.9.1 MFA e policy password:
- Integrare libreria TOTP nel backend master.
- UI per:
  - attivare MFA.
  - visualizzare QR code dell’app di autenticazione.
  - inserire codice di verifica.

10.9.2 IP allowlist:
- Introdurre meccanismo di verifica IP per:
  - endpoint critici (provisioning, cambio stato abbonamenti).
- Conservare lista IP ammessi in configurazione o DB.

10.9.3 Audit log:
- Creare tabella `AuditLog`:
  - `id`, `user_id`, `action`, `entity_type`, `entity_id`, `timestamp`, `ip`.
- Aggiungere log per:
  - login super‑dashboard.
  - creazione/modifica `Agency`, `Instance`, `Subscription`.
  - cambi di stato portali.
  - creazione e chiusura ticket.

10.9.4 Monitoring:
- Scegliere stack di monitoraggio:
  - es. Prometheus + Grafana, o servizio gestito.
- Esportare metriche da:
  - istanze Docker (CPU, RAM, errore 5xx, tempo risposta).
  - provisioner (numero istanze in errore).

10.9.5 Backup:
- Configurare:
  - job giornalieri di backup DB per ogni istanza.
  - retention delle copie (es. 30 giorni).
- Documentare:
  - procedura di restore.
  - procedure di test periodico dei backup.

### 10.10 Migrazione agenzie esistenti – operatività

10.10.1 Analisi dati legacy:
- Mappare struttura DB attuale delle agenzie.
- Definire mapping tra vecchie tabelle e nuovo schema.

10.10.2 Script di migrazione:
- Scrivere script che:
  - per ogni agenzia esistente:
    - crea record `Agency` e `Subscription` nel master.
    - invoca il provisioner per creare istanza.
    - migra dati dalla vecchia installazione alla nuova:
      - immobili, clienti, utenti, configurazioni base.

10.10.3 Test migrazione pilota:
- Eseguire migrazione su poche agenzie selezionate.
- Verificare:
  - integrità dei dati.
  - funzionamento portali.
  - funzionamento login e ruoli.

10.10.4 Migrazione completa:
- Pianificare finestre di manutenzione se necessarie.
- Comunicare ai clienti il passaggio.
- Eseguire migrazione batch.

10.10.5 Decommissioning vecchie installazioni:
- Dopo periodo di stabilizzazione:
  - spegnere infrastrutture legacy.
  - conservare backup finali.

---












