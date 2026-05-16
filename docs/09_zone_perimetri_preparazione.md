# Preparazione tecnica Zone a Perimetro (senza implementazione geometrica)

## Obiettivo

Preparare il codice a convivere con:
- `legacy_cap` (attuale)
- `custom_perimeter` (futuro)

senza cambiare il comportamento operativo corrente.

## Implementato ora

1. DTO identita zona (`ZoneIdentityDTO`)
   - file: `packages/backend/src/zoneIdentity.ts`
   - campi: `zoneKind`, `zoneId`, `cap`, `region`, `province`, `city`, `perimeterId`
2. Adapter resolver unico
   - file: `packages/backend/src/zoneScopeResolver.ts`
   - funzione: `resolveZoneScope(...)`
   - supporto runtime: `legacy_cap`
   - supporto `custom_perimeter`: placeholder design-ready
3. Innesco nel backend
   - `resolveStreetScopeForZoneTask` usa ora `resolveZoneScope`
   - nessuna rottura API esistente

## Step successivi (non eseguiti in questa tranche)

1. Estendere schema DB:
   - `AgentZone.zoneKind`
   - `AgentZone.perimeterGeoJson` (o tabella dedicata perimetri)
2. Dual-read resolver:
   - prima `zoneId/perimeter`
   - fallback `legacy_cap`
3. Migrazione progressiva:
   - fase A: retro-compat totale
   - fase B: nuove zone solo perimetro
   - fase C: deprecazione endpoint CAP-centrici

## Rischi e mitigazioni

- Rischio: accoppiamento diffuso a `cap/groupIndex`
  - Mitigazione: centralizzare la risoluzione in adapter unico prima di migrare DB.
- Rischio: regressioni permessi su zone
  - Mitigazione: test integrazione su `resolveZoneScope` e endpoint workspace.

