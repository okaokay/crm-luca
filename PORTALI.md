# Portali immobiliari – stato attuale, test e attivazione

Questo documento descrive:
- quali portali sono **attivi** oggi nel progetto (backend già presente),
- come **testare** feed/config/sync (anche con Postman),
- cosa serve per portarli “**al 100%**” in produzione,
- quali portali sono **solo in UI** (manca backend) e cosa bisogna implementare.

## Situazione attuale (operativi vs autorizzazione)

Definizioni rapide:
- **Operativo subito**: esiste già un endpoint (feed o sync) e lo puoi testare subito dal CRM.
- **Richiede autorizzazione**: per pubblicare “sul serio” serve attivazione lato portale e/o credenziali ufficiali.

| Portal ID | Nome | Modalità | Operativo subito | Richiede autorizzazione | Note |
|---|---|---|---|---|---|
| `TROVIT_IT` | Trovit.it | feed pull | sì | sì (attivazione feed) | stesso feed per più aggregatori |
| `MITULA` | Mitula | feed pull | sì | sì (attivazione feed) | usa `/feeds/trovit.xml` |
| `NESTORIA` | Nestoria | feed pull | sì | sì (attivazione feed) | usa `/feeds/trovit.xml` |
| `NUROA` | Nuroa | feed pull | sì | sì (attivazione feed) | usa `/feeds/trovit.xml` |
| `GESTIONALE_IMMOBILIARE_IT` | GestionaleImmobiliare.it | feed pull (+ tar.gz) | sì | sì (attivazione feed) | tar.gz richiede `giAgencyId` |
| `IMMOBILIARE_IT` | Immobiliare.it | sync push | sì (endpoint CRM) | sì (credenziali) | richiede `immo*` config agenzia |
| `IDEALISTA_IT` | Idealista.it | (da definire) | no | sì | manca backend |
| `CASA_IT` | Casa.it | (da definire) | no | sì | manca backend |
| `SUBITO_IT` | Subito.it | (da definire) | no | sì | manca backend |
| `WIKICASA_IT` | Wikicasa.it | (da definire) | no | sì | manca backend |
| `FACEBOOK_MARKETPLACE` | Facebook Marketplace | feed pull (Meta catalog CSV) | sì | sì (catalogo Meta) | endpoint `/feeds/meta_catalog.csv` |
| `APIMO_NET` | Apimo.net | sync API (JSON) | sì (pull) | sì (provider+token) | config + pull in `/api/config/apimo` e `/api/sync/apimo/pull` |
| `PROSSIMACASA_IT` | ProssimaCasa | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `GAZZETTA_IMMOBILIARE_IT` | Gazzetta Immobiliare | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `GOHOME_IT` | GoHome | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `OFFROCERO_IT` | OffroCero | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `CHEANNUNCI_IT` | CheAnnunci.it | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `TROVACASA_NET` | TrovaCasa.net | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `IMMOBILIAREPRIMA_IT` | ImmobiliarePrima | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `ANNUNCI_CASA_IT` | AnnunciCasa | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `IMMOBILIMPRESA_NET` | ImmobilImpresa.net | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `AFFITTO_IT` | Affitto.it | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `CERCASICASA_IT` | CercasiCasa | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `LINKBIZ_IT` | LinkBiz | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `LIGURIA_IMMOBILIARE_IT` | Liguria Immobiliare | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `MERCATINOANNUNCI_IT` | Mercatino Annunci | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `ANNUNCI24ORE_IT` | 24oreannunci.it | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `KIJIJI_IT` | Kijiji | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `TUTTOCASA_IT` | TuttoCasa.it | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `OCCHI_MAGAZINE` | Occhi Magazine | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `TORINOAFFARI_IT` | TorinoAffari | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |
| `IOAFFITTO_IT` | ioaffitto.it | (da definire) | no | sì (attivazione/account) | indicato come “gratuito” (screenshot competitor) |

## Concetti base

### `portalTargets` (per-immobile)
Ogni immobile ha un array `portalTargets` che indica su quali portali deve essere pubblicato.
- Backend/DB: `Property.portalTargets String[]` in `packages/backend/prisma/schema.prisma`
- Frontend: selezione portali nella modale immobile (lista `portalOptions`)

Il backend usa `portalTargets` per:
- includere/escludere immobili nei feed (Trovit/Mitula/Nestoria/Nuroa, GestionaleImmobiliare.it),
- decidere se mettere il nodo `<publish>` nell’XML inviato a Immobiliare.it.

### Convenzioni di stato per immobile/portale

Per ogni coppia (immobile, portale) usiamo queste convenzioni, basate su `PORTAL_REGISTRY` e sui campi di stato/sync.

- **Portali feed (kind = `FEED_PULL`)**
  - **Selezionato**: `portalTargets` contiene `portalId`.
  - **Requisiti minimi soddisfatti**: tutti i `requirements` definiti nel registry per quel portale risultano veri per l’immobile:
    - `price`: almeno uno tra `salePrice` o `rentPrice` > 0 in base a `contractType`.
    - `image`: almeno 1 URL in `images[]`.
    - `giComuneIstat`: campo `giComuneIstat` valorizzato.
    - `giListingId`: campo `giListingId` valorizzato (intero valido).
    - `location`: coordinate (`latitude`/`longitude`) valorizzate **oppure** `giComuneIstat` valido a 6 cifre.
  - **Stato per immobile/portale feed**:
    - `NOT_SELECTED`: `portalTargets` **non** contiene `portalId`.
    - `SELECTED`: `portalTargets` contiene `portalId`, ma almeno un requisito non è soddisfatto.
    - `POTENTIAL`: `portalTargets` contiene `portalId` **e** tutti i requisiti sono soddisfatti.
    - `PUBLISHED` (interpretazione): come `POTENTIAL`, ma con `isPublished = true` sull’immobile; corrisponde agli immobili che verrebbero effettivamente inclusi nel feed generato in condizioni normali.

- **IMMOBILIARE_IT (kind = `SYNC_PUSH`)**
  - **Selezionato**: `portalTargets` contiene `IMMOBILIARE_IT`.
  - **Stato reale di sync**: usiamo i campi:
    - `immoSyncStatus`: `NOT_SYNCED | SYNCED | ERROR`.
    - `immoLastError`: stringa con l’ultimo errore (se presente).
  - **Stato per immobile/portale IMMOBILIARE_IT**:
    - `NOT_SELECTED`: `portalTargets` **non** contiene `IMMOBILIARE_IT` (indipendentemente da `immoSyncStatus`).
    - `NOT_SYNCED`: selezionato e `immoSyncStatus = NOT_SYNCED`.
    - `SYNCED`: selezionato e `immoSyncStatus = SYNCED`.
    - `ERROR`: selezionato e `immoSyncStatus = ERROR` (dettaglio in `immoLastError`).

- **APIMO_NET (kind = `PROXY`)**
  - Lato agenzia, la configurazione è definita da:
    - `Agency.apimoProvider`, `Agency.apimoToken`, `Agency.apimoAgencyId`.
  - Lato immobile, usiamo:
    - `apimoPushStatus`: `NOT_SYNCED | SYNCED | ERROR`.
    - `apimoLastPushError`: ultimo errore sul push/sync (se presente).
  - **Stato per immobile/portale APIMO_NET**:
    - `NOT_CONFIGURED`: configurazione agenzia non completa (uno o più tra `apimoProvider`, `apimoToken`, `apimoAgencyId` mancanti).
    - `CONFIGURED`: configurazione completa e `apimoPushStatus = NOT_SYNCED`.
    - `PULLING` (o `SYNCED` lato stato locale): configurazione completa e `apimoPushStatus = SYNCED`.
    - `ERROR`: configurazione completa e `apimoPushStatus = ERROR` (dettaglio in `apimoLastPushError`).

- **Portali manuali (kind = `MANUAL`)**
  - Non esiste integrazione tecnica; lo stato è puramente “intenzione di pubblicazione”.
  - **Stato per immobile/portale manuale**:
    - `NOT_SELECTED`: `portalTargets` **non** contiene `portalId`.
    - `SELECTED`: `portalTargets` contiene `portalId`.

Queste convenzioni devono essere usate in tutte le API statistiche e nella UI (scheda immobile e pagina Portali) per calcolare/mostrare in modo uniforme:
- immobili selezionati per un portale;
- immobili potenzialmente pubblicabili o pubblicati (per i feed);
- stato di sincronizzazione reale per i portali a sync (Immobiliare.it, Apimo).

### Tipi integrazione
- **Feed (pull)**: il portale legge un URL del CRM (XML o tar.gz). In questa modalità il CRM “espone” un endpoint pubblico.
- **Sync (push)**: il CRM invia dati al portale via API (serve credenziale/autorizzazione).

## Portali ATTIVI (backend implementato)

### 1) Trovit / Mitula / Nestoria / Nuroa (FEED pull)

**Endpoint**
- `GET /feeds/trovit.xml`

**Target che attivano il feed (filtri)**
- `TROVIT_IT`, `MITULA`, `NESTORIA`, `NUROA`

**Filtri**
- di default include solo immobili con `portalTargets` contenente almeno uno dei target sopra
- per includere tutto: `?all=1` (o `?all=true`)

**Campi minimi consigliati per test**
- `title`, `address`, `city`, `zipCode`, `contractType`
- prezzo: `salePrice` o `rentPrice` coerente con `contractType`
- immagini: almeno 1 URL in `images[]` (consigliato)

**Test rapidi (browser)**
- `http://localhost:PORT/feeds/trovit.xml?all=1`

---

### 2) GestionaleImmobiliare.it (FEED pull + pacchetto sync tar.gz)

**Endpoint**
- `GET /feeds/gestionaleimmobiliare.xml`
- `GET /feeds/gestionale_sync.tar.gz`

**Target**
- `GESTIONALE_IMMOBILIARE_IT`

**Configurazione agenzia**
- `giAgencyId` (obbligatorio per `gestionale_sync.tar.gz`)
  - API config: `GET/PUT /api/config/gestionaleimmobiliare`

**Filtri**
- di default include solo immobili con:
  - `portalTargets` contiene `GESTIONALE_IMMOBILIARE_IT`
  - `giComuneIstat` valorizzato
- per includere tutto: `?all=1`

**Campi minimi consigliati per test (senza `?all=1`)**
- `giComuneIstat` (codice ISTAT a 6 cifre)
- come sopra: `title/address/city/zipCode`, prezzo coerente, immagini consigliate

**Nota**
Il pacchetto `gestionale_sync.tar.gz` contiene un file `dataset_<giAgencyId>.xml`.

**Attivazione su Gestionale (pratica)**
- Preparare un URL pubblico HTTPS per:
  - `.../feeds/gestionaleimmobiliare.xml` (feed XML)
  - `.../feeds/gestionale_sync.tar.gz` (pacchetto scaricabile)
- Inviare a Gestionale:
  - URL feed/tar.gz
  - frequenza di aggiornamento desiderata
  - `giAgencyId` (se richiesto nel naming/file, è già usato dal CRM per generare `dataset_<giAgencyId>.xml`)

---

### 3) Facebook Marketplace (Meta Catalog CSV) (FEED pull)

**Endpoint**
- `GET /feeds/meta_catalog.csv`

**Target**
- `FACEBOOK_MARKETPLACE`

**Filtri**
- di default include solo immobili con `portalTargets` contenente `FACEBOOK_MARKETPLACE`
- per includere tutto: `?all=1` (o `?all=true`)

**Campi minimi consigliati per test (senza `?all=1`)**
- almeno uno tra `salePrice` o `rentPrice` > 0
- immagini: almeno 1 URL in `images[]`

**Test rapidi (browser)**
- `http://localhost:PORT/feeds/meta_catalog.csv?all=1`

---

### 4) Immobiliare.it (SYNC push via API)

Questa integrazione è “push”: il CRM invia un XML all’endpoint di Immobiliare.it.

**Endpoint CRM**
- Sync (write): `PUT /api/immobiliareit/properties/:id`
- Delete: `DELETE /api/immobiliareit/properties/:id`

**Configurazione agenzia (obbligatoria)**
- `immoUsername`
- `immoPassword`
- `immoSource` (header `X-IMMO-SOURCE`)
- `immoEndpoint` (URL API ricevente)
  - API config: `GET/PUT /api/config/immobiliareit`

**Stato sync per immobile**
- `immoSyncStatus`: `NOT_SYNCED | SYNCED | ERROR`
- `immoLastSyncAt`, `immoLastError`, `immoListingId`

**Requisiti minimi per un test di sync**
- `giListingId` presente (unique-id usato nell’XML; è autoincrement nel DB)
- almeno uno tra `salePrice` o `rentPrice` > 0
- localizzazione:
  - `latitude` e `longitude` valorizzati **oppure**
  - `giComuneIstat` valido a 6 cifre
- `agency.email` valorizzata

---

### 5) APIMO.net (SYNC pull via API JSON)

Questa integrazione è “pull”: il CRM importa i dati da APIMO via API e li salva localmente.

**Endpoint CRM**
- Config: `GET/PUT /api/config/apimo`
- Stato: `GET /api/sync/apimo/status`
- Pull (delta): `POST /api/sync/apimo/pull`
- Pull (full): `POST /api/sync/apimo/pull?full=1`

**Configurazione agenzia (obbligatoria)**
- `apimoProvider`
- `apimoToken`
- `apimoAgencyId`

**Dove finisce il dato**
- Log tecnico: tabella `apimo_records` (payload JSON)
- Mapping locale:
  - immobili → `properties` (quando presenti i campi minimi address/city/province/zipCode)
  - contatti/lead → `contacts` (type `LEAD`)
  - richieste → `requests` (collegate al contatto se identificabile)

## Configurazione e base URL pubblica (fondamentale per i feed)

I feed generano link verso pagine pubbliche del sito usando una base URL:
- priorità: `Agency.publicBaseUrl` (salvata a DB) → `PUBLIC_BASE_URL` (env) → URL calcolato dalla request

**API**
- `GET/PUT /api/config/public-base-url`

**UI**
In Impostazioni c’è la sezione “Link Pubblici” e “Feed Portali”.

## Test: checklist (prima di “andare live”)

### A) Prerequisiti locali
1. Avvia backend e database (Docker o servizi locali)
2. Verifica che l’API risponda:
   - `GET http://localhost:PORT/api/health`
3. Crea almeno 1 immobile con campi minimi e `portalTargets` coerenti

### B) Test feed (pull)
1. `GET /feeds/trovit.xml?all=1` deve restituire XML con `<trovit>...</trovit>`
2. `GET /feeds/gestionaleimmobiliare.xml?all=1` deve restituire XML con `<dataset>...</dataset>`
3. `GET /feeds/meta_catalog.csv?all=1` deve restituire CSV con intestazione e righe immobili
4. Se `giAgencyId` è configurato:
   - `GET /feeds/gestionale_sync.tar.gz?all=1` deve restituire content-type gzip e un file scaricabile

### C) Test sync Immobiliare.it (push)
1. Configura `immoEndpoint` + credenziali (anche fittizie per vedere l’errore gestito)
2. `PUT /api/immobiliareit/properties/:id`:
   - con credenziali errate o endpoint non raggiungibile → deve andare in `ERROR` e valorizzare `immoLastError`
   - con credenziali corrette e risposta ok → deve andare in `SYNCED` e salvare `immoListingId` se presente nella risposta XML

## Test con Postman (consigliato)

Scegli una base URL:
- `http://localhost:PORT` (PORT dipende da `packages/backend/.env`, spesso `3001`)

### 1) Health check
- Method: `GET`
- URL: `{{baseUrl}}/api/health`

### 2) Leggere/salvare Base URL pubblica
- `GET {{baseUrl}}/api/config/public-base-url`
- `PUT {{baseUrl}}/api/config/public-base-url`
  - Body JSON:
    ```json
    { "publicBaseUrl": "https://www.tuosito.it" }
    ```

### 3) Config GestionaleImmobiliare.it
- `GET {{baseUrl}}/api/config/gestionaleimmobiliare`
- `PUT {{baseUrl}}/api/config/gestionaleimmobiliare`
  - Body JSON:
    ```json
    { "giAgencyId": 12345 }
    ```

### 4) Config Immobiliare.it
- `GET {{baseUrl}}/api/config/immobiliareit`
- `PUT {{baseUrl}}/api/config/immobiliareit`
  - Body JSON:
    ```json
    {
      "immoUsername": "USER",
      "immoPassword": "PASS",
      "immoSource": "SOURCE",
      "immoEndpoint": "https://example.com/immobiliare-endpoint"
    }
    ```

### 5) Test feed
- `GET {{baseUrl}}/feeds/trovit.xml?all=1`
- `GET {{baseUrl}}/feeds/gestionaleimmobiliare.xml?all=1`
- `GET {{baseUrl}}/feeds/meta_catalog.csv?all=1`
- `GET {{baseUrl}}/feeds/gestionale_sync.tar.gz?all=1`

### 6) Trigger sync Immobiliare.it
- `PUT {{baseUrl}}/api/immobiliareit/properties/{{propertyId}}`
- `DELETE {{baseUrl}}/api/immobiliareit/properties/{{propertyId}}`

## Test via PowerShell (senza Postman)

```powershell
$base = "http://localhost:3001"

Invoke-RestMethod "$base/api/health"
Invoke-RestMethod "$base/api/config/public-base-url"

Invoke-RestMethod "$base/feeds/trovit.xml?all=1" -Method Get
Invoke-RestMethod "$base/feeds/gestionaleimmobiliare.xml?all=1" -Method Get
Invoke-RestMethod "$base/feeds/meta_catalog.csv?all=1" -Method Get

# Scarica tar.gz (se giAgencyId configurato)
Invoke-WebRequest "$base/feeds/gestionale_sync.tar.gz?all=1" -OutFile ".\gestionale_sync.tar.gz"
```

## Esito test (locale) – 2025-12-30

Base usata: `http://localhost:3001`

- `GET /api/config/public-base-url` → 200 (publicBaseUrl: null, effectiveBaseUrl: `http://localhost:3001`)
- `GET /api/config/immobiliareit` → 200 (config vuota, `hasPassword: false`)
- `GET /api/config/gestionaleimmobiliare` → 200 (`giAgencyId: null`)
- `GET /feeds/trovit.xml?all=1` → 200 (`application/xml`)
- `GET /feeds/gestionaleimmobiliare.xml?all=1` → 200 (`application/xml`)
- `GET /feeds/meta_catalog.csv?all=1` → 200 (`text/csv`)
- `GET /feeds/gestionale_sync.tar.gz?all=1` → 400 (`Missing giAgencyId config`)

## Attivazione “al 100%” (produzione): checklist

### Feed (pull)
- Esporre il backend su HTTPS pubblico (reverse proxy, ingress, ecc.)
- Impostare `Agency.publicBaseUrl` (o `PUBLIC_BASE_URL`) con dominio reale
- Verificare che `/public/property/:id` sia raggiungibile dal mondo esterno (il feed genera link)
- Valutare protezioni:
  - IP allowlist (se il portale ha IP fissi)
  - token in query string (se richiesto)
  - rate limiting e caching

### Sync (push) Immobiliare.it
- Ottenere credenziali ufficiali (username/password/source/endpoint)
- Verificare mapping campi obbligatori per i tuoi annunci reali (prezzi, coordinate/ISTAT, immagini)
- Introdurre un job/queue per sync massivi (se prevedi “sync di 100+ immobili”)
- Aggiungere UI stato/bottoni “Sincronizza / Rimuovi” (se vuoi gestione manuale da CRM)

## Portali presenti in UI ma SENZA backend (oggi)

Questi portali sono selezionabili in `portalTargets`, ma **non esiste** alcun:
- endpoint feed dedicato,
- endpoint di sync push,
- mapping specifico dei campi,
- configurazione agenzia dedicata.

Lista attuale UI:
- `IDEALISTA_IT`
- `CASA_IT`
- `SUBITO_IT`
- `WIKICASA_IT`

## Endpoint GET /api/portals e metriche base

L’endpoint `GET /api/portals` restituisce, per l’agenzia corrente (utente admin/agency admin), un payload del tipo:

- `data.effectiveBaseUrl`: base URL usata per costruire gli URL dei feed.
- `data.portals`: array di portali, uno per elemento di `PORTAL_REGISTRY`, con campi:
  - `id`, `label`, `kind`, `modeLabel`, `implemented`, `feedPath`, `requirements` (dal registry).
  - `feedUrl`: se `feedPath` è valorizzato, `effectiveBaseUrl + feedPath`.
  - `active`:
    - se esiste `PortalConfig(portalId, agencyId)` → usa `PortalConfig.active`;
    - altrimenti:
      - per `kind = MANUAL` → `false`;
      - per gli altri → `implemented`.
  - `selectedCount`:
    - numero di immobili dell’agenzia con `portalTargets` contenente `portalId`.
  - `publishedCount`:
    - per `FEED_PULL`: numero di immobili in stato `PUBLISHED` secondo le convenzioni del Task 5 (selezionati, requisiti soddisfatti, `isPublished = true`).
    - per `IMMOBILIARE_IT`: numero di immobili selezionati con `immoSyncStatus = SYNCED`.
    - per `APIMO_NET`: numero di immobili con configurazione agenzia completa e `apimoPushStatus = SYNCED`.
    - per portali `MANUAL`: numero di immobili con stato `SELECTED` (selezionati).
  - `errorCount`:
    - per `IMMOBILIARE_IT`: numero di immobili selezionati con `immoSyncStatus = ERROR`.
    - per `APIMO_NET`: numero di immobili con configurazione agenzia completa e `apimoPushStatus = ERROR`.
    - per altri portali: 0 (non esiste un concetto di errore per immobile centralizzato).

Queste metriche sono pensate per alimentare direttamente:
- la pagina indice “Portali” (divisione attivi/non attivi, badge di conteggio);
- future dashboard di riepilogo (totale annunci online, errori di sync, ecc.).

## Endpoint GET /api/portals/:portalId/stats

L’endpoint `GET /api/portals/:portalId/stats` restituisce, per l’agenzia corrente, un riepilogo quantitativo per il singolo portale.

- Input:
  - `portalId` come path param.
- Output:
  - `portalId`: id del portale.
  - `totalSelected`: numero di immobili dell’agenzia con `portalTargets` contenente `portalId`.
  - `totalPublished`:
    - per `FEED_PULL`: immobili selezionati con requisiti soddisfatti e `isPublished = true` (stato `PUBLISHED`).
    - per `IMMOBILIARE_IT`: immobili selezionati con `immoSyncStatus = SYNCED`.
    - per `APIMO_NET`: immobili con configurazione agenzia completa e `apimoPushStatus = SYNCED`.
    - per portali `MANUAL`: immobili selezionati (stato `SELECTED`).
  - `totalError`:
    - per `IMMOBILIARE_IT`: immobili selezionati con `immoSyncStatus = ERROR`.
    - per `APIMO_NET`: immobili con configurazione completa e `apimoPushStatus = ERROR`.
    - per altri portali: 0.
  - `totalNotPublishable`:
    - immobili selezionati che non soddisfano tutti i `requirements` definiti nel registry per quel portale (solo se il portale ha `requirements` non vuoti).
  - `requirementsSummary`:
    - oggetto con chiavi tra `price`, `image`, `giComuneIstat`, `location`, `giListingId`.
    - per ogni chiave:
      - `null` se il requisito non è presente nei `requirements` del portale o se `totalSelected = 0`;
      - altrimenti un numero tra 0 e 1 che rappresenta la percentuale di immobili selezionati che soddisfano quel requisito.

La logica delle metriche riutilizza le convenzioni di stato definite nella sezione “Convenzioni di stato per immobile/portale” e la definizione di `requirements` in `PORTAL_REGISTRY`.

## APIMO.net (gestionale esterno) – integrazione (sync API JSON)

Nel repository:
- `APIMO_NET` è selezionabile in UI come `portalTargets` (vedi [App.tsx](file:///d:/Downloadweb/crm%20luca/crm%20luca/packages/frontend/src/App.tsx)),
- esistono endpoint backend per configurazione e import (vedi [main.ts](file:///d:/Downloadweb/crm%20luca/crm%20luca/packages/backend/src/main.ts)).

Questa sezione è la documentazione operativa per collegare e sincronizzare con APIMO usando il loro Webservice:
- Specifiche generali: `https://apimo.net/it/api/webservice/`
- Base URL API: `https://api.apimo.pro`
- Autenticazione: **HTTP Basic Auth** con `provider:token`
- Formato: **JSON** (`Content-Type: application/json; charset=utf-8`)
- Limiti: 1000 richieste/giorno e 10 richieste/secondo

### Configurazione consigliata nel CRM

Parametri minimi da gestire (per agenzia):
- `apimoProvider` (stringa “provider” assegnata da APIMO)
- `apimoToken` (token assegnato da APIMO)
- `apimoAgencyId` (id numerico dell’agenzia APIMO da sincronizzare)

### Flussi di sincronizzazione (consigliati)

- Nel CRM al momento è implementato il **Pull (import APIMO → CRM)**. Il **Push (export CRM → APIMO)** è da implementare.

- **Pull (import APIMO → CRM)**:
  - utenti: `GET /agencies/{agency_id}/users`
  - contatti: `GET /agencies/{agency_id}/contacts`
  - immobili: `GET /agencies/{agency_id}/properties`
  - richieste: `GET /agencies/{agency_id}/requests`
  - lead: `GET /agencies/{agency_id}/leads`
- **Push (export CRM → APIMO)**:
  - creare immobile: `POST /agencies/{agency_id}/properties`
  - aggiornare immobile: `PUT /agencies/{agency_id}/properties/{property_id}`
  - inviare lead: `POST /agencies/{agency_id}/leads`
  - pubblicazione provider/portali APIMO (per singolo immobile):
    - lista provider collegati: `GET /agencies/{agency_id}/properties/{property_id}/providers`
    - concedere accesso: `POST /agencies/{agency_id}/properties/{property_id}/providers`
    - aggiornare info pubblicazione: `PUT /agencies/{agency_id}/properties/{property_id}/provider`

### Backend (endpoint CRM presenti)

- Config agenzia:
  - `GET /api/config/apimo`
  - `PUT /api/config/apimo`
- Stato sync (record importati e ultimo timestamp):
  - `GET /api/sync/apimo/status`
- Pull (import APIMO → CRM):
  - `POST /api/sync/apimo/pull` (delta: usa `apimoLastPullTimestamp`)
  - `POST /api/sync/apimo/pull?full=1` (full: ignora timestamp e importa tutto)

### Frontend (UI presente)

In “Impostazioni” c’è la sezione “APIMO.net” con:
- campi `Provider`, `Agency ID`, `Token`
- pulsanti `Pull (delta)` e `Pull (full)` per triggerare gli endpoint sopra

### Test con Postman (diretto contro APIMO)

Impostazioni base:
- Base URL: `https://api.apimo.pro`
- Authorization: **Basic Auth**
  - Username: `{{apimoProvider}}`
  - Password: `{{apimoToken}}`
- Header: `Content-Type: application/json`

Richieste di test consigliate:
- `GET https://api.apimo.pro/agencies`
- `GET https://api.apimo.pro/agencies/{{apimoAgencyId}}/properties?limit=1000&offset=0`
- `GET https://api.apimo.pro/agencies/{{apimoAgencyId}}/leads?limit=1000&offset=0`
- `GET https://api.apimo.pro/agencies/{{apimoAgencyId}}/requests?limit=1000&offset=0`
- `GET https://api.apimo.pro/agencies/{{apimoAgencyId}}/contacts?limit=1000&offset=0`
- `GET https://api.apimo.pro/agencies/{{apimoAgencyId}}/users?limit=1000&offset=0`

### Test via PowerShell (diretto contro APIMO)

```powershell
$provider = "PROVIDER"
$token = "TOKEN"
$agencyId = "123"

$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$provider`:$token"))
$headers = @{ Authorization = "Basic $auth"; "Content-Type" = "application/json" }

Invoke-RestMethod "https://api.apimo.pro/agencies" -Headers $headers -Method Get
Invoke-RestMethod "https://api.apimo.pro/agencies/$agencyId/properties?limit=1000&offset=0" -Headers $headers -Method Get
```

### Cosa manca (in pratica) per ciascuno
Per renderli “reali” servono (al minimo):
1. Definire lo **standard richiesto** dal portale (feed XML/JSON? API? file ZIP? SFTP?)
2. Implementare nel backend:
   - endpoint feed (`GET /feeds/<portale>.<ext>`) **oppure** client API (push)
   - validazioni campi obbligatori
   - eventuale configurazione agenzia (API key, account id, endpoint, ecc.) + `GET/PUT /api/config/<portale>`
3. Aggiornare UI:
   - form impostazioni (credenziali/config)
   - collegamento a link feed o pulsante di sync
   - (opzionale) stato sync per immobile come Immobiliare.it

### Suggerimento di roadmap (ordine consigliato)
1. Portali “feed” più semplici (se supportati): Idealista/Casa.it/Subito.it (dipende dagli standard disponibili)
2. Portali “API/push” con credenziali: Apimo, eventuali marketplace
3. Facebook Marketplace: spesso non è un feed diretto “classico”, può richiedere workflow dedicato
