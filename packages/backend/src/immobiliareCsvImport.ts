// @ts-nocheck
import { PrismaClient, Prisma, PropertyType } from '@prisma/client';

type CsvRow = Record<string, string>;

export type ImmobiliareCsvImportResult = {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

const detectDelimiter = (text: string): string => {
  const firstLine = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) || '';
  const candidates = [';', ',', '\t'];
  let best = ';';
  let score = -1;
  for (const delimiter of candidates) {
    const nextScore = firstLine.split(delimiter).length - 1;
    if (nextScore > score) {
      best = delimiter;
      score = nextScore;
    }
  }
  return best;
};

const repairText = (value: any): string => {
  const raw = String(value ?? '').replace(/^\uFEFF/, '').trim();
  if (!raw) return '';
  if (!/[ÃÂâ€™â€œâ€â€“â€”â€¦]/.test(raw)) return raw;
  try {
    const repaired = Buffer.from(raw, 'latin1').toString('utf8').trim();
    if (!repaired || repaired.includes('\uFFFD')) return raw;
    return repaired;
  } catch {
    return raw;
  }
};

const normalizeHeader = (header: string): string => {
  return repairText(header)
    .toLowerCase()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseCsv = (text: string): CsvRow[] => {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(current);
      current = '';
      if (row.some((cell) => String(cell || '').trim() !== '')) rows.push(row);
      row = [];
      continue;
    }

    current += ch;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => String(cell || '').trim() !== '')) rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows.slice(1).map((values) => {
    const record: CsvRow = {};
    headers.forEach((header, index) => {
      record[header] = repairText(values[index] ?? '');
    });
    return record;
  });
};

const getValue = (row: CsvRow, ...keys: string[]): string => {
  for (const key of keys) {
    const normalizedKey = normalizeHeader(key);
    const value = row[normalizedKey];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const parseNumber = (value: string): number | undefined => {
  const raw = repairText(value);
  if (!raw) return undefined;
  if (/prezzo su richiesta/i.test(raw)) return undefined;
  const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '').trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed <= 1 && /prezzo su richiesta/i.test(raw)) return undefined;
  return parsed;
};

const parseInteger = (value: string): number | undefined => {
  const raw = repairText(value);
  if (!raw) return undefined;
  if (/>/.test(raw)) {
    const match = raw.match(/(\d+)/);
    if (!match) return undefined;
    return Number(match[1]);
  }
  if (/piano terra/i.test(raw)) return 0;
  const match = raw.match(/-?\d+/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeContractType = (value: string): 'SALE' | 'RENT' => {
  return /affitt/i.test(repairText(value)) ? 'RENT' : 'SALE';
};

const mapPropertyType = (value: string): PropertyType => {
  const normalized = repairText(value).toLowerCase();
  if (/terreno/.test(normalized)) return 'LAND';
  if (/capannone|magazzino/.test(normalized)) return 'WAREHOUSE';
  if (/negozio|locale commerciale/.test(normalized)) return 'SHOP';
  if (/ufficio|studio/.test(normalized)) return 'OFFICE';
  if (/garage|box|posto auto/.test(normalized)) return 'GARAGE';
  if (/villa/.test(normalized)) return 'VILLA';
  if (/rustico|casale|villetta|schiera|casa/.test(normalized)) return 'HOUSE';
  return 'APARTMENT';
};

const buildTitle = (row: CsvRow): string => {
  const tipologia = getValue(row, 'tipologia');
  const comune = getValue(row, 'comune');
  const reference = getValue(row, 'codice');
  const description = getValue(row, 'descrizione');
  const base = [tipologia || 'Immobile', comune || '', reference ? `Rif. ${reference}` : '']
    .filter(Boolean)
    .join(' - ')
    .trim();
  if (base) return base;
  if (description) {
    return description.slice(0, 120).trim();
  }
  return reference || 'Immobile importato';
};

const buildNotes = (row: CsvRow): string => {
  const details: string[] = ['Importato da CSV immobiliare.it'];
  const portalId = getValue(row, 'id');
  const categoria = getValue(row, 'categoria');
  const stato = getValue(row, 'stato immobile');
  const cucina = getValue(row, 'cucina');
  const riscaldamento = getValue(row, 'riscaldamento');
  const terrazzo = getValue(row, 'terrazzo');
  const boxAuto = getValue(row, 'box auto');
  const agente = getValue(row, 'agente');
  const dataInserimento = getValue(row, 'data_inserimento');
  const dataUltimaModifica = getValue(row, 'data_ultima_modifica');

  if (portalId) details.push(`ID portale: ${portalId}`);
  if (categoria) details.push(`Categoria CSV: ${categoria}`);
  if (stato) details.push(`Stato immobile CSV: ${stato}`);
  if (cucina) details.push(`Cucina CSV: ${cucina}`);
  if (riscaldamento) details.push(`Riscaldamento CSV: ${riscaldamento}`);
  if (terrazzo) details.push(`Terrazzo CSV: ${terrazzo}`);
  if (boxAuto) details.push(`Box auto CSV: ${boxAuto}`);
  if (agente) details.push(`Agente CSV: ${agente}`);
  if (dataInserimento) details.push(`Data inserimento CSV: ${dataInserimento}`);
  if (dataUltimaModifica) details.push(`Data ultima modifica CSV: ${dataUltimaModifica}`);

  return details.join('\n');
};

const buildAddress = (row: CsvRow): string => {
  const address = getValue(row, 'indirizzo');
  const civic = getValue(row, 'n° civico', 'nº civico', 'n civico', 'n?? civico');
  return [address, civic].filter(Boolean).join(', ').trim();
};

const inferParking = (value: string): number | undefined => {
  const normalized = repairText(value).toLowerCase();
  if (!normalized) return undefined;
  if (/\bno\b|assente|nessuno/.test(normalized)) return 0;
  if (/sì|si|box|posto|garage/.test(normalized)) return 1;
  return undefined;
};

const inferTerrace = (value: string): number | undefined => {
  const normalized = repairText(value).toLowerCase();
  if (!normalized) return undefined;
  if (normalized === '0' || /\bno\b|assente/.test(normalized)) return 0;
  if (normalized === '1' || /sì|si/.test(normalized)) return 1;
  return parseNumber(normalized);
};

const buildPropertyPayload = (row: CsvRow, agencyId: string, ownerId: string): Prisma.PropertyUncheckedCreateInput => {
  const reference = getValue(row, 'codice');
  const contractType = normalizeContractType(getValue(row, 'contratto'));
  const salePrice = contractType === 'SALE' ? parseNumber(getValue(row, 'prezzo vendita')) ?? null : null;
  const rentPrice = contractType === 'RENT' ? parseNumber(getValue(row, 'canone affitto')) ?? null : null;
  const priceBand = getValue(row, 'fascia_prezzo');
  const description = getValue(row, 'descrizione');
  const notes = [buildNotes(row), priceBand ? `Fascia prezzo CSV: ${priceBand}` : ''].filter(Boolean).join('\n');

  return {
    title: buildTitle(row),
    description: description || null,
    type: mapPropertyType(getValue(row, 'tipologia')),
    contractType,
    status: 'AVAILABLE',
    address: buildAddress(row) || 'Indirizzo da completare',
    city: getValue(row, 'comune') || 'Da completare',
    province: getValue(row, 'provincia') || 'ND',
    zipCode: getValue(row, 'cap') || '00000',
    rooms: parseInteger(getValue(row, 'locali')) ?? null,
    bathrooms: parseInteger(getValue(row, 'bagni')) ?? null,
    surface: parseNumber(getValue(row, 'superficie')) ?? null,
    terrace: inferTerrace(getValue(row, 'terrazzo')) ?? null,
    parking: inferParking(getValue(row, 'box auto')) ?? null,
    floor: parseInteger(getValue(row, 'piano')) ?? null,
    salePrice,
    rentPrice,
    advertisingSalePrice: salePrice,
    advertisingRentPrice: rentPrice,
    energyClass: null,
    images: [],
    portalTargets: [],
    reference,
    notes,
    isPublished: false,
    agencyId,
    ownerId
  };
};

export async function importImmobiliareCsvBuffer(args: {
  prisma: PrismaClient;
  csvBuffer: Buffer;
  agencyId: string;
  ownerId: string;
}): Promise<ImmobiliareCsvImportResult> {
  const text = args.csvBuffer.toString('utf8');
  const rows = parseCsv(text);
  const result: ImmobiliareCsvImportResult = {
    totalRows: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    try {
      const reference = getValue(row, 'codice');
      if (!reference) {
        result.skipped += 1;
        result.errors.push(`Riga ${index + 2}: riferimento/codice mancante`);
        continue;
      }

      const payload = buildPropertyPayload(row, args.agencyId, args.ownerId);
      const existing = await args.prisma.property.findFirst({
        where: { agencyId: args.agencyId, reference }
      });

      if (existing) {
        const updatePayload: Prisma.PropertyUncheckedUpdateInput = {
          title: payload.title,
          description: payload.description,
          type: payload.type,
          contractType: payload.contractType,
          status: payload.status,
          address: payload.address,
          city: payload.city,
          province: payload.province,
          zipCode: payload.zipCode,
          rooms: payload.rooms,
          bathrooms: payload.bathrooms,
          surface: payload.surface,
          terrace: payload.terrace,
          parking: payload.parking,
          floor: payload.floor,
          salePrice: payload.salePrice,
          rentPrice: payload.rentPrice,
          advertisingSalePrice: payload.advertisingSalePrice,
          advertisingRentPrice: payload.advertisingRentPrice,
          notes: payload.notes,
          ownerId: existing.ownerId || args.ownerId
        };
        await args.prisma.property.update({
          where: { id: existing.id },
          data: updatePayload
        });
        result.updated += 1;
      } else {
        await args.prisma.property.create({ data: payload });
        result.created += 1;
      }
    } catch (error: any) {
      result.skipped += 1;
      result.errors.push(`Riga ${index + 2}: ${error?.message ? String(error.message) : String(error)}`);
    }
  }

  return result;
}
