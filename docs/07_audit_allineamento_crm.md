# Audit Allineamento CRM (Tranche 0)

Data audit: 2026-04-25  
Fonte: codice corrente (`packages/backend/src/main.ts`, `packages/frontend/src/App.tsx`, `packages/frontend/src/components/AgentZoneTasksPage.tsx`, `packages/backend/prisma/schema.prisma`)

## Matrice requisito -> stato

| Area | Requisito | Stato | Evidenza |
|---|---|---|---|
| Appuntamenti | Slot unico multi-partecipante | `done` | modello `participantIds`, mapping FE su evento unico |
| Appuntamenti | Permessi creator agente edit/delete | `done` | controlli `canManageAppointment` FE+BE |
| Appuntamenti | Coinvolgimento multi-agente da agente | `done` | merge `selectedAgentIds` + creator |
| Appuntamenti | Titolo dropdown (acquisizione/visita/incontro/altro) | `partial` | dropdown presente, set finale da verificare in FE |
| Appuntamenti | Descrizione/luogo facoltativi | `done` | create/update tollerano null/empty |
| Appuntamenti | Rimozione stato/colore da timing | `partial` | stato/colore ridotti, verificare blocchi UI residui |
| Appuntamenti | Colori agente stabili a colpo d'occhio | `partial` | badge partecipanti presenti, stabilità palette da consolidare |
| Attivita | Tipi consentiti ridotti | `done` | endpoint `/api/activities/types` + normalizzazione |
| Attivita | Rimozione voci appuntamento dal menu attivita | `done` | FE usa endpoint tipi consentiti |
| Attivita | Orario pianificato visibile chiaramente | `partial` | presente in viste principali, serve QA UI trasversale |
| Zona di lavoro | Sblocco “Aggiungi informazioni di zona” | `done` | menu sbloccato + form nota |
| Zona di lavoro | Note testuali + foto | `done` | note con `photoDataUrl` |
| Zona di lavoro | Log di Zona cronologico + sotto-zona | `done` | vista `zone_log` con filtri |
| Zona di lavoro | Ricerca keyword rapida | `done` | filtro keyword su log |
| Zona di lavoro | Apertura gruppo mostra subito info zona | `done` | apertura diretta scheda operativa |
| Zona di lavoro | Dashboard zona mostra note/log | `done` | widget riepilogo + preview log |
| Zona/perimetri | Stop CAP, futura gestione perimetri | `partial` | adapter identity avviato, perimetri non implementati |
| Nuovo cliente | Schermata unica anagrafica + richiesta immobiliare condizionale | `missing` | flusso attuale clienti/proprietari separato |
| Nuovo cliente | Affitto: tipo contratto (transitorio/3+2/4+4) | `missing` | non trovato in form nuovo cliente |
| Nuovo cliente | Zone da catalogo esterno normalizzato | `missing` | non trovato servizio dedicato |
| Immobili | Proprietario dentro immobile, rimozione menu proprietario clienti | `partial` | dati proprietario in immobile esistono, menu proprietario clienti ancora presente |
| Immobili | Wizard obbligatorieta/condizionali richieste | `partial` | blocchi presenti ma regole non complete |
| Immobili | Minimo 7 foto obbligatorie | `missing` | non rilevata validazione hard univoca |
| Immobili | Planimetria + visura obbligatorie | `partial` | indicazione UI presente, enforcement completo da consolidare |
| Immobili/Admin | Flag campi non pubblicabili + prezzo pubblicita distinto | `partial` | parti presenti, policy completa da completare |

## Output Tranche 0

- Audit completato con matrice `done/partial/missing`.
- Baseline capture API automatizzabile con script:
  - `scripts/crm-baseline-capture.ps1`
- Backlog residuo e ordine esecuzione:
  - `docs/08_backlog_residui_tranche.md`

