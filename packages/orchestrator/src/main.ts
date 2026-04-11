import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';

type StackStatus = 'PROVISIONING' | 'READY' | 'ERROR';

interface StackRecord {
  id: string;
  agencyId: string;
  slug: string;
  planCode: string | null;
  stackName: string | null;
  db: {
    name: string;
    user: string;
    password: string;
  };
  routing?: {
    host: string;
    https?: boolean;
  };
  status: StackStatus;
  baseUrl: string | null;
  error: string | null;
  adminEmail: string | null;
  adminName: string | null;
  adminPasswordHash: string | null;
  jwtSecret: string | null;
  databaseUrl: string | null;
}

const app = express();
app.use(cors());
app.use(bodyParser.json());

const stacks = new Map<string, StackRecord>();

const ORCHESTRATOR_PORT = Number(process.env.ORCHESTRATOR_PORT || 4100);
const INSTANCE_BASE_DOMAIN = (process.env.INSTANCE_BASE_DOMAIN || '').trim();
const STACK_COMMAND_ENV = 'ORCHESTRATOR_STACK_COMMAND';
const MIGRATE_COMMAND_ENV = 'ORCHESTRATOR_MIGRATE_COMMAND';
const ADMIN_COMMAND_ENV = 'ORCHESTRATOR_ADMIN_COMMAND';
const PORTALS_COMMAND_ENV = 'ORCHESTRATOR_PORTALS_COMMAND';
const INSTANCE_DB_HOST = process.env.INSTANCE_DB_HOST || 'localhost';
const INSTANCE_DB_PORT = process.env.INSTANCE_DB_PORT || '5432';

function normalizeBaseUrlFromRouting(slug: string, routing?: { host: string; https?: boolean } | undefined): string | null {
  if (routing && routing.host) {
    const scheme = routing.https === false ? 'http' : 'https';
    return `${scheme}://${routing.host}`;
  }
  if (INSTANCE_BASE_DOMAIN) {
    const cleanDomain = INSTANCE_BASE_DOMAIN.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return `https://${slug}.${cleanDomain}`;
  }
  return null;
}

function buildDatabaseUrl(dbName: string, dbUser: string, dbPassword: string) {
  const user = encodeURIComponent(dbUser);
  const pass = encodeURIComponent(dbPassword);
  return `postgresql://${user}:${pass}@${INSTANCE_DB_HOST}:${INSTANCE_DB_PORT}/${dbName}`;
}

function buildStackName(slug: string) {
  return `crm_agency_${slug}`;
}

async function runCommandFromEnv(envVarName: string, extraEnv: Record<string, string | null>): Promise<void> {
  const value = (process.env[envVarName] || '').trim();
  if (!value) {
    return;
  }

  const [command, ...args] = value.split(' ').filter(Boolean);
  if (!command) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        ...Object.fromEntries(
          Object.entries(extraEnv).map(([key, val]) => [key, val ?? ''])
        )
      }
    });

    child.on('error', error => {
      reject(error);
    });

    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command ${envVarName} exited with code ${code}`));
      }
    });
  });
}

app.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'orchestrator',
    message: 'CRM Immobiliare Orchestrator',
    endpoints: ['/stacks', '/stacks/:id', '/stacks/:id/migrate', '/stacks/:id/bootstrap-admin', '/stacks/:id/bootstrap-portals']
  });
});

app.get('/stacks', (req, res) => {
  const data = Array.from(stacks.values()).map(record => ({
    id: record.id,
    agencyId: record.agencyId,
    slug: record.slug,
    status: record.status,
    baseUrl: record.baseUrl,
    stackName: record.stackName,
    error: record.error
  }));

  res.json({
    success: true,
    data
  });
});

app.post('/stacks', async (req, res) => {
  const body = req.body || {};
  const slug = typeof body.slug === 'string' && body.slug.trim() ? String(body.slug).trim() : null;
  const agencyId = typeof body.agencyId === 'string' && body.agencyId.trim() ? String(body.agencyId).trim() : null;
  const planCode = body.planCode != null ? String(body.planCode) : null;
  const db = body.db && typeof body.db === 'object' ? body.db : null;
  const routing = body.routing && typeof body.routing === 'object' ? body.routing : undefined;
  const jwtSecretFromBody = typeof body.jwtSecret === 'string' && body.jwtSecret ? String(body.jwtSecret) : null;

  if (!slug || !agencyId || !db || typeof db.name !== 'string' || typeof db.user !== 'string' || typeof db.password !== 'string') {
    res.status(400).json({ success: false, message: 'Invalid stack payload' });
    return;
  }

  const id = uuidv4();
  const baseUrl = normalizeBaseUrlFromRouting(slug, routing);
  const stackName = buildStackName(slug);
  const dbName = String(db.name);
  const dbUser = String(db.user);
  const dbPass = String(db.password);
  const dbUrl = buildDatabaseUrl(dbName, dbUser, dbPass);
  const jwtSecret = jwtSecretFromBody || crypto.randomBytes(32).toString('hex');

  const record: StackRecord = {
    id,
    agencyId,
    slug,
    planCode,
    stackName,
    db: {
      name: dbName,
      user: dbUser,
      password: dbPass
    },
    routing: routing
      ? {
          host: String(routing.host),
          https: routing.https !== undefined ? Boolean(routing.https) : true
        }
      : undefined,
    status: 'PROVISIONING',
    baseUrl,
    error: null,
    adminEmail: null,
    adminName: null,
    adminPasswordHash: null,
    jwtSecret,
    databaseUrl: dbUrl
  };

  stacks.set(id, record);

  try {
    console.log(
      JSON.stringify({
        service: 'orchestrator',
        event: 'stack_create_start',
        id,
        agencyId,
        slug,
        stackName,
        baseUrl
      })
    );

    await runCommandFromEnv(STACK_COMMAND_ENV, {
      INSTANCE_SLUG: slug,
      INSTANCE_BASE_URL: baseUrl,
      INSTANCE_DB_NAME: dbName,
      INSTANCE_DB_USER: dbUser,
      INSTANCE_DB_PASS: dbPass,
      INSTANCE_JWT_SECRET: jwtSecret,
      DATABASE_URL: dbUrl,
      JWT_SECRET: jwtSecret,
      INSTANCE_STACK_NAME: stackName
    });
    record.status = 'READY';
    record.error = null;
    console.log(
      JSON.stringify({
        service: 'orchestrator',
        event: 'stack_create_success',
        id,
        agencyId,
        slug,
        stackName,
        baseUrl
      })
    );
  } catch (error: any) {
    record.status = 'ERROR';
    record.error = error?.message ? String(error.message) : 'Stack creation failed';
    console.error(
      JSON.stringify({
        service: 'orchestrator',
        event: 'stack_create_error',
        id,
        agencyId,
        slug,
        stackName,
        baseUrl,
        error: record.error
      })
    );
  }

  stacks.set(id, record);

  res.status(201).json({
    id,
    reference: id,
    status: record.status,
    baseUrl: record.baseUrl
  });
});

app.get('/stacks/:id', (req, res) => {
  const id = req.params.id;
  const record = stacks.get(id);
  if (!record) {
    res.status(404).json({ success: false, message: 'Stack not found' });
    return;
  }
  res.json({
    id: record.id,
    agencyId: record.agencyId,
    slug: record.slug,
    status: record.status,
    baseUrl: record.baseUrl,
    routing: record.routing,
    error: record.error
  });
});

app.post('/stacks/:id/migrate', async (req, res) => {
  const id = req.params.id;
  const record = stacks.get(id);
  if (!record) {
    res.status(404).json({ success: false, message: 'Stack not found' });
    return;
  }

  try {
    console.log(
      JSON.stringify({
        service: 'orchestrator',
        event: 'migrate_start',
        id: record.id,
        slug: record.slug,
        stackName: record.stackName
      })
    );

    await runCommandFromEnv(MIGRATE_COMMAND_ENV, {
      INSTANCE_SLUG: record.slug,
      INSTANCE_BASE_URL: record.baseUrl,
      INSTANCE_DB_NAME: record.db.name,
      INSTANCE_DB_USER: record.db.user,
      INSTANCE_DB_PASS: record.db.password,
      INSTANCE_JWT_SECRET: record.jwtSecret,
      DATABASE_URL: record.databaseUrl,
      JWT_SECRET: record.jwtSecret,
      INSTANCE_STACK_NAME: record.stackName
    });
    res.json({ success: true, message: 'Migrations applied' });
    console.log(
      JSON.stringify({
        service: 'orchestrator',
        event: 'migrate_success',
        id: record.id,
        slug: record.slug,
        stackName: record.stackName
      })
    );
  } catch (error: any) {
    record.status = 'ERROR';
    record.error = error?.message ? String(error.message) : 'Migration failed';
    stacks.set(id, record);
    console.error(
      JSON.stringify({
        service: 'orchestrator',
        event: 'migrate_error',
        id: record.id,
        slug: record.slug,
        stackName: record.stackName,
        error: record.error
      })
    );
    res.status(500).json({ success: false, message: 'Migration failed' });
  }
});

async function handleAdminBootstrap(req: express.Request, res: express.Response) {
  const id = req.params.id;
  const record = stacks.get(id);
  if (!record) {
    res.status(404).json({ success: false, message: 'Stack not found' });
    return;
  }

  const body = req.body || {};
  const email = typeof body.email === 'string' && body.email.trim() ? String(body.email).trim() : null;
  const name = typeof body.name === 'string' && body.name.trim() ? String(body.name).trim() : null;
  const password = typeof body.password === 'string' && body.password ? String(body.password) : null;

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Missing admin email or password' });
    return;
  }
  try {
    console.log(
      JSON.stringify({
        service: 'orchestrator',
        event: 'admin_bootstrap_start',
        id: record.id,
        slug: record.slug,
        stackName: record.stackName,
        adminEmail: email
      })
    );

    await runCommandFromEnv(ADMIN_COMMAND_ENV, {
      INSTANCE_SLUG: record.slug,
      INSTANCE_BASE_URL: record.baseUrl,
      INSTANCE_DB_NAME: record.db.name,
      INSTANCE_DB_USER: record.db.user,
      INSTANCE_DB_PASS: record.db.password,
      INSTANCE_JWT_SECRET: record.jwtSecret,
      DATABASE_URL: record.databaseUrl,
      JWT_SECRET: record.jwtSecret,
      INSTANCE_STACK_NAME: record.stackName,
      INSTANCE_ADMIN_EMAIL: email,
      INSTANCE_ADMIN_NAME: name
    });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    record.adminEmail = email;
    record.adminName = name;
    record.adminPasswordHash = hash;
    stacks.set(id, record);

    res.json({ success: true, message: 'Admin user created' });
    console.log(
      JSON.stringify({
        service: 'orchestrator',
        event: 'admin_bootstrap_success',
        id: record.id,
        slug: record.slug,
        stackName: record.stackName,
        adminEmail: email
      })
    );
  } catch (error: any) {
    record.status = 'ERROR';
    record.error = error?.message ? String(error.message) : 'Admin bootstrap failed';
    stacks.set(id, record);
    console.error(
      JSON.stringify({
        service: 'orchestrator',
        event: 'admin_bootstrap_error',
        id: record.id,
        slug: record.slug,
        stackName: record.stackName,
        adminEmail: email,
        error: record.error
      })
    );
    res.status(500).json({ success: false, message: 'Admin bootstrap failed' });
  }
}

app.post('/stacks/:id/bootstrap-admin', handleAdminBootstrap);
app.post('/stacks/:id/admin', handleAdminBootstrap);

app.post('/stacks/:id/bootstrap-portals', async (req, res) => {
  const id = req.params.id;
  const record = stacks.get(id);
  if (!record) {
    res.status(404).json({ success: false, message: 'Stack not found' });
    return;
  }
  try {
    console.log(
      JSON.stringify({
        service: 'orchestrator',
        event: 'portals_bootstrap_start',
        id: record.id,
        slug: record.slug,
        stackName: record.stackName
      })
    );

    await runCommandFromEnv(PORTALS_COMMAND_ENV, {
      INSTANCE_SLUG: record.slug,
      INSTANCE_BASE_URL: record.baseUrl,
      INSTANCE_DB_NAME: record.db.name,
      INSTANCE_DB_USER: record.db.user,
      INSTANCE_DB_PASS: record.db.password,
      INSTANCE_JWT_SECRET: record.jwtSecret,
      DATABASE_URL: record.databaseUrl,
      JWT_SECRET: record.jwtSecret,
      INSTANCE_STACK_NAME: record.stackName
    });
    res.json({ success: true, message: 'Portals seeded' });
  } catch (error: any) {
    record.status = 'ERROR';
    record.error = error?.message ? String(error.message) : 'Portals bootstrap failed';
    stacks.set(id, record);
    console.error(
      JSON.stringify({
        service: 'orchestrator',
        event: 'portals_bootstrap_error',
        id: record.id,
        slug: record.slug,
        stackName: record.stackName,
        error: record.error
      })
    );
    res.status(500).json({ success: false, message: 'Portals bootstrap failed' });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Orchestrator endpoint not found',
    path: req.originalUrl
  });
});

app.listen(ORCHESTRATOR_PORT, () => {
  console.log(`Orchestrator listening on port ${ORCHESTRATOR_PORT}`);
});
