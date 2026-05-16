export const LEGACY_CAP_ZONE_LABEL_REGEX = /^CAP\s+(\d{5})$/i;

export const buildLegacyCapZoneLabel = (cap: string) => `CAP ${String(cap || '').trim()}`;

export const extractLegacyCapFromZoneLabel = (zoneLabel?: string | null): string | null => {
  const match = String(zoneLabel || '').trim().match(LEGACY_CAP_ZONE_LABEL_REGEX);
  return match ? String(match[1]) : null;
};

export const isLegacyCapZoneLabel = (zoneLabel?: string | null): boolean =>
  extractLegacyCapFromZoneLabel(zoneLabel) !== null;

export type ZoneKind = 'legacy_cap' | 'custom_perimeter';

export type ZoneIdentityDTO = {
  zoneKind: ZoneKind;
  zoneId?: string | null;
  cap?: string | null;
  region?: string | null;
  province?: string | null;
  city?: string | null;
  perimeterId?: string | null;
};

export const normalizeZoneIdentity = (input: Partial<ZoneIdentityDTO>): ZoneIdentityDTO => {
  const zoneKind: ZoneKind = input.zoneKind === 'custom_perimeter' ? 'custom_perimeter' : 'legacy_cap';
  return {
    zoneKind,
    zoneId: input.zoneId ? String(input.zoneId).trim() : null,
    cap: input.cap ? String(input.cap).trim() : null,
    region: input.region ? String(input.region).trim() : null,
    province: input.province ? String(input.province).trim() : null,
    city: input.city ? String(input.city).trim() : null,
    perimeterId: input.perimeterId ? String(input.perimeterId).trim() : null
  };
};
