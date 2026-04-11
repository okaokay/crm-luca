#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const CONCURRENCY = 20;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usageAndExit() {
  console.log(`
Uso:
  node scripts/import-legacy-customers-requests.js \
    --customers ../../customers.csv \
    --requests ../../richieste.csv \
    --agency <agencyId> \
    [--assignedTo <userId>] \
    [--dry-run]
`);
  process.exit(1);
}

function decodeText(buffer) {
  const utf8 = buffer.toString('utf8');
  if (utf8.includes('\uFFFD')) return buffer.toString('latin1');
  return utf8;
}

function parseCsvSemicolon(filePath) {
  const raw = fs.readFileSync(filePath);
  const text = decodeText(raw).replace(/^\uFEFF/, '');
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else inQuotes = !inQuotes;
      continue;
    }
    if (ch === ';' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(current);
      current = '';
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    current += ch;
  }
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((v) => v.length > 0)) rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((vals) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (vals[idx] || '').trim();
    });
    return obj;
  });
}

function isTruthyLegacy(v) {
  return ['1', 'true', 'TRUE', 'yes', 'Y'].includes(String(v || '').trim());
}

function cleanString(v) {
  const s = String(v || '').trim();
  if (!s || s === 'null' || s === 'NULL' || s === 'undefined') return null;
  return s;
}

function cleanNumber(v) {
  const s = cleanString(v);
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return n === 0 ? null : n;
}

function cleanInt(v) {
  const n = cleanNumber(v);
  if (n === null) return null;
  return Math.round(n);
}

function pickPhone(row) {
  return cleanString(row.CELL1) || cleanString(row.TEL1) || cleanString(row.CELL2) || cleanString(row.TEL2) || null;
}

function normalizeLegacyIdTipo(raw) {
  const s = cleanString(raw);
  if (!s) return null;
  const match = s.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function mapRequestType(idTipoRaw) {
  const idTipo = normalizeLegacyIdTipo(idTipoRaw);
  switch (idTipo) {
    case 1: return 'APARTMENT';
    case 2: return 'HOUSE';
    case 3: return 'VILLA';
    case 4: return 'OFFICE';
    case 5: return 'SHOP';
    case 6: return 'WAREHOUSE';
    case 7: return 'LAND';
    case 8: return 'GARAGE';
    default: return 'OTHER';
  }
}

function toRequestStatus(row) {
  if (isTruthyLegacy(row.SOSPESA)) return 'PAUSED';
  if (!isTruthyLegacy(row.RECORD_STATUS)) return 'CLOSED';
  return 'ACTIVE';
}

function toContractType(row) {
  return isTruthyLegacy(row.INAFFITTO) ? 'RENT' : 'SALE';
}

function parseEpochDate(v) {
  const s = cleanString(v);
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  const dt = new Date(n * 1000);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function extractList(...values) {
  const out = new Set();
  values.forEach((v) => {
    const s = cleanString(v);
    if (!s) return;
    s.split(/[|,]/).map((x) => x.trim()).forEach((part) => {
      if (!part) return;
      if (/^\d+$/.test(part)) return;
      if (part.length < 2) return;
      out.add(part);
    });
  });
  return Array.from(out).slice(0, 15);
}

function mergeNotes(...values) {
  const chunks = values
    .map((v) => cleanString(v))
    .filter(Boolean)
    .map((v) => v.replace(/\s+/g, ' ').trim());
  return chunks.length ? chunks.join('\n---\n') : null;
}

async function runWithConcurrency(items, concurrency, worker, progressPrefix) {
  let index = 0;
  let processed = 0;
  const total = items.length;

  async function next() {
    const i = index;
    index += 1;
    if (i >= total) return;
    await worker(items[i], i);
    processed += 1;
    if (processed % 200 === 0 || processed === total) {
      console.log(`[${progressPrefix}] ${processed}/${total}`);
    }
    await next();
  }

  const runners = Array.from({ length: Math.min(concurrency, total) }, () => next());
  await Promise.all(runners);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.customers || !args.requests || !args.agency) usageAndExit();

  const customersPath = path.resolve(process.cwd(), args.customers);
  const requestsPath = path.resolve(process.cwd(), args.requests);
  const agencyId = String(args.agency);
  const assignedToId = cleanString(args.assignedTo);
  const dryRun = Boolean(args['dry-run']);

  if (!fs.existsSync(customersPath)) throw new Error(`File customers non trovato: ${customersPath}`);
  if (!fs.existsSync(requestsPath)) throw new Error(`File requests non trovato: ${requestsPath}`);

  const agency = await prisma.agency.findUnique({ where: { id: agencyId }, select: { id: true, name: true } });
  if (!agency) throw new Error(`Agency non trovata: ${agencyId}`);

  if (assignedToId) {
    const user = await prisma.user.findFirst({ where: { id: assignedToId, agencyId }, select: { id: true } });
    if (!user) throw new Error(`Utente assignedTo non trovato in agency: ${assignedToId}`);
  }

  console.log('Parsing CSV...');
  const customersRows = parseCsvSemicolon(customersPath);
  const requestRows = parseCsvSemicolon(requestsPath);
  console.log(`CSV parsed: customers=${customersRows.length}, requests=${requestRows.length}`);

  const requestCustomerSet = new Set();
  for (const r of requestRows) {
    const customerId = cleanString(r.IDCUSTOMER);
    if (customerId) requestCustomerSet.add(customerId);
  }

  const report = {
    dryRun,
    agencyId,
    agencyName: agency.name,
    input: {
      customersRows: customersRows.length,
      requestsRows: requestRows.length,
      uniqueRequestCustomers: requestCustomerSet.size,
    },
    contacts: { created: 0, updated: 0, skippedMissingMinimumData: 0, withoutRequestTagged: 0, errors: 0 },
    requests: { created: 0, updated: 0, skippedMissingContact: 0, errors: 0 },
    rowErrors: [],
  };

  const importableCustomers = [];
  const customersWithRequests = [];
  const customersWithoutRequests = [];

  for (const row of customersRows) {
    const legacyCustomerId = cleanString(row.ID);
    if (!legacyCustomerId) continue;

    const hasRequest = requestCustomerSet.has(legacyCustomerId);
    if (hasRequest) customersWithRequests.push(row);
    else customersWithoutRequests.push(row);

    const firstName = cleanString(row.NOME);
    const lastName = cleanString(row.COGNOME) || `Cliente ${legacyCustomerId}`;
    const phone = pickPhone(row);

    if (!hasRequest && (!firstName || !lastName || !phone)) {
      report.contacts.skippedMissingMinimumData += 1;
      continue;
    }
    importableCustomers.push(row);
  }

  const legacyCustomerIds = importableCustomers.map((r) => cleanString(r.ID)).filter(Boolean);
  const existingContacts = await prisma.contact.findMany({
    where: { agencyId, legacyCustomerId: { in: legacyCustomerIds } },
    select: { id: true, legacyCustomerId: true },
  });
  const existingContactMap = new Map(existingContacts.map((c) => [c.legacyCustomerId, c.id]));
  const contactIdByLegacyId = new Map(existingContacts.map((c) => [c.legacyCustomerId, c.id]));

  console.log(`Import contatti: ${importableCustomers.length} righe (${existingContacts.length} già presenti)`);

  await runWithConcurrency(
    importableCustomers,
    CONCURRENCY,
    async (row) => {
      const legacyCustomerId = cleanString(row.ID);
      if (!legacyCustomerId) return;

      try {
        const hasRequest = requestCustomerSet.has(legacyCustomerId);
        const payload = {
          firstName: cleanString(row.NOME) || 'Cliente',
          lastName: cleanString(row.COGNOME) || `Cliente ${legacyCustomerId}`,
          email: cleanString(row.EMAIL) || cleanString(row.EMAIL2),
          phone: pickPhone(row),
          type: hasRequest ? 'BUYER' : 'LEAD',
          address: cleanString(row.INDIRIZZO),
          zipCode: cleanString(row.CAP),
          fiscalCode: cleanString(row.CF),
          notes: mergeNotes(row.NOTE, row.RECAPITI_NOTE),
          isActive: isTruthyLegacy(row.RECORD_STATUS),
          tags: hasRequest ? [] : ['Cliente senza richiesta'],
          agencyId,
          assignedToId,
          legacyCustomerId,
        };

        const existed = existingContactMap.has(legacyCustomerId);

        if (!dryRun) {
          const saved = await prisma.contact.upsert({
            where: { agencyId_legacyCustomerId: { agencyId, legacyCustomerId } },
            create: payload,
            update: payload,
            select: { id: true },
          });
          contactIdByLegacyId.set(legacyCustomerId, saved.id);
        }

        if (existed) report.contacts.updated += 1;
        else report.contacts.created += 1;
        if (!hasRequest) report.contacts.withoutRequestTagged += 1;
      } catch (error) {
        report.contacts.errors += 1;
        report.rowErrors.push({ stream: 'customers', legacyId: row.ID || null, error: String(error.message || error) });
      }
    },
    'contacts'
  );

  const legacyRequestIds = requestRows.map((r) => cleanString(r.ID)).filter(Boolean);
  const existingRequests = await prisma.request.findMany({
    where: { agencyId, legacyRequestId: { in: legacyRequestIds } },
    select: { id: true, legacyRequestId: true },
  });
  const existingRequestSet = new Set(existingRequests.map((r) => r.legacyRequestId));

  console.log(`Import richieste: ${requestRows.length} righe (${existingRequests.length} già presenti)`);

  await runWithConcurrency(
    requestRows,
    CONCURRENCY,
    async (row) => {
      const legacyRequestId = cleanString(row.ID);
      const legacyCustomerId = cleanString(row.IDCUSTOMER);
      if (!legacyRequestId || !legacyCustomerId) return;

      try {
        const contactId = contactIdByLegacyId.get(legacyCustomerId);
        if (!contactId) {
          report.requests.skippedMissingContact += 1;
          return;
        }

        const payload = {
          legacyRequestId,
          title: `Richiesta legacy #${legacyRequestId}`,
          description: cleanString(row.NOTE),
          type: mapRequestType(row.IDTIPO),
          contractType: toContractType(row),
          status: toRequestStatus(row),
          minPrice: cleanNumber(row.PREZZO1),
          maxPrice: cleanNumber(row.PREZZO2),
          minSurface: cleanNumber(row.MQ),
          maxSurface: cleanNumber(row.MQ2),
          minRooms: cleanInt(row.VANI1) || cleanInt(row.CAMERA1),
          maxRooms: cleanInt(row.VANI2) || cleanInt(row.CAMERA2),
          minBathrooms: cleanInt(row.BAGNO1),
          maxBathrooms: cleanInt(row.BAGNO2),
          minFloor: cleanInt(row.PIANO_INF_A),
          maxFloor: cleanInt(row.PIANO_SUP_A),
          cities: extractList(row.LOCALITA, row.LOCALITA_AREA, row.LOCALITA_AREA2, row.LOCALITA_AREA3),
          provinces: extractList(row.IDPROVINCIA, row.LOCALITA_FILTER_TYPE),
          notes: mergeNotes(row.NOTE, `LegacyRequestID:${legacyRequestId}`, `LegacyCustomerID:${legacyCustomerId}`),
          expiresAt: parseEpochDate(row.DATARICHIESTA),
          contactId,
          agencyId,
          assignedToId,
        };

        const existed = existingRequestSet.has(legacyRequestId);

        if (!dryRun) {
          await prisma.request.upsert({
            where: { agencyId_legacyRequestId: { agencyId, legacyRequestId } },
            create: payload,
            update: payload,
          });
        }

        if (existed) report.requests.updated += 1;
        else report.requests.created += 1;
      } catch (error) {
        report.requests.errors += 1;
        report.rowErrors.push({
          stream: 'requests',
          legacyId: row.ID || null,
          customerLegacyId: row.IDCUSTOMER || null,
          error: String(error.message || error),
        });
      }
    },
    'requests'
  );

  report.summary = {
    customersWithRequest: customersWithRequests.length,
    customersWithoutRequest: customersWithoutRequests.length,
    importableCustomers: importableCustomers.length,
  };

  console.log('\n=== IMPORT REPORT ===');
  console.log(JSON.stringify(report, null, 2));
}

run()
  .catch((error) => {
    console.error('Import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });