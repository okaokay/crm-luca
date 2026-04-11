# Report stato portali immobiliari collegati al gestionale

Questo documento è pensato per il **reparto commerciale** e riassume, in modo non tecnico, lo stato attuale delle integrazioni tra gestionale e portali immobiliari.

Per ogni portale indichiamo:
- se l’integrazione tecnica è già presente,
- cosa manca per averla “al 100%” in produzione,
- se è probabile che serva un accordo/commerciale o solo un’attivazione tecnica.

---

## 1. Portali già integrati tecnicamente

Questi portali sono **già supportati dal gestionale** a livello tecnico. Per portarli in produzione serve soprattutto configurazione e, dove indicato, accordo commerciale con il portale.

### 1.1 Trovit / Mitula / Nestoria / Nuroa

- Tipo: aggregatori di annunci (feed XML condiviso)
- Stato tecnico:
  - integrazione **già presente**: il gestionale genera un feed XML unico
  - in ambiente di test il feed risponde correttamente
- Cosa serve per usarli con i clienti:
  - esporre il gestionale su un dominio HTTPS pubblico
  - configurare la base URL pubblica dell’agenzia
  - attivare, per l’agenzia, i portali desiderati (Trovit, Mitula, Nestoria, Nuroa)
  - inviare al portale l’URL del feed e concordare la frequenza di lettura
- Accordo commerciale:
  - di solito **non** c’è un canone diretto per il feed
  - serve comunque un contatto/attivazione con ogni portale

### 1.2 GestionaleImmobiliare.it

- Tipo: feed XML + pacchetto dati compressi
- Stato tecnico:
  - integrazione **già presente** con due endpoint (XML e file compresso)
  - in test i feed funzionano; è richiesto un codice agenzia specifico
- Cosa serve per usarlo con i clienti:
  - per ogni agenzia: configurare il codice `giAgencyId`
  - esporre gli endpoint del gestionale su dominio HTTPS
  - inviare a GestionaleImmobiliare:
    - URL del feed XML
    - URL del pacchetto compresso
    - codice agenzia
    - frequenza di aggiornamento desiderata
- Accordo commerciale:
  - è un’integrazione B2B con un altro gestionale
  - va valutata una **partnership/accordo dedicato**

### 1.3 Facebook Marketplace (Meta Catalog)

- Tipo: feed CSV per catalogo Meta (Facebook)
- Stato tecnico:
  - integrazione **già presente**: il gestionale genera un CSV formato “catalogo prodotti”
  - test effettuati con esito positivo
- Cosa serve per usarlo con i clienti:
  - esporre il gestionale su dominio HTTPS
  - l’agenzia deve avere:
    - account Business/Meta
    - un catalogo configurato in cui usare il feed del gestionale come sorgente
  - selezionare il portal target “Facebook Marketplace” sugli immobili da pubblicare
- Accordo commerciale:
  - il feed in sé non costa
  - l’esposizione degli annunci dipende dalle regole e da eventuali campagne a pagamento di Meta

### 1.4 Immobiliare.it

- Tipo: integrazione **push** via API (il gestionale invia direttamente gli annunci)
- Stato tecnico:
  - integrazione **già presente**: esistono API dedicate nel gestionale
  - viene gestito lo stato di sincronizzazione per ogni annuncio (sincronizzato, errore, ecc.)
- Cosa serve per usarlo con i clienti:
  - per ogni agenzia configurare:
    - username, password, codice sorgente, endpoint forniti da Immobiliare.it
  - garantire che gli annunci abbiano tutti i campi obbligatori (prezzi, indirizzo/coordinate, immagini, ecc.)
  - facoltativo ma consigliato: job o coda per sincronizzazioni massicce
- Accordo commerciale:
  - **sì**, è necessario un contratto tra l’agenzia e Immobiliare.it
  - il gestionale è già pronto, ma senza credenziali ufficiali non si può pubblicare

### 1.5 Apimo.net

- Tipo: integrazione con altro gestionale (import/sync dati via API JSON)
- Stato tecnico:
  - integrazione **già presente**: il gestionale può importare immobili/contatti/richieste da Apimo
  - esistono API di configurazione e di sincronizzazione
- Cosa serve per usarlo con i clienti:
  - per ogni agenzia configurare:
    - provider, token, identificativo agenzia rilasciati da Apimo
  - programmare job di sincronizzazione periodica (delta o full)
- Accordo commerciale:
  - l’agenzia deve essere cliente Apimo (possesso di token/credenziali)
  - è un’integrazione utile per migrare o mantenere allineati i dati con Apimo

---

## 2. Portali presenti solo a livello di interfaccia

Nel gestionale alcuni portali compaiono già nelle schermate (come opzioni di pubblicazione), ma **non hanno ancora l’integrazione tecnica**.

Portali in questa situazione:
- Idealista.it
- Casa.it
- Subito.it
- Wikicasa.it

Per questi portali:
- l’utente può selezionare il portale nella scheda immobile,
- ma **oggi non avviene nessuna pubblicazione reale**:
  - non vengono generati feed dedicati
  - non vengono chiamate API dei portali

Per portarli al 100%:
- serve ottenere e studiare le specifiche tecniche di ciascun portale (feed o API),
- sviluppare e testare il backend dedicato,
- stipulare gli eventuali accordi commerciali con ogni portale.

Dal punto di vista commerciale:
- sono utili per mostrare una **roadmap** (“portali in arrivo”),
- non vanno venduti come già funzionanti fino al completamento dello sviluppo.

---

## 3. Elenco portali aggiuntivi “gratuiti / da account”

Nel sistema è presente una lista estesa di portali indicati come “gratuiti” (in base a uno screenshot di un competitor), ad esempio:

- ProssimaCasa
- Gazzetta Immobiliare
- GoHome
- OffroCero
- CheAnnunci.it
- TrovaCasa.net
- ImmobiliarePrima
- AnnunciCasa
- ImmobilImpresa.net
- Affitto.it
- CercasiCasa
- LinkBiz
- Liguria Immobiliare
- Mercatino Annunci
- 24oreannunci.it
- Kijiji
- TuttoCasa.it
- Occhi Magazine
- TorinoAffari
- ioaffitto.it

Per tutti questi portali:
- oggi **non esiste ancora una vera integrazione tecnica** (né feed né API dedicata),
- nel documento interno risultano:
  - non operativi
  - “richiede account/attivazione”
  - “indicato come gratuito” rispetto a un competitor

Cosa significa operativamente:
- si tratta di **potenziali integrazioni future**,
- per ognuno andrebbe:
  - verificata l’effettiva gratuità o eventuali condizioni commerciali,
  - concordato il formato (feed standard o API proprie),
  - sviluppato il relativo connettore nel gestionale.

Messaggio per il commerciale:
- questi portali possono essere posizionati come:
  - “lista di portali gratuiti che possiamo integrare su richiesta”,
  - o come parte di un eventuale pacchetto “molti portali inclusi”.
- prima di prometterli come attivi, serve però:
  - verificare i dettagli con i singoli portali,
  - pianificare il tempo di sviluppo.

---

## 4. Sintesi per il reparto commerciale

1. **Portali subito vendibili come funzionalità attiva**
   - Trovit, Mitula, Nestoria, Nuroa
   - GestionaleImmobiliare.it
   - Facebook Marketplace (Meta Catalog)
   - Immobiliare.it
   - Apimo.net
   - Richiedono configurazione tecnica e, in alcuni casi, accordo commerciale.

2. **Portali presenti solo in interfaccia (UI), non ancora collegati**
   - Idealista.it, Casa.it, Subito.it, Wikicasa.it
   - Vanno presentati come elementi di roadmap, non come integrazioni pronte.

3. **Portali “gratuiti” aggiuntivi**
   - Ampia lista di portali minori/regionali, oggi non integrati.
   - Possono diventare un forte argomento commerciale se si pianifica lo sviluppo dei connettori.

In sintesi, il gestionale ha già una **base solida di integrazioni attive** e una **lista ampia di portali potenziali** che possono essere usati nella strategia commerciale (come valore immediato o come roadmap di crescita del prodotto).

