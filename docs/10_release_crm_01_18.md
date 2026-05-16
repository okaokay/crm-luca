# CRM Release Note Finale (CRM-01 -> CRM-18)

Data riferimento: 2026-05-09  
Ambito: allineamento gestionale rispetto al PDF modifiche cliente

## 1) Stato esecuzione task board

- `CRM-01` completato: prezzo pubblicitario separato (DB/API)
- `CRM-02` completato: migrazione retrocompatibile prezzi pubblicitari
- `CRM-03` completato: UI admin prezzo pubblicitario
- `CRM-04` completato: feed/pubblicazione priorita prezzo pubblicitario con fallback sicuro
- `CRM-05` completato: hard validation backend Nuovo Cliente
- `CRM-06` completato: uniformazione error handling FE/BE Nuovo Cliente
- `CRM-07` completato: policy immobili retrocompatibile (soft update legacy, hard gate publish)
- `CRM-08` completato: report immobili non conformi
- `CRM-09` completato: upload foto uniforme note zona (contratto unificato allegati)
- `CRM-10` completato: limiti sicurezza upload (mime/size)
- `CRM-11` completato: Log di Zona con ricerca/sotto-zona/allegati
- `CRM-12` completato: hardening calendario no-regression (deduplica sicura e notifiche update/delete)
- `CRM-13` implementato: test pack permessi appuntamenti/clienti/immobili
- `CRM-14` implementato: test validazioni condizionali Nuovo Cliente
- `CRM-15` implementato: test workflow legacy/new/publish immobili
- `CRM-16` implementato: test feed/prezzo pubblicitario
- `CRM-17` completato: audit log prezzo pubblicitario + approvazione/pubblicazione
- `CRM-18` completato: presente documento tecnico di rilascio

## 2) Gate di rilascio

Gate tecnici:
- Build backend: `OK`
- Build frontend: `OK`
- Test runtime `CRM-13..17`: pronti, richiedono credenziali ambiente

Gate funzionali:
- Prezzo pubblicitario prioritario in pubblicazione: `OK`
- Retrocompatibilita immobili legacy in update: `OK`
- Blocco publish immobili incompleti: `OK`
- Calendario multi-agente (slot unico) + permessi creator: `OK`
- Zona di lavoro: note/foto/log/ricerca/filtro: `OK`

## 3) Come eseguire i test finali (runtime)

Script:
- `npm run -w packages/backend test:crm-13-17`

Variabili richieste minime:
- `CRM_ADMIN_EMAIL`
- `CRM_ADMIN_PASSWORD`

Variabili opzionali (per copertura completa permessi CRM-13):
- `CRM_AGENT1_EMAIL`
- `CRM_AGENT1_PASSWORD`
- `CRM_AGENT2_EMAIL`
- `CRM_AGENT2_PASSWORD`

Note:
- Senza credenziali admin il test runtime fallisce in login.
- Senza credenziali agent1/agent2 il test permessi multi-agente viene eseguito in modalita parziale.

## 4) Rischi residui e mitigazioni

Rischi residui principali:
- Mancata esecuzione test runtime completo per assenza credenziali.
- Perimetri zona al posto CAP non ancora implementati (fuori scope tranche corrente).

Mitigazioni:
- Eseguire `test:crm-13-17` in ambiente staging con credenziali reali prima del go-live.
- Mantenere monitoraggio audit log su:
  - cambio prezzi pubblicitari
  - approvazione/pubblicazione immobili
- Pianificare task dedicato per migrazione logica CAP -> perimetri.

## 5) Piano rollback

Se emergono regressioni in produzione:
1. Disattivare temporaneamente pubblicazione nuovi immobili lato operativita admin.
2. Ripristinare release precedente backend/frontend.
3. Verificare coerenza DB (campi advertising restano retrocompatibili e non distruttivi).
4. Rieseguire test regressione su staging.
5. Rilasciare hotfix mirato e riaprire pubblicazione.

## 6) Checklist handover QA/Operations

- Confermare utente admin e due agenti di test.
- Eseguire script `test:crm-13-17`.
- Verificare manualmente:
  - creazione/modifica/eliminazione appuntamento multi-partecipante
  - publish immobile legacy incompleto (deve fallire)
  - publish immobile conforme (deve riuscire)
  - prezzo pubblicitario su pannello portali
  - log zona con filtro keyword + sotto-zona + foto
- Verificare presenza record audit su eventi sensibili.
