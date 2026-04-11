import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Inizio seeding del database...')

  const internalPasswordHash = await bcrypt.hash('demo123', 10)

  const internalUser = await prisma.internalUser.upsert({
    where: { email: 'owner@crm.local' },
    update: {
      passwordHash: internalPasswordHash,
      role: 'OWNER',
      mfaSecret: 'DISABLED',
    },
    create: {
      email: 'owner@crm.local',
      passwordHash: internalPasswordHash,
      role: 'OWNER',
      mfaSecret: 'DISABLED',
    },
  })

  console.log('✅ Utente interno creato o aggiornato:', internalUser.email)

  const existingUsers = await prisma.user.count()
  const existingProperties = await prisma.property.count()
  const existingContacts = await prisma.contact.count()

  if (existingUsers > 0 || existingProperties > 0 || existingContacts > 0) {
    console.log('⚠️ Dati già presenti nel database, seeding demo saltato.')
    return
  }

  // Crea agenzia demo
  const agency = await prisma.agency.upsert({
    where: { email: 'info@agenziademo.it' },
    update: {
      name: 'Agenzia Immobiliare Demo',
      phone: '+39 06 1234567',
      address: 'Via Roma 123',
      city: 'Roma',
      province: 'RM',
      zipCode: '00100',
      vatNumber: 'IT12345678901',
      website: 'https://agenziademo.it',
      isActive: true,
    },
    create: {
      name: 'Agenzia Immobiliare Demo',
      email: 'info@agenziademo.it',
      phone: '+39 06 1234567',
      address: 'Via Roma 123',
      city: 'Roma',
      province: 'RM',
      zipCode: '00100',
      vatNumber: 'IT12345678901',
      website: 'https://agenziademo.it',
      isActive: true,
    },
  })

  console.log('✅ Agenzia creata:', agency.name)

  // Hash password per utenti demo
  const hashedPassword = await bcrypt.hash('demo123', 10)

  // Crea utenti demo
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@agenziademo.it' },
      update: {
        password: hashedPassword,
        firstName: 'Mario',
        lastName: 'Rossi',
        phone: '+39 333 1234567',
        role: 'AGENCY_ADMIN',
        agencyId: agency.id,
        isActive: true,
      },
      create: {
        email: 'admin@agenziademo.it',
        password: hashedPassword,
        firstName: 'Mario',
        lastName: 'Rossi',
        phone: '+39 333 1234567',
        role: 'AGENCY_ADMIN',
        agencyId: agency.id,
        isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'agente1@agenziademo.it' },
      update: {
        password: hashedPassword,
        firstName: 'Giulia',
        lastName: 'Bianchi',
        phone: '+39 333 2345678',
        role: 'AGENT',
        agencyId: agency.id,
        isActive: true,
      },
      create: {
        email: 'agente1@agenziademo.it',
        password: hashedPassword,
        firstName: 'Giulia',
        lastName: 'Bianchi',
        phone: '+39 333 2345678',
        role: 'AGENT',
        agencyId: agency.id,
        isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'agente2@agenziademo.it' },
      update: {
        password: hashedPassword,
        firstName: 'Luca',
        lastName: 'Verdi',
        phone: '+39 333 3456789',
        role: 'AGENT',
        agencyId: agency.id,
        isActive: true,
      },
      create: {
        email: 'agente2@agenziademo.it',
        password: hashedPassword,
        firstName: 'Luca',
        lastName: 'Verdi',
        phone: '+39 333 3456789',
        role: 'AGENT',
        agencyId: agency.id,
        isActive: true,
      },
    }),
  ])

  console.log('✅ Utenti creati:', users.length)

  // Crea contatti demo
  const contacts = await Promise.all([
    prisma.contact.create({
      data: {
        firstName: 'Anna',
        lastName: 'Ferrari',
        email: 'anna.ferrari@email.com',
        phone: '+39 333 4567890',
        type: 'BUYER',
        address: 'Via Milano 45',
        city: 'Roma',
        province: 'RM',
        zipCode: '00100',
        notes: 'Interessata ad appartamenti in centro',
        privacyConsent: true,
        marketingConsent: true,
        consentDate: new Date(),
        source: 'Sito web',
        tags: ['VIP', 'Centro storico'],
        agencyId: agency.id,
        assignedToId: users[1].id,
      },
    }),
    prisma.contact.create({
      data: {
        firstName: 'Marco',
        lastName: 'Neri',
        email: 'marco.neri@email.com',
        phone: '+39 333 5678901',
        type: 'SELLER',
        address: 'Via Napoli 78',
        city: 'Roma',
        province: 'RM',
        zipCode: '00100',
        notes: 'Vuole vendere villa in periferia',
        privacyConsent: true,
        marketingConsent: false,
        consentDate: new Date(),
        source: 'Passaparola',
        tags: ['Periferia', 'Villa'],
        agencyId: agency.id,
        assignedToId: users[2].id,
      },
    }),
    prisma.contact.create({
      data: {
        firstName: 'Sara',
        lastName: 'Blu',
        email: 'sara.blu@email.com',
        phone: '+39 333 6789012',
        type: 'TENANT',
        address: 'Via Torino 12',
        city: 'Milano',
        province: 'MI',
        zipCode: '20100',
        notes: 'Cerca bilocale in affitto',
        privacyConsent: true,
        marketingConsent: true,
        consentDate: new Date(),
        source: 'Facebook',
        tags: ['Affitto', 'Milano'],
        agencyId: agency.id,
        assignedToId: users[1].id,
      },
    }),
  ])

  console.log('✅ Contatti creati:', contacts.length)

  // Crea immobili demo
  const properties = await Promise.all([
    prisma.property.upsert({
      where: { reference: 'ROM001' },
      update: {},
      create: {
        title: 'Elegante Appartamento Centro Storico',
        description: 'Splendido appartamento di 120 mq nel cuore del centro storico di Roma. Completamente ristrutturato con finiture di pregio.',
        type: 'APARTMENT',
        contractType: 'SALE',
        status: 'AVAILABLE',
        address: 'Via del Corso 100',
        city: 'Roma',
        province: 'RM',
        zipCode: '00186',
        latitude: 41.9028,
        longitude: 12.4964,
        rooms: 4,
        bedrooms: 2,
        bathrooms: 2,
        surface: 120,
        terrace: 15,
        floor: 3,
        totalFloors: 5,
        elevator: true,
        furnished: false,
        salePrice: 650000,
        energyClass: 'C',
        images: [
          'https://example.com/image1.jpg',
          'https://example.com/image2.jpg',
          'https://example.com/image3.jpg',
        ],
        reference: 'ROM001',
        notes: 'Immobile di pregio in posizione strategica',
        isPublished: true,
        publishedAt: new Date(),
        agencyId: agency.id,
        ownerId: users[1].id,
      },
    }),
    prisma.property.upsert({
      where: { reference: 'ROM002' },
      update: {},
      create: {
        title: 'Villa con Giardino - Zona Residenziale',
        description: 'Magnifica villa indipendente di 250 mq con giardino privato di 500 mq. Ideale per famiglie.',
        type: 'VILLA',
        contractType: 'SALE',
        status: 'AVAILABLE',
        address: 'Via dei Pini 25',
        city: 'Roma',
        province: 'RM',
        zipCode: '00142',
        latitude: 41.8583,
        longitude: 12.4774,
        rooms: 6,
        bedrooms: 4,
        bathrooms: 3,
        surface: 250,
        garden: 500,
        parking: 2,
        totalFloors: 2,
        elevator: false,
        furnished: false,
        salePrice: 850000,
        energyClass: 'B',
        images: [
          'https://example.com/villa1.jpg',
          'https://example.com/villa2.jpg',
        ],
        reference: 'ROM002',
        notes: 'Villa in zona tranquilla e ben servita',
        isPublished: true,
        publishedAt: new Date(),
        agencyId: agency.id,
        ownerId: users[2].id,
      },
    }),
    prisma.property.upsert({
      where: { reference: 'ROM003' },
      update: {},
      create: {
        title: 'Bilocale Moderno - Zona Universitaria',
        description: 'Grazioso bilocale di 65 mq, completamente arredato, perfetto per studenti o giovani professionisti.',
        type: 'APARTMENT',
        contractType: 'RENT',
        status: 'AVAILABLE',
        address: 'Via dei Cappuccini 15',
        city: 'Roma',
        province: 'RM',
        zipCode: '00187',
        latitude: 41.9109,
        longitude: 12.4818,
        rooms: 2,
        bedrooms: 1,
        bathrooms: 1,
        surface: 65,
        balcony: 8,
        floor: 2,
        totalFloors: 4,
        elevator: true,
        furnished: true,
        rentPrice: 1200,
        expenses: 150,
        energyClass: 'D',
        images: [
          'https://example.com/bilocale1.jpg',
        ],
        reference: 'ROM003',
        notes: 'Ideale per studenti, vicino alla Sapienza',
        isPublished: true,
        publishedAt: new Date(),
        agencyId: agency.id,
        ownerId: users[1].id,
      },
    }),
  ])

  console.log('✅ Immobili creati:', properties.length)

  // Crea richieste demo
  const requests = await Promise.all([
    prisma.request.create({
      data: {
        title: 'Cerca Appartamento Centro Roma',
        description: 'Famiglia cerca appartamento di 3-4 locali in centro Roma, budget max 600k',
        type: 'APARTMENT',
        contractType: 'SALE',
        status: 'ACTIVE',
        minPrice: 400000,
        maxPrice: 600000,
        minSurface: 90,
        maxSurface: 130,
        minRooms: 3,
        maxRooms: 4,
        cities: ['Roma'],
        provinces: ['RM'],
        elevator: true,
        parking: false,
        priority: 5,
        notes: 'Cliente molto motivato, disponibilità immediata',
        agencyId: agency.id,
        contactId: contacts[0].id,
        assignedToId: users[1].id,
      },
    }),
    prisma.request.create({
      data: {
        title: 'Cerca Bilocale in Affitto Milano',
        description: 'Giovane professionista cerca bilocale arredato in zona centrale Milano',
        type: 'APARTMENT',
        contractType: 'RENT',
        status: 'ACTIVE',
        minPrice: 800,
        maxPrice: 1500,
        minSurface: 50,
        maxSurface: 80,
        minRooms: 2,
        maxRooms: 3,
        cities: ['Milano'],
        provinces: ['MI'],
        elevator: true,
        furnished: true,
        priority: 3,
        notes: 'Disponibile da subito, referenze ottime',
        agencyId: agency.id,
        contactId: contacts[2].id,
        assignedToId: users[1].id,
      },
    }),
  ])

  console.log('✅ Richieste create:', requests.length)

  // Crea appuntamenti demo
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(10, 0, 0, 0)

  const nextWeek = new Date()
  nextWeek.setDate(nextWeek.getDate() + 7)
  nextWeek.setHours(15, 0, 0, 0)

  const appointments = await Promise.all([
    prisma.appointment.create({
      data: {
        title: 'Visita Appartamento Centro',
        description: 'Visita con la famiglia Ferrari per appartamento in Via del Corso',
        startTime: tomorrow,
        endTime: new Date(tomorrow.getTime() + 60 * 60 * 1000), // +1 ora
        location: 'Via del Corso 100, Roma',
        status: 'SCHEDULED',
        notes: 'Portare chiavi e documentazione',
        reminder: true,
        reminderSent: false,
        agencyId: agency.id,
        assignedToId: users[1].id,
        contactId: contacts[0].id,
        propertyId: properties[0].id,
      },
    }),
    prisma.appointment.create({
      data: {
        title: 'Incontro Valutazione Villa',
        description: 'Incontro per valutazione villa con proprietario',
        startTime: nextWeek,
        endTime: new Date(nextWeek.getTime() + 90 * 60 * 1000), // +1.5 ore
        location: 'Via dei Pini 25, Roma',
        status: 'CONFIRMED',
        notes: 'Preparare comparables di zona',
        reminder: true,
        reminderSent: false,
        agencyId: agency.id,
        assignedToId: users[2].id,
        contactId: contacts[1].id,
        propertyId: properties[1].id,
      },
    }),
  ])

  console.log('✅ Appuntamenti creati:', appointments.length)

  // Crea attività demo
  const activities = await Promise.all([
    prisma.activity.create({
      data: {
        type: 'CALL',
        title: 'Chiamata di follow-up',
        description: 'Chiamare cliente per feedback dopo visita',
        completed: false,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // domani
        priority: 4,
        tags: ['Follow-up', 'Vendita'],
        agencyId: agency.id,
        assignedToId: users[1].id,
        contactId: contacts[0].id,
        propertyId: properties[0].id,
      },
    }),
    prisma.activity.create({
      data: {
        type: 'EMAIL',
        title: 'Invio documentazione',
        description: 'Inviare planimetrie e APE al cliente',
        completed: true,
        completedAt: new Date(),
        priority: 3,
        tags: ['Documentazione'],
        agencyId: agency.id,
        assignedToId: users[2].id,
        contactId: contacts[1].id,
        propertyId: properties[1].id,
      },
    }),
    prisma.activity.create({
      data: {
        type: 'TASK',
        title: 'Aggiornare foto immobile',
        description: 'Scattare nuove foto per bilocale zona universitaria',
        completed: false,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // tra 3 giorni
        priority: 2,
        tags: ['Marketing', 'Foto'],
        agencyId: agency.id,
        assignedToId: users[1].id,
        propertyId: properties[2].id,
      },
    }),
  ])

  console.log('✅ Attività create:', activities.length)

  // Crea matching demo
  const matches = await Promise.all([
    prisma.propertyMatch.create({
      data: {
        score: 85.5,
        viewed: false,
        contacted: false,
        propertyId: properties[0].id,
        requestId: requests[0].id,
      },
    }),
    prisma.propertyMatch.create({
      data: {
        score: 92.0,
        viewed: true,
        contacted: true,
        propertyId: properties[2].id,
        requestId: requests[1].id,
      },
    }),
  ])

  console.log('✅ Match creati:', matches.length)

  // Crea campagna demo
  const campaign = await prisma.campaign.create({
    data: {
      name: 'Newsletter Gennaio 2024',
      type: 'EMAIL',
      status: 'COMPLETED',
      subject: 'Nuove opportunità immobiliari questo mese',
      content: 'Scopri le migliori offerte immobiliari selezionate per te...',
      scheduledAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 giorni fa
      sentAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      totalSent: 150,
      totalOpened: 89,
      totalClicked: 23,
      tags: ['Newsletter', 'Gennaio'],
      agencyId: agency.id,
      createdById: users[0].id,
    },
  })

  console.log('✅ Campagna creata:', campaign.name)

  // Crea alcuni log di audit demo
  await Promise.all([
    prisma.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'Property',
        entityId: properties[0].id,
        userId: users[1].id,
        userEmail: users[1].email,
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        changes: {
          title: 'Elegante Appartamento Centro Storico',
          status: 'AVAILABLE',
        },
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'UPDATE',
        entity: 'Contact',
        entityId: contacts[0].id,
        userId: users[1].id,
        userEmail: users[1].email,
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        changes: {
          phone: '+39 333 4567890',
          notes: 'Interessata ad appartamenti in centro',
        },
      },
    }),
  ])

  console.log('✅ Log di audit creati')

  console.log('\n🎉 Seeding completato con successo!')
  console.log('\n📊 Riepilogo dati creati:')
  console.log(`   • 1 Agenzia`)
  console.log(`   • ${users.length} Utenti`)
  console.log(`   • ${contacts.length} Contatti`)
  console.log(`   • ${properties.length} Immobili`)
  console.log(`   • ${requests.length} Richieste`)
  console.log(`   • ${appointments.length} Appuntamenti`)
  console.log(`   • ${activities.length} Attività`)
  console.log(`   • ${matches.length} Match`)
  console.log(`   • 1 Campagna`)
  console.log(`   • 2 Log di audit`)

  console.log('\n🔑 Credenziali di accesso:')
  console.log('   Admin: admin@agenziademo.it / demo123')
  console.log('   Agente 1: agente1@agenziademo.it / demo123')
  console.log('   Agente 2: agente2@agenziademo.it / demo123')
  console.log('   Utente interno: owner@crm.local / demo123')
}

main()
  .catch((e) => {
    console.error('❌ Errore durante il seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  }) 
