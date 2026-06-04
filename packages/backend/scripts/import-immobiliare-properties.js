#!/usr/bin/env node
require('dotenv/config');

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function loadImporter() {
  const candidates = [
    '../dist/src/immobiliareCsvImport',
    '../dist/immobiliareCsvImport',
    '../src/immobiliareCsvImport'
  ];

  let lastError = null;
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to load immobiliare CSV importer module');
}

const { importImmobiliareCsvBuffer } = loadImporter();

const prisma = new PrismaClient();

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    throw new Error('Usage: node scripts/import-immobiliare-properties.js <csv-path> [admin-email]');
  }

  const adminEmailArg = process.argv[3] || process.env.IMPORT_ADMIN_EMAIL || 'admin@agenziademo.it';
  const csvPath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  let admin = await prisma.user.findFirst({
    where: {
      email: adminEmailArg,
      role: { in: ['SUPER_ADMIN', 'AGENCY_ADMIN'] }
    },
    select: { id: true, email: true, agencyId: true, role: true }
  });

  if (!admin) {
    admin = await prisma.user.findFirst({
      where: {
        role: { in: ['SUPER_ADMIN', 'AGENCY_ADMIN'] }
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, agencyId: true, role: true }
    });
  }

  if (!admin || !admin.agencyId) {
    throw new Error('No admin user with agencyId found for import');
  }

  const csvBuffer = fs.readFileSync(csvPath);
  const report = await importImmobiliareCsvBuffer({
    prisma,
    csvBuffer,
    agencyId: admin.agencyId,
    ownerId: admin.id
  });

  console.log(JSON.stringify({
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      agencyId: admin.agencyId
    },
    report
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
