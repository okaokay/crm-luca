import { PrismaClient, PortalConfigStatus, PortalConfigType } from '@prisma/client';
import { PORTAL_REGISTRY } from '../src/portalRegistry';

const prisma = new PrismaClient();

const REGISTRY_PORTAL_IDS = new Set(PORTAL_REGISTRY.map((p) => p.id));

async function main() {
  const agencies = await prisma.agency.findMany({
    select: {
      id: true,
      immoUsername: true,
      immoPassword: true,
      immoSource: true,
      immoEndpoint: true,
      giAgencyId: true,
      apimoProvider: true,
      apimoToken: true,
      apimoAgencyId: true
    }
  });

  const usedPortalsByAgency = new Map<string, Set<string>>();

  const properties = await prisma.property.findMany({
    where: {
      isPublished: true
    },
    select: {
      agencyId: true,
      portalTargets: true
    }
  });

  for (const property of properties) {
    if (!property.agencyId) continue;
    const portalTargets = Array.isArray(property.portalTargets) ? property.portalTargets : [];
    if (!portalTargets.length) continue;

    let set = usedPortalsByAgency.get(property.agencyId);
    if (!set) {
      set = new Set<string>();
      usedPortalsByAgency.set(property.agencyId, set);
    }

    for (const portalId of portalTargets) {
      if (portalId && typeof portalId === 'string') {
        set.add(portalId.trim());
      }
    }
  }

  for (const agency of agencies) {
    const portalSet = usedPortalsByAgency.get(agency.id) || new Set<string>();

    for (const portal of PORTAL_REGISTRY) {
      if (!portal.id || !REGISTRY_PORTAL_IDS.has(portal.id)) continue;

      const isUsed = portalSet.has(portal.id);
      const status = isUsed ? PortalConfigStatus.ACTIVE : PortalConfigStatus.INACTIVE;
      const active = isUsed;
      const type =
        portal.configMode === 'CENTRALIZZATO'
          ? PortalConfigType.CENTRALIZZATO
          : PortalConfigType.PER_AGENZIA;

      await prisma.portalConfig.upsert({
        where: {
          portalId_agencyId: {
            portalId: portal.id,
            agencyId: agency.id
          }
        },
        update: {
          status,
          active,
          type
        },
        create: {
          portalId: portal.id,
          agencyId: agency.id,
          status,
          active,
          type
        }
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async () => {
    await prisma.$disconnect();
    process.exit(1);
  });
