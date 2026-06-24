const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TYPE "PropertyStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED'`);
  console.log('PropertyStatus enum contains ARCHIVED');
}

main()
  .catch((error) => {
    console.error('Unable to ensure ARCHIVED property status:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
