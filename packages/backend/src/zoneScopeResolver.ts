import { buildLegacyCapZoneLabel, normalizeZoneIdentity, ZoneIdentityDTO } from './zoneIdentity';

type ResolveZoneScopeParams = {
  prismaAny: any;
  agencyId: string;
  identity: Partial<ZoneIdentityDTO>;
};

export const resolveZoneScope = async (params: ResolveZoneScopeParams) => {
  const { prismaAny, agencyId } = params;
  const identity = normalizeZoneIdentity(params.identity);

  if (identity.zoneId) {
    const zoneById = await prismaAny.agentZone.findFirst({
      where: { id: identity.zoneId, agencyId },
      select: { id: true, agencyId: true, region: true, province: true, city: true, zone: true }
    });
    if (zoneById) {
      return { zone: zoneById, identity };
    }
  }

  if (identity.zoneKind === 'legacy_cap') {
    const cap = String(identity.cap || '').trim();
    const region = String(identity.region || '').trim();
    const province = String(identity.province || '').trim();
    const city = String(identity.city || '').trim();
    if (!cap || !region || !province || !city) {
      return { zone: null, identity };
    }
    const zone = await prismaAny.agentZone.findFirst({
      where: {
        agencyId,
        region,
        province,
        city,
        zone: buildLegacyCapZoneLabel(cap)
      },
      select: { id: true, agencyId: true, region: true, province: true, city: true, zone: true }
    });
    return { zone: zone || null, identity };
  }

  // custom_perimeter is design-ready only. Runtime matching will be added once perimeter specs are complete.
  return { zone: null, identity };
};
