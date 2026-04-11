import { PrismaClient, AgencyStatus, SubscriptionStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function migrateAgency(agencyId: string, defaultPlanCode: string) {
  await prisma.$transaction(async tx => {
    let agency = await tx.agency.findUnique({
      where: { id: agencyId }
    })
    if (!agency) {
      return
    }

    if (agency.status !== AgencyStatus.PENDING_PROVISIONING) {
      agency = await tx.agency.update({
        where: { id: agency.id },
        data: { status: AgencyStatus.PENDING_PROVISIONING }
      })
    }

    let subscription = await tx.subscription.findFirst({
      where: { agencyId: agency.id },
      orderBy: { createdAt: 'desc' }
    })

    const planCode = subscription?.planCode || defaultPlanCode

    if (!subscription) {
      subscription = await tx.subscription.create({
        data: {
          agencyId: agency.id,
          planCode,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: null
        }
      })
    } else if (!subscription.planCode) {
      subscription = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          planCode
        }
      })
    }

    await tx.auditLog.create({
      data: {
        action: 'LEGACY_AGENCY_PREPARED_FOR_PROVISIONING',
        entity: 'Agency',
        entityId: agency.id,
        userId: null,
        ipAddress: null,
        changes: {
          planCode,
          previousStatus: agency.status,
          newStatus: agency.status
        } as any
      }
    })
  })
}

async function main() {
  const rawPlanCode = process.env.MIGRATION_PLAN_CODE
  const defaultPlanCode = rawPlanCode && rawPlanCode.trim() ? rawPlanCode.trim() : 'default'

  console.log('🚚 Migrazione agenzie legacy verso modello multi-istanza')
  console.log('Piano utilizzato per le subscription senza planCode:', defaultPlanCode)

  const agencies = await prisma.agency.findMany({
    where: {
      isActive: true
    },
    select: {
      id: true,
      name: true,
      email: true,
      status: true
    }
  })

  if (!agencies.length) {
    console.log('Nessuna agenzia trovata da migrare')
    return
  }

  const startedAt = Date.now()

  for (const agency of agencies) {
    const t0 = Date.now()
    console.log(`➡️ Inizio migrazione agenzia ${agency.id} (${agency.name} - ${agency.email})`)
    await migrateAgency(agency.id, defaultPlanCode)
    const elapsedMs = Date.now() - t0
    console.log(`✅ Agenzia ${agency.id} migrata in ${elapsedMs}ms`)
  }

  const totalMs = Date.now() - startedAt
  console.log(`🏁 Migrazione completata per ${agencies.length} agenzie in ${totalMs}ms`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async error => {
    console.error('Errore migrazione agenzie legacy:', error)
    await prisma.$disconnect()
    process.exit(1)
  })

