export const getRandomElement = <T>(array: readonly T[]): T => {
  return array[Math.floor(Math.random() * array.length)];
};

export const getRandomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const getRandomDate = (start: Date, end: Date): Date => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

const CITIES = ['Milano', 'Roma', 'Napoli', 'Torino', 'Firenze', 'Bologna', 'Venezia'] as const;
const STREETS = ['Via Roma', 'Corso Italia', 'Piazza Duomo', 'Via Garibaldi', 'Viale dei Giardini', 'Via Dante'] as const;
const NAMES = ['Mario', 'Luigi', 'Giuseppe', 'Anna', 'Maria', 'Laura', 'Paolo', 'Francesca'] as const;
const SURNAMES = ['Rossi', 'Bianchi', 'Verdi', 'Ferrari', 'Esposito', 'Romano', 'Colombo'] as const;
const EMAILS_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'libero.it'] as const;

const PROPERTY_TITLES = [
  'Splendido appartamento in centro',
  'Villa con giardino',
  'Attico panoramico',
  'Monolocale moderno',
  'Loft ristrutturato',
  'Rustico in campagna',
  'Ufficio spazioso'
 ] as const;

const PROPERTY_DESCRIPTIONS = [
  'Luminoso e spazioso, situato in una zona tranquilla e ben servita.',
  'Recentemente ristrutturato con finiture di pregio, pronto per essere abitato.',
  'Ampio giardino privato e box auto incluso nel prezzo.',
  'Vista mozzafiato sulla città, ideale per giovani coppie.',
  'Ottimo investimento, attualmente locato con buona rendita.'
 ] as const;

const IMAGES = [
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800',
  'https://images.unsplash.com/photo-1600596542815-6ad4c7213aa5?w=800',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
  'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800'
 ] as const;

export const generateRandomProperty = () => {
  const type = getRandomElement(['APARTMENT', 'VILLA', 'OFFICE', 'LOFT', 'LAND', 'COMMERCIAL']);
  const contractType = getRandomElement(['SALE', 'RENT']);
  const salePrice = getRandomInt(100000, 1000000);
  const rentPrice = getRandomInt(500, 5000);

  return {
    title: getRandomElement(PROPERTY_TITLES),
    description: getRandomElement(PROPERTY_DESCRIPTIONS),
    type,
    contractType,
    status: 'AVAILABLE',
    address: `${getRandomElement(STREETS)} ${getRandomInt(1, 100)}`,
    city: getRandomElement(CITIES),
    province: 'MI',
    zipCode: `${getRandomInt(10000, 99999)}`,
    rooms: getRandomInt(1, 10),
    bedrooms: getRandomInt(1, 5),
    bathrooms: getRandomInt(1, 3),
    surface: getRandomInt(40, 500),
    salePrice: contractType === 'SALE' ? salePrice : undefined,
    rentPrice: contractType === 'RENT' ? rentPrice : undefined,
    energyClass: getRandomElement(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
    images: [getRandomElement(IMAGES), getRandomElement(IMAGES)],
    reference: `REF-${Date.now().toString().slice(-6)}${getRandomInt(100, 999)}`,
    notes: 'Generato automaticamente',
    ownerFirstName: getRandomElement(NAMES),
    ownerLastName: getRandomElement(SURNAMES),
    ownerEmail: `${getRandomElement(NAMES).toLowerCase()}.${getRandomElement(SURNAMES).toLowerCase()}@${getRandomElement(EMAILS_DOMAINS)}`,
    ownerPhone: `3${getRandomInt(100000000, 999999999)}`,
    ownerBirthDate: getRandomDate(new Date(1950, 0, 1), new Date(2000, 0, 1)).toISOString().split('T')[0],
    ownerBirthPlace: getRandomElement(CITIES),
    ownerFiscalCode: `CF${getRandomInt(10000000000, 99999999999)}`,
    ownerAddress: `${getRandomElement(STREETS)} ${getRandomInt(1, 100)}`,
    ownerCity: getRandomElement(CITIES),
    ownerZipCode: `${getRandomInt(10000, 99999)}`,
    buildingConstructionYear: getRandomInt(1950, 2024),
    buildingRenovationYear: getRandomInt(2000, 2024),
    buildingFloorsTotal: getRandomInt(1, 20),
    buildingHeatingType: getRandomElement(['Centralizzato', 'Autonomo']),
    buildingCondition: getRandomElement(['Ottimo', 'Buono', 'Da ristrutturare']),
    buildingElevator: Math.random() > 0.5,
    buildingConcierge: Math.random() > 0.5,
    buildingGardenShared: Math.random() > 0.5,
  };
};

export const generateRandomAgent = () => {
  const firstName = getRandomElement(NAMES);
  const lastName = getRandomElement(SURNAMES);
  const roles = ['AGENT', 'AGENCY_ADMIN', 'COLLABORATOR'] as const;
  return {
    name: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
    phone: `3${getRandomInt(100000000, 999999999)}`,
    role: getRandomElement(roles),
    isActive: true,
    commission: getRandomInt(1, 10),
    specialization: getRandomElement(['Residenziale', 'Commerciale', 'Luxury', 'Affitti']),
    notes: 'Generato automaticamente'
  };
};

export const generateRandomContact = (category: 'CLIENT' | 'PROPRIETOR' = 'CLIENT') => {
  const firstName = getRandomElement(NAMES);
  const lastName = getRandomElement(SURNAMES);
  const type =
    category === 'CLIENT'
      ? getRandomElement(['BUYER', 'TENANT'] as const)
      : getRandomElement(['SELLER', 'LANDLORD'] as const);

  return {
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${getRandomElement(EMAILS_DOMAINS)}`,
    phone: `3${getRandomInt(100000000, 999999999)}`,
    type,
    category,
    city: getRandomElement(CITIES),
    address: `${getRandomElement(STREETS)} ${getRandomInt(1, 100)}`,
    budget: getRandomInt(100000, 1000000),
    preferences: 'Cerca zona centrale, piano alto',
    source: getRandomElement(['Sito Web', 'Passaparola', 'Immobiliare.it', 'Idealista', 'Social Media'] as const),
    tags: [getRandomElement(['VIP', 'Investitore', 'Urgente', 'Prima Casa'])],
    notes: 'Generato automaticamente',
    isActive: true
  };
};

export const generateRandomAppointment = () => {
  const startTime = getRandomDate(new Date(), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour later

  return {
    title: 'Visita Immobile',
    description: 'Appuntamento per visita immobile di interesse',
    startTime: startTime.toISOString().slice(0, 16),
    endTime: endTime.toISOString().slice(0, 16),
    location: `${getRandomElement(STREETS)} ${getRandomInt(1, 100)}, ${getRandomElement(CITIES)}`,
    status: 'SCHEDULED',
    notes: 'Generato automaticamente'
  };
};

export const generateRandomContract = () => {
   // This is a bit more complex as it depends on template, but we can generate some common fields
   return {
     locatori_multipli: false,
     conduttori_multipli: false,
     locatori: [{
       nome: `${getRandomElement(NAMES)} ${getRandomElement(SURNAMES)}`,
       nascita_luogo: getRandomElement(CITIES),
       nascita_data: '1980-01-01',
       residenza: getRandomElement(CITIES),
       via: getRandomElement(STREETS),
       civico: `${getRandomInt(1, 100)}`,
       cf: 'RSSMRA80A01H501Z'
     }],
     conduttori: [{
       nome: `${getRandomElement(NAMES)} ${getRandomElement(SURNAMES)}`,
       nascita_luogo: getRandomElement(CITIES),
       nascita_data: '1990-01-01',
       residenza: getRandomElement(CITIES),
       via: getRandomElement(STREETS),
       civico: `${getRandomInt(1, 100)}`,
       cf: 'BNCGPP90A01H501Z',
       documento_tipo: 'Carta d\'identità',
       documento_numero: 'CA12345AA',
       documento_comune: getRandomElement(CITIES),
       documento_data: '2020-01-01'
     }],
     include_deposito_precedente: Math.random() > 0.5,
     include_arredi: Math.random() > 0.5,
     include_cedolare_secca: Math.random() > 0.5,
     immobile_comune: getRandomElement(CITIES),
     immobile_via: getRandomElement(STREETS),
     immobile_civico: `${getRandomInt(1, 100)}`,
     immobile_piano: `${getRandomInt(1, 10)}`,
     immobile_cat_foglio: `${getRandomInt(1, 100)}`,
     immobile_cat_particella: `${getRandomInt(1, 100)}`,
     immobile_cat_sub: `${getRandomInt(1, 100)}`,
     immobile_cat_categoria: 'A/3',
     immobile_cat_rendita: `${getRandomInt(500, 2000)}`,
     canone_annuo: `${getRandomInt(6000, 24000)}`,
     spese_annue: `${getRandomInt(1000, 5000)}`,
     deposito_cauzionale: `${getRandomInt(1500, 6000)}`,
     pagamento_modalita: 'Bonifico bancario',
     pagamento_giorno: '5',
     durata_anni: '4',
     decorrenza_data: new Date().toISOString().slice(0, 10),
     chiavi_immobile: `${getRandomInt(1, 5)}`
   };
};
