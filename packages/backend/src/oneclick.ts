type GenericObject = Record<string, any>;

export type OneClickPortalExclusion = {
  tagName?: string;
  portalCode: number;
  cancel: 0 | 1;
};

export type OneClickImage = {
  link: string;
  description?: string;
  planimetria?: 'S' | 'N';
  principale?: 'S' | 'N';
};

export type OneClickVideo = {
  titolo?: string;
  tipo_video?: 'T' | 'V';
  link_video: string;
  codice_embedded?: string;
};

export type OneClickData = {
  idtipologiaimmobile?: number;
  idtipologiaannuncio?: number;
  comune_istat?: string;
  zona?: string;
  localita?: string;
  nazione?: string;
  riferimento?: string;
  prezzo?: number | null;
  note_prezzo?: string;
  mq?: number | null;
  nr_locali?: number | null;
  note_locali?: string;
  priorita?: number;
  nr_servizi?: number | null;
  nr_camere?: number | null;
  ncostruzionesn?: 'S' | 'N';
  indirizzo?: string;
  mappa?: 'S' | 'N';
  latitudine?: number | null;
  longitudine?: number | null;
  cap?: string;
  box_auto?: string;
  mq_box?: number | null;
  vetrina?: 'S' | 'N';
  balcone?: 'S' | 'N';
  nr_balconi?: number | null;
  terrazzo?: 'S' | 'N';
  nr_terrazzi?: number | null;
  mansarda?: 'S' | 'N';
  cantina?: 'S' | 'N';
  arredato?: 'S' | 'N';
  giardino?: string;
  mq_giardino?: number | null;
  unita_immobiliare?: number | null;
  piano?: string;
  totale_piani?: number | null;
  spese_cond_mensili?: number | null;
  condizioni?: string;
  ascensore?: 'S' | 'N';
  cucina?: string;
  riscaldamento?: string;
  condizionatore?: 'S' | 'N';
  indirizzo_visibile?: 'S' | 'N';
  disponibilita?: string;
  tipo_classe_energetica?: 'V' | 'N';
  classe_energetica?: string;
  ipe?: number | null;
  ipe_rinnovabili?: number | null;
  efficienza_estiva?: string;
  efficienza_invernale?: string;
  efficienza_zero?: 'S' | 'N';
  ipe_certificato?: 'S' | 'N';
  descrizione?: string;
  descrizione_breve?: string;
  descrizione_ted?: string;
  descrizione_ing?: string;
  descrizione_fra?: string;
  descrizione_spa?: string;
  data_inserimento?: string;
  data_aggiornamento?: string;
  data_scadenza_asta?: string;
  codice_rge?: string;
  lotto_asta?: string;
  valutazione_asta?: number | null;
  esclusione_portali?: OneClickPortalExclusion[];
  id_localita_immobiliareit?: string;
  id_zona_immobiliareit?: string;
  classe_immobile?: string;
  contratto_affitto?: string;
  allarme_antifurto?: 'S' | 'N';
  portineria?: 'S' | 'N';
  internet?: 'S' | 'N';
  mq_esterno?: number | null;
  anno_costruzione?: number | null;
  titolo_annuncio?: string;
  tipo_riscaldamento?: string;
  asta?: 'S' | 'N';
  piscina?: 'S' | 'N';
  caminetto?: 'S' | 'N';
  link_esterno?: string;
  nr_altre_stanze?: number | null;
  prezzo_settimanale?: number | null;
  categoria_annuncio?: string;
  selectedPortalCodes?: number[];
  portalSelectionBaselineDone?: boolean;
  immagini?: OneClickImage[];
  videos?: OneClickVideo[];
  publicationReview?: {
    hiddenFields?: string[];
    adminNote?: string;
    reviewedAt?: string;
    reviewedByRole?: string;
    approvedAt?: string;
    approvedById?: string;
  };
};

export type OneClickDictionaryItem = {
  id: number;
  label: string;
  classification?: 'R' | 'C';
};

export const ONECLICK_PROPERTY_TYPES: OneClickDictionaryItem[] = [
  { id: 24, label: 'Agriturismo', classification: 'C' },
  { id: 26, label: 'Albergo', classification: 'C' },
  { id: 5, label: 'Appartamento', classification: 'R' },
  { id: 57, label: 'Appartamento indipendente', classification: 'R' },
  { id: 65, label: 'Area edificabile', classification: 'R' },
  { id: 66, label: 'Area industriale', classification: 'C' },
  { id: 32, label: 'Attico', classification: 'R' },
  { id: 25, label: "Attivita'/Lic.Commerciale", classification: 'C' },
  { id: 23, label: 'Azienda agricola', classification: 'C' },
  { id: 21, label: 'Baita/Chalet/Trullo', classification: 'R' },
  { id: 34, label: 'Bar', classification: 'C' },
  { id: 55, label: 'Bifamiliare', classification: 'R' },
  { id: 9, label: 'Box auto', classification: 'R' },
  { id: 80, label: 'Bungalow', classification: 'R' },
  { id: 67, label: 'Cantina', classification: 'R' },
  { id: 16, label: 'Capannone', classification: 'C' },
  { id: 12, label: 'Casa affiancata', classification: 'R' },
  { id: 36, label: 'Casa indipendente', classification: 'R' },
  { id: 56, label: 'Casa semi indipendente', classification: 'R' },
  { id: 68, label: 'Casa vacanze', classification: 'R' },
  { id: 37, label: 'Casale', classification: 'R' },
  { id: 38, label: 'Cascina', classification: 'R' },
  { id: 22, label: 'Castello', classification: 'R' },
  { id: 58, label: 'Colonica', classification: 'R' },
  { id: 39, label: 'Discoteca', classification: 'C' },
  { id: 41, label: 'Fondo artigianale', classification: 'C' },
  { id: 42, label: 'Fondo commerciale', classification: 'C' },
  { id: 59, label: 'Forno', classification: 'C' },
  { id: 77, label: 'Garage', classification: 'R' },
  { id: 75, label: 'Immobile commerciale', classification: 'C' },
  { id: 69, label: 'Immobile di prestigio', classification: 'R' },
  { id: 28, label: 'Laboratorio', classification: 'C' },
  { id: 44, label: 'Licenza', classification: 'C' },
  { id: 27, label: 'Locale commerciale', classification: 'C' },
  { id: 14, label: 'Loft', classification: 'R' },
  { id: 29, label: 'Magazzino', classification: 'C' },
  { id: 13, label: 'Mansarda', classification: 'R' },
  { id: 60, label: 'Masseria', classification: 'R' },
  { id: 70, label: 'Monolocale', classification: 'R' },
  { id: 18, label: 'Negozio', classification: 'C' },
  { id: 45, label: 'Palazzo', classification: 'R' },
  { id: 78, label: 'Palestra', classification: 'C' },
  { id: 62, label: 'Pizzeria / Pub', classification: 'C' },
  { id: 72, label: 'Posto auto', classification: 'R' },
  { id: 47, label: 'Residence', classification: 'R' },
  { id: 30, label: 'Ristorante', classification: 'C' },
  { id: 8, label: 'Rustico', classification: 'R' },
  { id: 73, label: 'Sala convegni', classification: 'C' },
  { id: 76, label: 'Seminterrato', classification: 'R' },
  { id: 50, label: 'Show room', classification: 'C' },
  { id: 20, label: 'Stabile/Palazzo', classification: 'R' },
  { id: 51, label: 'Stanza', classification: 'R' },
  { id: 52, label: 'Terratetto', classification: 'R' },
  { id: 19, label: 'Terreno agricolo', classification: 'C' },
  { id: 15, label: 'Ufficio', classification: 'C' },
  { id: 54, label: 'Viareggina', classification: 'R' },
  { id: 7, label: 'Villa', classification: 'R' },
  { id: 63, label: 'Villa a schiera', classification: 'R' },
  { id: 74, label: 'Villaggio turistico', classification: 'C' },
  { id: 64, label: 'Villino', classification: 'R' }
];

export const ONECLICK_ANNOUNCEMENT_TYPES: OneClickDictionaryItem[] = [
  { id: 1, label: 'Vendita' },
  { id: 2, label: 'Affitto' },
  { id: 3, label: 'Vacanze' }
];

export const ONECLICK_PORTAL_CODES: OneClickDictionaryItem[] = [
  { id: 3, label: 'Casa.it' },
  { id: 10, label: 'Risorse Immobiliari' },
  { id: 12, label: 'Trova-Casa' },
  { id: 307, label: 'Ghiglo.it' },
  { id: 14, label: 'Affitto' },
  { id: 20, label: 'Immobiliare.it' },
  { id: 49, label: 'Secondamano.it' },
  { id: 44, label: 'Bakeca' },
  { id: 70, label: 'CercasiCasa' },
  { id: 77, label: 'Cercaimmobili.it (Commerciali.it)' },
  { id: 81, label: 'Webimmobiliare.com' },
  { id: 88, label: 'TrovoCasa' },
  { id: 144, label: 'Case24' },
  { id: 148, label: 'LifeinItaly' },
  { id: 132, label: 'Manzoni/Repubblica' },
  { id: 308, label: 'AbitarePiacenza' },
  { id: 104, label: 'Tuttoannunci.org' },
  { id: 114, label: 'CambioCasa.it' },
  { id: 121, label: 'Sito internet agenzia' },
  { id: 131, label: 'Idealista.it' },
  { id: 129, label: 'Trovit' },
  { id: 161, label: 'Casando.it' },
  { id: 170, label: 'CercaCasa' },
  { id: 175, label: 'ItaliaImmobiliare.net - marcheimmobiliare.it' },
  { id: 309, label: 'ImmobiliOvunque' },
  { id: 192, label: 'Immobiliweb.it' },
  { id: 271, label: 'ChiamaCasa' },
  { id: 195, label: 'MondoCasa.Net' },
  { id: 268, label: 'Venditaeaffitto' },
  { id: 199, label: 'Subito.it Pro' },
  { id: 202, label: 'Vendesicasa' },
  { id: 205, label: 'Gate-Away' },
  { id: 231, label: 'Pcase' },
  { id: 207, label: 'Gazzetta Immobiliare & immobilimpresa' },
  { id: 213, label: 'Facebook' },
  { id: 215, label: 'EbayAnnunci.it' },
  { id: 269, label: 'Domusbay' },
  { id: 218, label: 'OfficeCasa' },
  { id: 220, label: 'ChangeHome' },
  { id: 221, label: 'Annunci-casa.com' },
  { id: 223, label: 'Cheannunci.it' },
  { id: 229, label: 'EsaJob' },
  { id: 232, label: 'CasaForlì' },
  { id: 233, label: 'Twitter' },
  { id: 234, label: 'Rete Toscana Casa' },
  { id: 239, label: 'Bilocali.it' },
  { id: 304, label: 'GlobImmo.net' },
  { id: 240, label: 'Mycase.it' },
  { id: 243, label: 'CaseCasa' },
  { id: 249, label: 'Sistema Case' },
  { id: 247, label: 'MaremmaCase.it' },
  { id: 248, label: 'Golden-opportunities.it' },
  { id: 251, label: 'DiamoCasa' },
  { id: 305, label: 'Luximmo' },
  { id: 254, label: 'Italiapervoi-casa.it (ITA)' },
  { id: 265, label: 'Portobello' },
  { id: 275, label: 'SubitoeCasa.it' },
  { id: 281, label: 'La gazzetta immobiliare' },
  { id: 258, label: 'La Pulce' },
  { id: 272, label: 'CercoCasaWeb' },
  { id: 278, label: 'CaseAffittoEVendita' },
  { id: 282, label: 'Easyavvisi.it' },
  { id: 284, label: 'Case Casali & Ville' },
  { id: 286, label: 'Cipensoio' },
  { id: 288, label: 'ImmobilGreen' },
  { id: 289, label: 'iCase' },
  { id: 291, label: 'Bancadellecase' },
  { id: 290, label: 'Soloterreni.it' },
  { id: 294, label: 'Chicercacasa.it' },
  { id: 296, label: 'Trovocasa.net' },
  { id: 297, label: 'Mer et Demeures' },
  { id: 298, label: 'WikiCasa' },
  { id: 306, label: 'Yogulp.com' },
  { id: 310, label: 'Portaleagenzieimmobiliari.it' },
  { id: 311, label: 'Vivoqui.it' },
  { id: 312, label: 'Habiqui' },
  { id: 315, label: 'Quice.it' },
  { id: 314, label: 'Trovimap' },
  { id: 316, label: 'Cliccasa.it' },
  { id: 317, label: 'Affitto Certificato' },
  { id: 318, label: 'TuttoCasa.it' }
];

export const ONECLICK_ENUMS = {
  box_auto: ['nessuno', 'singolo', 'doppio', 'posto auto'],
  giardino: ['nessuno', 'privato', 'comune'],
  piano: ['seminterrato', 'pianoterra', '1', '2', '3', '4', '5', '6', '7', '>7', 'ultimo', 'piano rialzato', 'su più livelli'],
  condizioni: ['abitabile', 'buono', 'nuovo', 'ottimo', 'ristrutturato', 'da ristrutturare'],
  cucina: ['abitabile', 'angolo cottura', 'cucinotto', 'semiabitabile'],
  riscaldamento: ['autonomo', 'centralizzato', 'assente'],
  disponibilita: ['libero', 'occupato', 'nuda proprietà', 'affittato', 'libero al rogito'],
  tipo_riscaldamento: ['stufa', 'caldaia', 'termoconvettore', 'pompa di calore', 'a pannelli radianti', 'pannelli solari', 'termosifone', 'term. con contabilizzatore'],
  contratto_affitto: ['3+2', '4+4', '6+6', '9+9', 'Transitorio', 'Concordato', 'Libero', 'Studenti'],
  classe_immobile: ['signorile', 'medio', 'economico'],
  categoria_annuncio: ['residenziale', 'commerciale'],
  efficienza: ['scarsa', 'sufficiente', 'buona']
} as const;

const ONECLICK_TYPE_BY_PROPERTY_TYPE: Record<string, number> = {
  APARTMENT: 5,
  HOUSE: 36,
  VILLA: 7,
  OFFICE: 15,
  SHOP: 18,
  WAREHOUSE: 29,
  LAND: 19,
  GARAGE: 9,
  OTHER: 5
};

const ONECLICK_ANNOUNCE_BY_CONTRACT: Record<string, number> = {
  SALE: 1,
  RENT: 2,
  BOTH: 1
};

const ALL_ONECLICK_PORTAL_CODES = ONECLICK_PORTAL_CODES.map((p) => p.id);

const TRUE_VALUES = new Set(['1', 'true', 's', 'si', 'yes', 'y']);

const toSOrN = (value: unknown, defaultValue: 'S' | 'N' = 'N'): 'S' | 'N' => {
  if (value == null) return defaultValue;
  if (typeof value === 'boolean') return value ? 'S' : 'N';
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return defaultValue;
  return TRUE_VALUES.has(normalized) ? 'S' : 'N';
};

const cleanString = (value: unknown): string => {
  if (value == null) return '';
  return String(value).trim();
};

const cleanNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeNumberList = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const uniq = new Set<number>();
  for (const item of value) {
    const n = Number(item);
    if (!Number.isFinite(n) || n <= 0) continue;
    uniq.add(Math.trunc(n));
  }
  return Array.from(uniq.values()).sort((a, b) => a - b);
};

const xmlEscape = (value: unknown): string => {
  const text = value == null ? '' : String(value);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const xmlCdata = (value: unknown): string => {
  const text = value == null ? '' : String(value);
  const safe = text.replace(/]]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${safe}]]>`;
};

const sanitizeIso88591 = (value: string): string => {
  // Keep only Latin-1 representable chars or XML entities generated by xmlEscape/xmlCdata.
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 255) {
      out += value[i];
    } else {
      out += '?';
    }
  }
  return out;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const formatDateTime = (d: Date): string => {
  const day = pad2(d.getDate());
  const month = pad2(d.getMonth() + 1);
  const year = d.getFullYear();
  const h = pad2(d.getHours());
  const m = pad2(d.getMinutes());
  const s = pad2(d.getSeconds());
  return `${day}/${month}/${year} ${h}:${m}:${s}`;
};

const formatDate = (d: Date): string => {
  const day = pad2(d.getDate());
  const month = pad2(d.getMonth() + 1);
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const normalizeImageList = (value: unknown, fallbackImages: string[]): OneClickImage[] => {
  if (Array.isArray(value)) {
    const mapped = value
      .map((item, index) => {
        const link = cleanString((item as any)?.link);
        if (!link) return null;
        return {
          link,
          description: cleanString((item as any)?.description) || undefined,
          planimetria: toSOrN((item as any)?.planimetria, 'N'),
          principale: toSOrN((item as any)?.principale, index === 0 ? 'S' : 'N')
        } as OneClickImage;
      })
      .filter(Boolean) as OneClickImage[];
    if (mapped.length > 0) return mapped.slice(0, 40);
  }

  return (Array.isArray(fallbackImages) ? fallbackImages : [])
    .map((url, index) => cleanString(url))
    .filter(Boolean)
    .slice(0, 40)
    .map((link, index) => ({
      link,
      description: undefined,
      planimetria: 'N',
      principale: index === 0 ? 'S' : 'N'
    }));
};

const normalizeVideoList = (value: unknown): OneClickVideo[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: OneClickVideo[] = [];
  for (const item of value) {
    const link = cleanString((item as any)?.link_video);
    if (!link || seen.has(link)) continue;
    seen.add(link);
    result.push({
      titolo: cleanString((item as any)?.titolo) || undefined,
      tipo_video: cleanString((item as any)?.tipo_video).toUpperCase() === 'T' ? 'T' : 'V',
      link_video: link,
      codice_embedded: cleanString((item as any)?.codice_embedded) || undefined
    });
    if (result.length >= 4) break;
  }
  return result;
};

const normalizeExclusions = (value: unknown): OneClickPortalExclusion[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const portalCode = Number((item as any)?.portalCode);
      if (!Number.isFinite(portalCode) || portalCode <= 0) return null;
      const cancel = Number((item as any)?.cancel) === 1 ? 1 : 0;
      const tagRaw = cleanString((item as any)?.tagName);
      const tagName = tagRaw || `p${index + 1}`;
      return { tagName, portalCode, cancel } as OneClickPortalExclusion;
    })
    .filter(Boolean) as OneClickPortalExclusion[];
};

const normalizeKnownPortalCodes = (value: unknown): number[] => {
  const list = normalizeNumberList(value);
  if (!list.length) return [];
  const known = new Set<number>(ALL_ONECLICK_PORTAL_CODES);
  return list.filter((code) => known.has(code));
};

export const normalizeOneClickData = (value: unknown, propertyBase?: GenericObject): OneClickData => {
  const source = (value && typeof value === 'object' ? value : {}) as GenericObject;
  const base = propertyBase || {};

  const createdAt = base.createdAt ? new Date(base.createdAt) : new Date();
  const updatedAt = base.updatedAt ? new Date(base.updatedAt) : new Date();

  const idtipologiaimmobile =
    cleanNumber(source.idtipologiaimmobile) ??
    ONECLICK_TYPE_BY_PROPERTY_TYPE[String(base.type || '').toUpperCase()] ??
    5;
  const idtipologiaannuncio =
    cleanNumber(source.idtipologiaannuncio) ??
    ONECLICK_ANNOUNCE_BY_CONTRACT[String(base.contractType || '').toUpperCase()] ??
    1;

  const reference = cleanString(source.riferimento) || cleanString(base.reference) || String(base.giListingId || '');
  const descrizione = cleanString(source.descrizione) || cleanString(base.description);
  const comuneIstat = cleanString(source.comune_istat) || cleanString(base.giComuneIstat);

  const inferredPrice =
    cleanNumber(source.prezzo) ??
    cleanNumber(base.contractType === 'RENT' ? base.advertisingRentPrice : base.advertisingSalePrice) ??
    cleanNumber(base.contractType === 'RENT' ? base.rentPrice : base.salePrice) ??
    cleanNumber(base.advertisingSalePrice) ??
    cleanNumber(base.advertisingRentPrice) ??
    cleanNumber(base.salePrice) ??
    cleanNumber(base.rentPrice);

  const images = normalizeImageList(source.immagini, Array.isArray(base.images) ? base.images : []);
  const videos = normalizeVideoList(source.videos);
  const esclusionePortali = normalizeExclusions(source.esclusione_portali);
  const selectedPortalCodes = normalizeKnownPortalCodes(source.selectedPortalCodes);
  const portalSelectionBaselineDone = source.portalSelectionBaselineDone === true;

  return {
    ...source,
    idtipologiaimmobile: idtipologiaimmobile == null ? undefined : Number(idtipologiaimmobile),
    idtipologiaannuncio: idtipologiaannuncio == null ? undefined : Number(idtipologiaannuncio),
    comune_istat: comuneIstat || undefined,
    nazione: cleanString(source.nazione) || 'IT',
    riferimento: reference || undefined,
    prezzo: inferredPrice,
    mq: cleanNumber(source.mq) ?? cleanNumber(base.surface),
    nr_locali: cleanNumber(source.nr_locali) ?? cleanNumber(base.rooms),
    nr_servizi: cleanNumber(source.nr_servizi) ?? cleanNumber(base.bathrooms),
    nr_camere: cleanNumber(source.nr_camere) ?? cleanNumber(base.bedrooms),
    ncostruzionesn: toSOrN(source.ncostruzionesn, 'N'),
    indirizzo: cleanString(source.indirizzo) || cleanString(base.address) || undefined,
    mappa: toSOrN(source.mappa, 'S'),
    latitudine: cleanNumber(source.latitudine) ?? cleanNumber(base.latitude),
    longitudine: cleanNumber(source.longitudine) ?? cleanNumber(base.longitude),
    cap: cleanString(source.cap) || cleanString(base.zipCode) || undefined,
    balcone: toSOrN(source.balcone, cleanNumber(base.balcony) ? 'S' : 'N'),
    nr_balconi: cleanNumber(source.nr_balconi),
    terrazzo: toSOrN(source.terrazzo, cleanNumber(base.terrace) ? 'S' : 'N'),
    nr_terrazzi: cleanNumber(source.nr_terrazzi),
    mansarda: toSOrN(source.mansarda, 'N'),
    cantina: toSOrN(source.cantina, 'N'),
    arredato: toSOrN(source.arredato, toSOrN(base.furnished, 'N')),
    giardino: cleanString(source.giardino) || (cleanNumber(base.garden) ? 'privato' : undefined),
    mq_giardino: cleanNumber(source.mq_giardino) ?? cleanNumber(base.garden),
    piano: cleanString(source.piano) || (base.floor != null ? String(base.floor) : undefined),
    totale_piani: cleanNumber(source.totale_piani) ?? cleanNumber(base.totalFloors),
    spese_cond_mensili: cleanNumber(source.spese_cond_mensili) ?? cleanNumber(base.expenses),
    condizioni: cleanString(source.condizioni) || cleanString(base.buildingCondition) || undefined,
    ascensore: toSOrN(source.ascensore, toSOrN(base.elevator, 'N')),
    riscaldamento: cleanString(source.riscaldamento) || cleanString(base.buildingHeatingType) || undefined,
    condizionatore: toSOrN(source.condizionatore, 'N'),
    indirizzo_visibile: toSOrN(source.indirizzo_visibile, 'S'),
    disponibilita: cleanString(source.disponibilita) || 'libero',
    tipo_classe_energetica: cleanString(source.tipo_classe_energetica).toUpperCase() === 'N' ? 'N' : 'V',
    classe_energetica: cleanString(source.classe_energetica) || cleanString(base.energyClass) || undefined,
    ipe: cleanNumber(source.ipe),
    ipe_rinnovabili: cleanNumber(source.ipe_rinnovabili),
    efficienza_estiva: cleanString(source.efficienza_estiva) || undefined,
    efficienza_invernale: cleanString(source.efficienza_invernale) || undefined,
    efficienza_zero: toSOrN(source.efficienza_zero, 'N'),
    ipe_certificato: toSOrN(source.ipe_certificato, 'N'),
    descrizione: descrizione || undefined,
    descrizione_breve: cleanString(source.descrizione_breve) || undefined,
    descrizione_ted: cleanString(source.descrizione_ted) || undefined,
    descrizione_ing: cleanString(source.descrizione_ing) || undefined,
    descrizione_fra: cleanString(source.descrizione_fra) || undefined,
    descrizione_spa: cleanString(source.descrizione_spa) || undefined,
    data_inserimento: cleanString(source.data_inserimento) || formatDateTime(createdAt),
    data_aggiornamento: cleanString(source.data_aggiornamento) || formatDateTime(updatedAt),
    data_scadenza_asta: cleanString(source.data_scadenza_asta) || undefined,
    codice_rge: cleanString(source.codice_rge) || undefined,
    lotto_asta: cleanString(source.lotto_asta) || undefined,
    valutazione_asta: cleanNumber(source.valutazione_asta),
    esclusione_portali: esclusionePortali,
    id_localita_immobiliareit: cleanString(source.id_localita_immobiliareit) || undefined,
    id_zona_immobiliareit: cleanString(source.id_zona_immobiliareit) || undefined,
    classe_immobile: cleanString(source.classe_immobile) || undefined,
    contratto_affitto: cleanString(source.contratto_affitto) || undefined,
    allarme_antifurto: toSOrN(source.allarme_antifurto, 'N'),
    portineria: toSOrN(source.portineria, 'N'),
    internet: toSOrN(source.internet, 'N'),
    mq_esterno: cleanNumber(source.mq_esterno),
    anno_costruzione: cleanNumber(source.anno_costruzione) ?? cleanNumber(base.buildingConstructionYear),
    titolo_annuncio: cleanString(source.titolo_annuncio) || cleanString(base.title) || undefined,
    tipo_riscaldamento: cleanString(source.tipo_riscaldamento) || undefined,
    asta: toSOrN(source.asta, 'N'),
    piscina: toSOrN(source.piscina, 'N'),
    caminetto: toSOrN(source.caminetto, 'N'),
    link_esterno: cleanString(source.link_esterno) || undefined,
    nr_altre_stanze: cleanNumber(source.nr_altre_stanze),
    prezzo_settimanale: cleanNumber(source.prezzo_settimanale),
    categoria_annuncio: cleanString(source.categoria_annuncio) || undefined,
    selectedPortalCodes,
    portalSelectionBaselineDone,
    immagini: images,
    videos
  };
};

export const applyOneClickPortalSelectionDelta = (
  current: OneClickData,
  previous?: OneClickData | null
): OneClickData => {
  const currentSelected = normalizeKnownPortalCodes(current?.selectedPortalCodes);
  const previousSelected = normalizeKnownPortalCodes(previous?.selectedPortalCodes);
  const previousHasBaseline = previous?.portalSelectionBaselineDone === true;
  const changedPortalCodes = previousHasBaseline
    ? ALL_ONECLICK_PORTAL_CODES.filter((code) => currentSelected.includes(code) !== previousSelected.includes(code))
    : [...ALL_ONECLICK_PORTAL_CODES];

  const exclusions: OneClickPortalExclusion[] = changedPortalCodes.map((portalCode) => ({
    tagName: `p${portalCode}`,
    portalCode,
    cancel: currentSelected.includes(portalCode) ? 1 : 0
  }));

  return {
    ...current,
    selectedPortalCodes: currentSelected,
    portalSelectionBaselineDone: true,
    esclusione_portali: exclusions
  };
};

export const validateOneClickData = (normalized: OneClickData) => {
  const errors: string[] = [];
  if (!cleanNumber(normalized.idtipologiaimmobile)) errors.push('idtipologiaimmobile obbligatorio');
  if (!cleanNumber(normalized.idtipologiaannuncio)) errors.push('idtipologiaannuncio obbligatorio');
  if (!cleanString(normalized.comune_istat)) errors.push('comune_istat obbligatorio');
  if (!cleanString(normalized.riferimento)) errors.push('riferimento obbligatorio');
  if (!cleanString(normalized.descrizione)) errors.push('descrizione obbligatoria');
  if (!cleanString(normalized.data_inserimento)) errors.push('data_inserimento obbligatoria');
  if (!cleanString(normalized.data_aggiornamento)) errors.push('data_aggiornamento obbligatoria');
  if (cleanString(normalized.id_localita_immobiliareit) && cleanString(normalized.id_zona_immobiliareit)) {
    errors.push('id_localita_immobiliareit e id_zona_immobiliareit non possono coesistere');
  }
  const title = cleanString(normalized.titolo_annuncio);
  if (title.length > 50) errors.push('titolo_annuncio supera 50 caratteri');
  if (Array.isArray(normalized.immagini) && normalized.immagini.length > 40) {
    errors.push('immagini supera il massimo di 40');
  }
  if (Array.isArray(normalized.videos) && normalized.videos.length > 4) {
    errors.push('videos supera il massimo di 4');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

const oneClickTag = (name: string, value: unknown, options?: { cdata?: boolean }) => {
  const text = value == null ? '' : String(value);
  if (!text.trim()) return '';
  if (options?.cdata) return `<${name}>${xmlCdata(text)}</${name}>`;
  return `<${name}>${xmlEscape(text)}</${name}>`;
};

const buildImageBlock = (images: OneClickImage[]) => {
  if (!Array.isArray(images) || images.length === 0) return '';
  const entries = images
    .slice(0, 40)
    .map(
      (img) =>
        `<immagine>${oneClickTag('link', img.link)}${oneClickTag('descrizione', img.description, { cdata: true })}${oneClickTag(
          'planimetria',
          img.planimetria || 'N'
        )}${oneClickTag('principale', img.principale || 'N')}</immagine>`
    )
    .join('');
  return `<immagini>${entries}</immagini>`;
};

const buildVideoBlock = (videos: OneClickVideo[]) => {
  if (!Array.isArray(videos) || videos.length === 0) return '';
  const entries = videos
    .slice(0, 4)
    .map(
      (video) =>
        `<video>${oneClickTag('titolo', video.titolo, { cdata: true })}${oneClickTag('tipo_video', video.tipo_video || 'V')}${oneClickTag(
          'link_video',
          video.link_video
        )}${oneClickTag('codice_embedded', video.codice_embedded, { cdata: true })}</video>`
    )
    .join('');
  return `<videos>${entries}</videos>`;
};

const buildExclusionBlock = (exclusions: OneClickPortalExclusion[]) => {
  if (!Array.isArray(exclusions) || exclusions.length === 0) return '';
  const entries = exclusions
    .map((row) => {
      const tag = cleanString(row.tagName) || `p${row.portalCode}`;
      const cancel = Number(row.cancel) === 1 ? '1' : '0';
      return `<${tag} Cancella="${cancel}">${xmlEscape(row.portalCode)}</${tag}>`;
    })
    .join('');
  return `<esclusione_portali>${entries}</esclusione_portali>`;
};

const REVIEW_MASKABLE_FIELDS = new Set<string>([
  'indirizzo',
  'cap',
  'latitudine',
  'longitudine',
  'mappa',
  'note_prezzo',
  'descrizione_breve',
  'descrizione_ing',
  'descrizione_ted',
  'descrizione_fra',
  'descrizione_spa',
  'link_esterno',
  'immagini',
  'videos'
]);

const applyPublicationReviewMask = (normalized: OneClickData): OneClickData => {
  const review = normalized?.publicationReview;
  const hiddenFields = Array.isArray(review?.hiddenFields)
    ? review.hiddenFields.filter((item) => typeof item === 'string' && item.trim())
    : [];
  if (!hiddenFields.length) return normalized;

  const next: OneClickData = { ...normalized };
  for (const rawField of hiddenFields) {
    const field = String(rawField).trim();
    if (!REVIEW_MASKABLE_FIELDS.has(field)) continue;
    if (field === 'immagini') {
      next.immagini = [];
      continue;
    }
    if (field === 'videos') {
      next.videos = [];
      continue;
    }
    (next as any)[field] = undefined;
  }
  return next;
};

export const buildOneClickAnnuncioXml = (property: GenericObject, normalized: OneClickData): string => {
  const fields = [
    oneClickTag('idtipologiaimmobile', normalized.idtipologiaimmobile),
    oneClickTag('idtipologiaannuncio', normalized.idtipologiaannuncio),
    oneClickTag('comune_istat', normalized.comune_istat),
    oneClickTag('zona', normalized.zona, { cdata: true }),
    oneClickTag('localita', normalized.localita, { cdata: true }),
    oneClickTag('nazione', normalized.nazione || 'IT'),
    oneClickTag('riferimento', normalized.riferimento),
    oneClickTag('prezzo', normalized.prezzo),
    oneClickTag('note_prezzo', normalized.note_prezzo, { cdata: true }),
    oneClickTag('mq', normalized.mq),
    oneClickTag('nr_locali', normalized.nr_locali),
    oneClickTag('note_locali', normalized.note_locali, { cdata: true }),
    oneClickTag('priorita', normalized.priorita),
    oneClickTag('nr_servizi', normalized.nr_servizi),
    oneClickTag('nr_camere', normalized.nr_camere),
    oneClickTag('ncostruzionesn', normalized.ncostruzionesn),
    oneClickTag('indirizzo', normalized.indirizzo, { cdata: true }),
    oneClickTag('mappa', normalized.mappa),
    oneClickTag('latitudine', normalized.latitudine),
    oneClickTag('longitudine', normalized.longitudine),
    oneClickTag('cap', normalized.cap),
    oneClickTag('box_auto', normalized.box_auto, { cdata: true }),
    oneClickTag('mq_box', normalized.mq_box),
    oneClickTag('vetrina', normalized.vetrina),
    oneClickTag('balcone', normalized.balcone),
    oneClickTag('nr_balconi', normalized.nr_balconi),
    oneClickTag('terrazzo', normalized.terrazzo),
    oneClickTag('nr_terrazzi', normalized.nr_terrazzi),
    oneClickTag('mansarda', normalized.mansarda),
    oneClickTag('cantina', normalized.cantina),
    oneClickTag('arredato', normalized.arredato),
    oneClickTag('giardino', normalized.giardino, { cdata: true }),
    oneClickTag('mq_giardino', normalized.mq_giardino),
    oneClickTag('unita_immobiliare', normalized.unita_immobiliare),
    oneClickTag('piano', normalized.piano, { cdata: true }),
    oneClickTag('totale_piani', normalized.totale_piani),
    oneClickTag('spese_cond_mensili', normalized.spese_cond_mensili),
    oneClickTag('condizioni', normalized.condizioni, { cdata: true }),
    oneClickTag('ascensore', normalized.ascensore),
    oneClickTag('cucina', normalized.cucina, { cdata: true }),
    oneClickTag('riscaldamento', normalized.riscaldamento, { cdata: true }),
    oneClickTag('condizionatore', normalized.condizionatore),
    oneClickTag('indirizzo_visibile', normalized.indirizzo_visibile),
    oneClickTag('disponibilita', normalized.disponibilita, { cdata: true }),
    oneClickTag('tipo_classe_energetica', normalized.tipo_classe_energetica),
    oneClickTag('classe_energetica', normalized.classe_energetica),
    oneClickTag('ipe', normalized.ipe),
    oneClickTag('ipe_rinnovabili', normalized.ipe_rinnovabili),
    oneClickTag('efficienza_estiva', normalized.efficienza_estiva, { cdata: true }),
    oneClickTag('efficienza_invernale', normalized.efficienza_invernale, { cdata: true }),
    oneClickTag('efficienza_zero', normalized.efficienza_zero),
    oneClickTag('ipe_certificato', normalized.ipe_certificato),
    oneClickTag('descrizione', normalized.descrizione, { cdata: true }),
    oneClickTag('descrizione_breve', normalized.descrizione_breve, { cdata: true }),
    oneClickTag('descrizione_ted', normalized.descrizione_ted, { cdata: true }),
    oneClickTag('descrizione_ing', normalized.descrizione_ing, { cdata: true }),
    oneClickTag('descrizione_fra', normalized.descrizione_fra, { cdata: true }),
    oneClickTag('descrizione_spa', normalized.descrizione_spa, { cdata: true }),
    oneClickTag('data_inserimento', normalized.data_inserimento),
    oneClickTag('data_aggiornamento', normalized.data_aggiornamento),
    oneClickTag('data_scadenza_asta', normalized.data_scadenza_asta),
    oneClickTag('codice_rge', normalized.codice_rge),
    oneClickTag('lotto_asta', normalized.lotto_asta),
    oneClickTag('valutazione_asta', normalized.valutazione_asta),
    buildExclusionBlock(normalized.esclusione_portali || []),
    oneClickTag('id_localita_immobiliareit', normalized.id_localita_immobiliareit),
    oneClickTag('id_zona_immobiliareit', normalized.id_zona_immobiliareit),
    oneClickTag('classe_immobile', normalized.classe_immobile, { cdata: true }),
    oneClickTag('contratto_affitto', normalized.contratto_affitto, { cdata: true }),
    oneClickTag('allarme_antifurto', normalized.allarme_antifurto),
    oneClickTag('portineria', normalized.portineria),
    oneClickTag('internet', normalized.internet),
    oneClickTag('mq_esterno', normalized.mq_esterno),
    oneClickTag('anno_costruzione', normalized.anno_costruzione),
    oneClickTag('titolo_annuncio', normalized.titolo_annuncio, { cdata: true }),
    oneClickTag('tipo_riscaldamento', normalized.tipo_riscaldamento, { cdata: true }),
    oneClickTag('asta', normalized.asta),
    oneClickTag('piscina', normalized.piscina),
    oneClickTag('caminetto', normalized.caminetto),
    oneClickTag('link_esterno', normalized.link_esterno, { cdata: true }),
    oneClickTag('nr_altre_stanze', normalized.nr_altre_stanze),
    oneClickTag('prezzo_settimanale', normalized.prezzo_settimanale),
    oneClickTag('categoria_annuncio', normalized.categoria_annuncio, { cdata: true }),
    buildImageBlock(normalized.immagini || []),
    buildVideoBlock(normalized.videos || [])
  ]
    .filter(Boolean)
    .join('');

  return `<annuncio>${fields}</annuncio>`;
};

export const buildOneClickFeedXml = (properties: GenericObject[]): string => {
  const items = (Array.isArray(properties) ? properties : [])
    .map((property) => {
      const normalized = normalizeOneClickData(property.oneClickData || {}, property);
      const validation = validateOneClickData(normalized);
      if (!validation.valid) return '';
      const masked = applyPublicationReviewMask(normalized);
      return buildOneClickAnnuncioXml(property, masked);
    })
    .filter(Boolean)
    .join('');

  const xml = `<?xml version="1.0" encoding="ISO-8859-1" ?>` + `<annunci>${items}</annunci>`;
  return sanitizeIso88591(xml);
};

export const normalizeAndValidateOneClickInput = (oneClickData: unknown, propertyBase: GenericObject) => {
  const normalized = normalizeOneClickData(oneClickData, propertyBase);
  const validation = validateOneClickData(normalized);
  return { normalized, validation };
};

export const defaultOneClickDataFromPropertyInput = (propertyBase: GenericObject): OneClickData => {
  const data = normalizeOneClickData({}, {
    ...propertyBase,
    createdAt: propertyBase?.createdAt || new Date(),
    updatedAt: new Date()
  });
  if (!data.data_inserimento) data.data_inserimento = formatDateTime(new Date());
  if (!data.data_aggiornamento) data.data_aggiornamento = formatDateTime(new Date());
  if (toSOrN(data.asta, 'N') === 'S' && !data.data_scadenza_asta) {
    data.data_scadenza_asta = formatDate(new Date());
  }
  return data;
};
