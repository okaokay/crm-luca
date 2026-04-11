type NullableNumber = number | null | undefined;

export type MatchingWeights = {
  contractType: number;
  type: number;
  price: number;
  rooms: number;
  bathrooms: number;
  location: number;
};

export const MATCHING_WEIGHTS: MatchingWeights = {
  contractType: 20,
  type: 20,
  price: 25,
  rooms: 15,
  bathrooms: 10,
  location: 10
};

export type MatchCriterionPriority = 'required' | 'important' | 'optional';

export type MatchCriteria = {
  contractType?: string | null;
  type?: string | null;
  minPrice?: NullableNumber;
  maxPrice?: NullableNumber;
  minRooms?: NullableNumber;
  maxRooms?: NullableNumber;
  minBathrooms?: NullableNumber;
  maxBathrooms?: NullableNumber;
  cities?: string[] | null;
  provinces?: string[] | null;
  priorities?: Record<string, MatchCriterionPriority>;
};

export type MatchProperty = {
  id: string;
  title?: string | null;
  type?: string | null;
  contractType?: string | null;
  city?: string | null;
  province?: string | null;
  salePrice?: NullableNumber;
  rentPrice?: NullableNumber;
  rooms?: NullableNumber;
  bedrooms?: NullableNumber;
  bathrooms?: NullableNumber;
};

export type MatchResultComputed = {
  score: number;
  hardFiltersPassed: boolean;
  label: 'ALTO' | 'MEDIO' | 'BASSO';
  reasons: string[];
  gaps: string[];
  components: Record<string, number>;
};

const normalize = (value: any) => String(value ?? '').trim().toLowerCase();
const normalizeUpper = (value: any) => String(value ?? '').trim().toUpperCase();
const asNum = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const isSale = (value: any) => ['SALE', 'VENDITA'].includes(normalizeUpper(value));
const isRent = (value: any) => ['RENT', 'AFFITTO'].includes(normalizeUpper(value));

function getLabel(score: number): MatchResultComputed['label'] {
  if (score >= 80) return 'ALTO';
  if (score >= 60) return 'MEDIO';
  return 'BASSO';
}

export function computePropertyRequestMatch(
  property: MatchProperty,
  criteria: MatchCriteria,
  weights: MatchingWeights = MATCHING_WEIGHTS
): MatchResultComputed {
  const reasons: string[] = [];
  const gaps: string[] = [];
  const components: Record<string, number> = {};
  let totalScore = 0;

  const propertyContract = normalizeUpper(property.contractType);
  const requestedContract = normalizeUpper(criteria.contractType);
  if (requestedContract) {
    const contractOk =
      (requestedContract === 'SALE' && isSale(propertyContract)) ||
      (requestedContract === 'RENT' && isRent(propertyContract)) ||
      requestedContract === propertyContract;
    if (!contractOk) {
      gaps.push('Contratto non compatibile');
      return {
        score: 0,
        hardFiltersPassed: false,
        label: 'BASSO',
        reasons,
        gaps,
        components
      };
    }
    totalScore += weights.contractType;
    components.contractType = weights.contractType;
    reasons.push(`Contratto compatibile (${requestedContract})`);
  }

  const requestedType = normalizeUpper(criteria.type);
  const propertyType = normalizeUpper(property.type);
  if (requestedType) {
    if (requestedType !== propertyType) {
      gaps.push('Tipologia immobile non compatibile');
      return {
        score: 0,
        hardFiltersPassed: false,
        label: 'BASSO',
        reasons,
        gaps,
        components
      };
    }
    totalScore += weights.type;
    components.type = weights.type;
    reasons.push(`Tipologia compatibile (${propertyType})`);
  }

  const propertyPrice = isRent(propertyContract) ? asNum(property.rentPrice) : asNum(property.salePrice);
  const minPrice = asNum(criteria.minPrice);
  const maxPrice = asNum(criteria.maxPrice);
  if (minPrice !== null || maxPrice !== null) {
    let pricePoints = 0;
    if (propertyPrice === null) {
      gaps.push('Prezzo immobile mancante');
    } else {
      const min = minPrice ?? 0;
      const max = maxPrice ?? Number.MAX_SAFE_INTEGER;
      if (propertyPrice >= min && propertyPrice <= max) {
        pricePoints = weights.price;
        reasons.push('Prezzo nel range richiesto');
      } else {
        const toleranceMin = min * 0.9;
        const toleranceMax = max * 1.1;
        if (propertyPrice <= toleranceMax && propertyPrice >= toleranceMin) {
          pricePoints = Math.round(weights.price * 0.5 * 100) / 100;
          gaps.push('Prezzo fuori range ma in tolleranza');
        } else {
          gaps.push('Prezzo fuori range');
        }
      }
    }
    totalScore += pricePoints;
    components.price = pricePoints;
  }

  const cities = Array.isArray(criteria.cities) ? criteria.cities.filter(Boolean).map(normalize) : [];
  const provinces = Array.isArray(criteria.provinces) ? criteria.provinces.filter(Boolean).map(normalizeUpper) : [];
  const propertyCity = normalize(property.city);
  const propertyProvince = normalizeUpper(property.province);
  if (cities.length || provinces.length) {
    let locationPoints = 0;
    if (cities.length && cities.includes(propertyCity)) {
      locationPoints = weights.location;
      reasons.push(`Citta compatibile (${property.city})`);
    } else if (provinces.length && provinces.includes(propertyProvince)) {
      locationPoints = Math.round(weights.location * 0.6 * 100) / 100;
      reasons.push(`Provincia compatibile (${property.province})`);
    } else {
      gaps.push('Zona/citta non compatibile');
    }
    totalScore += locationPoints;
    components.location = locationPoints;
  }

  const rangeScore = (
    fieldKey: 'rooms' | 'bathrooms',
    label: string,
    actual: NullableNumber,
    min: NullableNumber,
    max: NullableNumber
  ) => {
    const actualValue = asNum(actual);
    const minValue = asNum(min);
    const maxValue = asNum(max);
    if (minValue === null && maxValue === null) return;
    if (actualValue === null) {
      gaps.push(`${label} mancanti`);
      return;
    }
    const inMin = minValue === null || actualValue >= minValue;
    const inMax = maxValue === null || actualValue <= maxValue;
    if (inMin && inMax) {
      totalScore += weights[fieldKey];
      components[fieldKey] = (components[fieldKey] || 0) + weights[fieldKey];
      reasons.push(`${label} in range`);
      return;
    }
    const toleranceMin = minValue !== null ? minValue - 1 : null;
    const toleranceMax = maxValue !== null ? maxValue + 1 : null;
    const inTolerance =
      (toleranceMin === null || actualValue >= toleranceMin) &&
      (toleranceMax === null || actualValue <= toleranceMax);
    if (inTolerance) {
      const partial = Math.round(weights[fieldKey] * 0.5 * 100) / 100;
      totalScore += partial;
      components[fieldKey] = (components[fieldKey] || 0) + partial;
      gaps.push(`${label} in tolleranza`);
      return;
    }
    gaps.push(`${label} fuori range`);
  };

  rangeScore('rooms', 'Camere', property.rooms ?? property.bedrooms, criteria.minRooms, criteria.maxRooms);
  rangeScore('bathrooms', 'Bagni', property.bathrooms, criteria.minBathrooms, criteria.maxBathrooms);

  const score = Math.max(0, Math.min(100, Math.round(totalScore * 100) / 100));
  return {
    score,
    hardFiltersPassed: true,
    label: getLabel(score),
    reasons: reasons.slice(0, 6),
    gaps: gaps.slice(0, 6),
    components
  };
}

export function getMatchStatusFromScore(score: number): string {
  if (score >= 80) return 'ALTO';
  if (score >= 60) return 'MEDIO';
  return 'BASSO';
}
