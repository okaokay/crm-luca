# Backlog Residui (post audit)

## Priorita P0 (rilascio immediato)

1. Appuntamenti
   - fissare in modo definitivo lista titolo: `acquisizione|visita|incontro|altro`
   - completare rimozione UI campi `stato/colore` nel timing
   - consolidare palette colori agente stabile per badge/slot
2. Attivita
   - QA completo visibilita orario in lista/dettaglio/dashboard
3. Zona/perimetri
   - integrare adapter `zone identity` in tutti i resolver CAP-centrici (solo compat, nessun perimetro runtime)

## Priorita P1 (tranche successive)

1. Nuovo Cliente (schermata unica)
   - unificazione anagrafica + richiesta immobiliare
   - regole condizionali tipologia (`appartamento` vs `locale/altro`)
   - contratto affitto (`transitorio`, `3+2`, `4+4`)
   - validazione backend simmetrica
2. Immobili
   - eliminazione flusso “proprietario” dal menu clienti
   - rimodellazione wizard con obbligatorieta e condizionali richieste
   - enforce `>=7 foto` e documenti obbligatori hard
3. Admin publish flow
   - flag campi non pubblicabili
   - prezzo pubblicita separato dal prezzo acquisizione

## Priorita P2 (design-ready)

1. Zone a perimetro
   - finalizzare schema DB (`zoneKind`, perimetro, relazioni)
   - endpoint selezione perimetro in creazione/assegnazione zona
   - piano migrazione CAP -> perimetro (dual-read, cutover, cleanup)

## Policy validazioni

- Soft -> Hard graduale:
  - fase 1: warning UI + telemetry
  - fase 2: hard-block su nuovi inserimenti
  - storico legacy non bloccato

