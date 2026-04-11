# Deploy e upgrade CRM su Hostinger (Docker + Traefik) senza perdere dati

Questo documento descrive:
- come fare il **primo deploy** del gestionale su una VPS Hostinger usando Docker Manager;
- come eseguire un **upgrade di versione** (es. 1.0 → 1.1) senza cancellare i dati dei clienti.

Si basa sul file `docker-compose.prod.yml` già presente nel repository.

---

## 1. Architettura in produzione

- **Traefik**  
  Reverse proxy che espone solo la porta 80 verso internet e inoltra il traffico HTTP al frontend.

- **Frontend**  
  Container Nginx che serve l’app React (porta interna 3000) e fa proxy `/api` verso il backend.

- **Backend**  
  API Node/Express (porta interna 3001) che parla con Postgres, Redis e Minio sulla rete Docker interna.

- **Postgres (DB)**  
  Esegue il database `immobiliare_crm`. I dati sono salvati in un volume Docker:
  - `postgres_data:/var/lib/postgresql/data`

- **Redis**  
  Cache/queue (volume `redis_data`).

- **Minio**  
  Storage compatibile S3 (volume `minio_data`).

I volumi (`postgres_data`, `redis_data`, `minio_data`) sono **persistenti**: non vengono ricreati a ogni deploy.  
L’upgrade del gestionale aggiorna **solo il codice**, non questi volumi.

---

## 2. Configurazione dominio e variabili d’ambiente

### 2.1. DNS

Nel pannello DNS del dominio (es. provider dominio o Hostinger DNS):

- crea un record A:
  - nome: `crm` (o quello che preferisci)
  - valore: IP pubblico della VPS Hostinger
  - risultato: `crm.tuodominio.it` → IP VPS

### 2.2. Variabili d’ambiente principali

In Hostinger Docker Manager, nella sezione dello stack:

- `APP_DOMAIN`  
  Dominio usato dal cliente, ad esempio:
  - `APP_DOMAIN=crm.tuodominio.it`

- `POSTGRES_PASSWORD`  
  Password forte per l’utente `postgres`.

- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`  
  Credenziali di accesso a Minio.

- `JWT_SECRET`  
  Stringa lunga e casuale usata per firmare i token JWT.

Altri valori (`POSTGRES_DB`, `POSTGRES_USER`, ecc.) possono rimanere come da compose oppure essere personalizzati in coppia (env + `DATABASE_URL`).

---

## 3. Primo deploy su Hostinger

### 3.1. Preparazione repository

1. Assicurati che `docker-compose.prod.yml` sia aggiornato nel repository (branch usato da Hostinger).
2. Verifica che il nome dei volumi sia quello desiderato:
   - `postgres_data`
   - `redis_data`
   - `minio_data`

### 3.2. Deploy con Docker Manager

1. Apri Hostinger → Docker Manager → nuova app.
2. Scegli **Deploy from Compose file URL**.
3. Incolla l’URL grezzo (raw) al file `docker-compose.prod.yml` nel tuo repository (GitHub/GitLab).
4. Imposta le variabili d’ambiente (vedi sezione 2.2).
5. Avvia il deploy.

Docker farà:
- pull/build delle immagini,
- creazione dei container,
- creazione dei volumi persistenti (`postgres_data`, ecc.).

### 3.3. Verifica iniziale

1. Controlla lo stato dei container dallo UI di Hostinger (tutti “healthy”).
2. Apri il browser su `http://crm.tuodominio.it`:
   - verifica che l’app React si apra,
   - esegui login con le credenziali admin configurate,
   - verifica che puoi creare almeno:
     - un immobile di prova,
     - un contatto,
     - un utente.

Questi dati vengono salvati nel volume `postgres_data` e rimarranno dopo gli upgrade.

---

## 4. Regole d’oro per non perdere i dati

1. **Non cambiare i nomi dei volumi** in `docker-compose.prod.yml` in produzione:
   - lascia `postgres_data`, `redis_data`, `minio_data`.

2. **Non usare comandi che cancellano volumi**, ad esempio:
   - `docker compose down -v`
   - `docker volume rm ...`

3. **Non cambiare `DATABASE_URL`** del cliente in modo casuale:
   - se cambi host/DB, stai puntando a un database diverso (vuoto o di test).

4. **Disegna le migrazioni come evolutive**:
   - usare `prisma migrate` per aggiungere/alterare tabelle,
   - evitare script che fanno `DROP DATABASE` o `DROP TABLE` su tutto.

Finché queste regole sono rispettate, puoi aggiornare il gestionale quante volte vuoi senza cancellare i dati del cliente.

---

## 5. Backup del database prima di un upgrade

Prima di ogni upgrade importante (es. 1.0 → 1.1) è consigliato salvare un dump del database.

Passi generali (via SSH o terminale Hostinger, adattando i comandi al loro ambiente):

```bash
cd /percorso/dello/stack

docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U postgres immobiliare_crm > backup_immobiliare_crm_$(date +%Y%m%d).sql
```

Note:
- il file `.sql` così creato può essere scaricato e conservato;
- in caso di problemi gravi puoi ripristinare il DB usando `psql` e questo dump.

---

## 6. Upgrade alla versione 1.1 senza toccare i dati

### 6.1. Preparazione (su repository)

1. Sviluppa e testa la versione 1.1 in locale.
2. Assicurati che:
   - le migrazioni Prisma siano corrette (`prisma/migrations/...`),
   - nessuna migrazione distrugga dati esistenti.
3. Fai push del codice (backend, frontend, eventuali modifiche al compose) sul branch usato da Hostinger.

### 6.2. Check prima dell’upgrade in produzione

1. Conferma che `docker-compose.prod.yml` **non** abbia cambiato:
   - i nomi dei volumi,
   - il nome del servizio `postgres`.
2. Conferma che `DATABASE_URL` del backend punti ancora al DB di produzione del cliente.
3. Esegui il **backup DB** (vedi sezione 5).

### 6.3. Redeploy dello stack su Hostinger

1. Apri Hostinger → Docker Manager → app del cliente.
2. Avvia la funzione di **redeploy / rebuild** sul nuovo commit del repository (versione 1.1).
3. Hostinger:
   - ricostruirà le immagini backend/frontend,
   - riavvierà i container,
   - riutilizzerà i volumi esistenti (`postgres_data`, ecc.).

I dati del cliente rimangono nel volume `postgres_data`.

### 6.4. Applicare le migrazioni Prisma sul DB esistente

Dopo il redeploy:

1. Entra nel container backend (da terminale Hostinger o SSH).
2. Esegui:

```bash
cd /percorso/dello/stack

docker compose -f docker-compose.prod.yml exec backend \
  npx prisma migrate deploy
```

Questo comando:
- applica tutte le migrazioni pendenti al database esistente,
- aggiorna lo schema senza cancellare tabelle o righe (se le migrazioni sono ben scritte).

### 6.5. Verifica post-upgrade

1. Controlla la salute dei container (stato “healthy” o equivalente).
2. Apri `http://crm.tuodominio.it`:
   - fai login con l’utente del cliente,
   - verifica che:
     - immobili, contatti, utenti e impostazioni siano ancora presenti,
     - le nuove funzionalità della 1.1 funzionino (es. nuova pagina, nuovo campo).

Se tutto è ok, l’upgrade è completato.

---

## 7. Gestione di eventuali problemi dopo l’upgrade

### 7.1. Problemi applicativi (bug, errori ma DB integro)

Se dopo l’upgrade il codice ha bug ma i dati sono a posto:

1. Torna momentaneamente alla versione precedente:
   - in Hostinger seleziona il commit/branch della versione 1.0,
   - redeploy dello stack.
2. Se la versione 1.0 aveva uno schema DB diverso:
   - valuta se è necessario un rollback delle migrazioni (caso avanzato),
   - oppure se la 1.0 è compatibile con lo schema nuovo.

### 7.2. Problemi sul database (migrazione sbagliata)

Se una migrazione ha danneggiato lo schema o i dati:

1. Valuta se è possibile correggere con una nuova migrazione.
2. In caso estremo:
   - ripristina il dump SQL fatto prima dell’upgrade usando `psql`,
   - rifai l’upgrade con migrazioni corrette.

---

## 8. Checklist sintetica upgrade per singolo cliente

1. **Prima**
   - [ ] Verifica che `docker-compose.prod.yml` non cambi i nomi dei volumi.
   - [ ] Verifica che `DATABASE_URL` punti al DB corretto.
   - [ ] Esegui backup del DB con `pg_dump`.

2. **Durante**
   - [ ] Redeploy stack su Hostinger (nuovo commit/versione).
   - [ ] Esegui `npx prisma migrate deploy` nel container backend.

3. **Dopo**
   - [ ] Controlla che tutti i container siano “healthy”.
   - [ ] Accedi all’app come cliente e verifica che i dati siano presenti.
   - [ ] Testa le funzionalità principali e le novità della versione.

Seguendo questa procedura, puoi consegnare il gestionale e fare upgrade successivi (1.1, 1.2, ...) senza cancellare i dati inseriti dai clienti.

