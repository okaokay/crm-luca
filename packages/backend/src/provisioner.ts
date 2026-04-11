import { PrismaClient, AgencyStatus, InstanceStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { saveSecret } from './secretManagerClient';

const prisma = new PrismaClient();

const POLL_INTERVAL_MS = Number(process.env.PROVISIONER_POLL_INTERVAL_MS || 10000);
const INSTANCE_BASE_DOMAIN = (process.env.INSTANCE_BASE_DOMAIN || '').trim();
const INSTANCE_PROVISIONER_COMMAND = (process.env.INSTANCE_PROVISIONER_COMMAND || '').trim();

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateSlug(agencyId: string) {
  const shortId = agencyId.slice(0, 8);
  return `agency-${shortId}`;
}

function generateRandomString(bytes: number) {
  return crypto.randomBytes(bytes).toString('hex');
}

function buildBaseUrl(slug: string) {
  if (INSTANCE_BASE_DOMAIN) {
    const cleanDomain = INSTANCE_BASE_DOMAIN.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return `https://${slug}.${cleanDomain}`;
  }
  return `http://localhost:4001`;
}

async function runOrchestrator(params: {
  slug: string;
  baseUrl: string;
  dbName: string;
  dbUser: string;
  dbPass: string;
  jwtSecret: string;
}): Promise<void> {
  if (!INSTANCE_PROVISIONER_COMMAND) {
    return;
  }

  const [command, ...baseArgs] = INSTANCE_PROVISIONER_COMMAND.split(' ').filter(Boolean);
  if (!command) {
    return;
  }

  const env = {
    ...process.env,
    INSTANCE_SLUG: params.slug,
    INSTANCE_BASE_URL: params.baseUrl,
    INSTANCE_DB_NAME: params.dbName,
    INSTANCE_DB_USER: params.dbUser,
    INSTANCE_DB_PASS: params.dbPass,
    INSTANCE_JWT_SECRET: params.jwtSecret
  };

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, baseArgs, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env
    });

    child.on('error', error => {
      reject(error);
    });

    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Orchestrator exited with code ${code}`));
      }
    });
  });
}

async function waitForInstanceHealth(baseUrl: string, timeoutMs: number) {
  const start = Date.now();
  const url = `${baseUrl.replace(/\/+$/, '')}/api/health`;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
    }
    await delay(3000);
  }

  throw new Error('Instance health check timeout');
}

async function provisionAgency(agencyId: string) {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { id: true, status: true }
  });

  if (!agency || agency.status !== AgencyStatus.PENDING_PROVISIONING) {
    return;
  }

  const slug = generateSlug(agency.id);
  const baseUrl = buildBaseUrl(slug);
  const dbName = `crm_${slug.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
  const dbUser = `u_${slug.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
  const dbPass = generateRandomString(16);
  const jwtSecret = generateRandomString(32);

  let instance = await prisma.instance.findUnique({
    where: { slug }
  });

  if (!instance) {
    instance = await prisma.instance.create({
      data: {
        agencyId: agency.id,
        slug,
        baseUrl,
        status: InstanceStatus.PROVISIONING,
        orchestratorReference: null
      }
    });
  } else {
    instance = await prisma.instance.update({
      where: { id: instance.id },
      data: {
        baseUrl,
        status: InstanceStatus.PROVISIONING
      }
    });
  }

  try {
    await saveSecret(`db/instance/${instance.id}`, {
      dbName,
      dbUser,
      dbPass,
      jwtSecret
    });

    await runOrchestrator({ slug, baseUrl, dbName, dbUser, dbPass, jwtSecret });
    await waitForInstanceHealth(baseUrl, 600000);

    await prisma.$transaction(async tx => {
      await tx.instance.update({
        where: { id: instance.id },
        data: {
          baseUrl,
          status: InstanceStatus.READY
        }
      });

      await tx.agency.update({
        where: { id: agency.id },
        data: {
          status: AgencyStatus.ACTIVE
        }
      });
    });

    await prisma.auditLog.create({
      data: {
        action: 'PROVISION_INSTANCE_SUCCESS',
        entity: 'Instance',
        entityId: instance.id,
        userId: null,
        userEmail: null,
        ipAddress: null,
        userAgent: null,
        changes: {
          agencyId: agency.id,
          instanceId: instance.id,
          baseUrl
        }
      }
    });
  } catch (error: any) {
    const message = error?.message ? String(error.message) : 'Provisioning failed';
    await prisma.$transaction(async tx => {
      await tx.instance.update({
        where: { id: instance.id },
        data: {
          status: InstanceStatus.ERROR,
          orchestratorReference: message
        }
      });
    });

    await prisma.auditLog.create({
      data: {
        action: 'PROVISION_INSTANCE_ERROR',
        entity: 'Instance',
        entityId: instance.id,
        userId: null,
        userEmail: null,
        ipAddress: null,
        userAgent: null,
        changes: {
          agencyId: agency.id,
          instanceId: instance.id,
          errorMessage: message
        }
      }
    });
  }
}

async function pollLoop() {
  while (true) {
    try {
      const pendingAgencies = await prisma.agency.findMany({
        where: {
          status: AgencyStatus.PENDING_PROVISIONING
        },
        select: {
          id: true
        }
      });

      for (const agency of pendingAgencies) {
        await provisionAgency(agency.id);
      }
    } catch {
    }

    await delay(POLL_INTERVAL_MS);
  }
}

pollLoop()
  .catch(() => {
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
