// @ts-nocheck
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import fs from 'fs';
import {
  PrismaClient,
  Prisma,
  ImmoSyncStatus,
  TicketStatus,
  TicketSenderType,
  PortalActivationStatus,
  PortalConfigType,
  PortalConfigStatus,
  AgencyStatus,
  InstanceStatus,
  SubscriptionStatus,
  InternalUserRole,
  OnboardingStatus
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import multer from 'multer';
const Minio = require('minio');
const webpush = require('web-push');
import speakeasy from 'speakeasy';
import Stripe from 'stripe';
import * as crypto from 'crypto';
import client from 'prom-client';
import { PORTAL_REGISTRY, PortalRequirement, PortalRegistryItem } from './portalRegistry';
import {
  applyOneClickPortalSelectionDelta,
  buildOneClickFeedXml,
  defaultOneClickDataFromPropertyInput,
  normalizeAndValidateOneClickInput,
  ONECLICK_ANNOUNCEMENT_TYPES,
  ONECLICK_ENUMS,
  ONECLICK_PORTAL_CODES,
  ONECLICK_PROPERTY_TYPES
} from './oneclick';
import {
  computePropertyRequestMatch,
  getMatchStatusFromScore,
  MATCHING_WEIGHTS
} from './matchingEngine';
import { saveSecret, getSecret } from './secretManagerClient';
import { buildLegacyCapZoneLabel, extractLegacyCapFromZoneLabel } from './zoneIdentity';
import { resolveZoneScope } from './zoneScopeResolver';

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4001;
const APP_RUNTIME = String(process.env.APP_RUNTIME || '').trim().toLowerCase();
const IS_VERCEL_RUNTIME =
  APP_RUNTIME === 'vercel' ||
  process.env.VERCEL === '1' ||
  String(process.env.VERCEL_ENV || '').trim().length > 0;
const INTERNAL_JWT_SECRET = process.env.INTERNAL_JWT_SECRET;
const INTERNAL_MFA_WINDOW = Number(process.env.INTERNAL_MFA_WINDOW || 1);
const INTERNAL_MFA_DISABLED_SENTINEL = 'DISABLED';
const INTERNAL_IP_ALLOWLIST = (process.env.INTERNAL_IP_ALLOWLIST || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY || '').trim();
const STRIPE_WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
const WEB_PUSH_VAPID_PUBLIC_KEY = (
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY ||
  process.env.VAPID_PUBLIC_KEY ||
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  ''
).trim();
const WEB_PUSH_VAPID_PRIVATE_KEY = (
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY ||
  process.env.VAPID_PRIVATE_KEY ||
  ''
).trim();
const WEB_PUSH_VAPID_SUBJECT = (
  process.env.WEB_PUSH_VAPID_SUBJECT ||
  process.env.VAPID_SUBJECT ||
  'mailto:admin@example.com'
).trim();
const WEB_PUSH_SUBSCRIPTION_TYPE = 'PUSH_SUBSCRIPTION';
const PUBLIC_FAKE_CHECKOUT_MODE =
  (process.env.PUBLIC_FAKE_CHECKOUT_MODE || '').trim().toLowerCase() === 'true';
const GLOBAL_PORTALS_SECRET_KEY = (process.env.GLOBAL_PORTALS_SECRET_KEY || '').trim();
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16'
    })
  : null;

function createInternalJwtToken(subject: string): string | null {
  if (!INTERNAL_JWT_SECRET) {
    return null;
  }
  return jwt.sign(
    {
      sub: subject,
      type: 'internal'
    },
    INTERNAL_JWT_SECRET,
    { expiresIn: '5m' }
  );
}

client.collectDefaultMetrics();

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

if (!INTERNAL_JWT_SECRET) {
  console.warn('INTERNAL_JWT_SECRET is not set. Internal authentication will not work correctly.');
}

if (WEB_PUSH_VAPID_PUBLIC_KEY && WEB_PUSH_VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    WEB_PUSH_VAPID_SUBJECT,
    WEB_PUSH_VAPID_PUBLIC_KEY,
    WEB_PUSH_VAPID_PRIVATE_KEY
  );
} else {
  console.warn('WEB_PUSH_VAPID keys not set. Push notifications are disabled.');
}

async function createAgency(data: Prisma.AgencyCreateInput) {
  return prisma.agency.create({ data });
}

async function getAgencyById(id: string) {
  return prisma.agency.findUnique({ where: { id } });
}

async function listAgencies() {
  return prisma.agency.findMany();
}

async function updateAgency(id: string, data: Prisma.AgencyUpdateInput) {
  return prisma.agency.update({ where: { id }, data });
}

async function createInstance(data: Prisma.InstanceCreateInput) {
  return prisma.instance.create({ data });
}

async function getInstanceById(id: string) {
  return prisma.instance.findUnique({ where: { id } });
}

async function listInstances() {
  return prisma.instance.findMany();
}

async function createSubscription(data: Prisma.SubscriptionCreateInput) {
  return prisma.subscription.create({ data });
}

async function getSubscriptionById(id: string) {
  return prisma.subscription.findUnique({ where: { id } });
}

async function updateSubscription(id: string, data: Prisma.SubscriptionUpdateInput) {
  return prisma.subscription.update({ where: { id }, data });
}

async function createTicket(data: Prisma.TicketCreateInput) {
  return prisma.ticket.create({ data });
}

async function listTickets(params: {
  agencyId?: string;
  status?: TicketStatus;
  skip?: number;
  take?: number;
} = {}) {
  const where: Prisma.TicketWhereInput = {};

  if (params.agencyId) {
    where.agencyId = params.agencyId;
  }

  if (params.status) {
    where.status = params.status;
  }

  return prisma.ticket.findMany({
    where,
    skip: params.skip,
    take: params.take,
    orderBy: { createdAt: 'desc' }
  });
}

async function getTicketById(id: string) {
  return prisma.ticket.findUnique({
    where: { id },
    include: { messages: true }
  });
}

async function updateTicketStatus(id: string, status: TicketStatus) {
  return prisma.ticket.update({
    where: { id },
    data: { status }
  });
}

async function addTicketMessage(args: {
  ticketId: string;
  senderType: TicketSenderType;
  message: string;
}) {
  return prisma.ticketMessage.create({
    data: {
      ticket: { connect: { id: args.ticketId } },
      senderType: args.senderType,
      message: args.message
    }
  });
}

async function createPortalActivationRequest(data: Prisma.PortalActivationRequestCreateInput) {
  return prisma.portalActivationRequest.create({ data });
}

async function listPortalActivationRequests(params: {
  agencyId?: string;
  portalId?: string;
  status?: PortalActivationStatus;
  skip?: number;
  take?: number;
} = {}) {
  const where: Prisma.PortalActivationRequestWhereInput = {};

  if (params.agencyId) {
    where.agencyId = params.agencyId;
  }

  if (params.portalId) {
    where.portalId = params.portalId;
  }

  if (params.status) {
    where.status = params.status;
  }

  return prisma.portalActivationRequest.findMany({
    where,
    skip: params.skip,
    take: params.take,
    orderBy: { createdAt: 'desc' }
  });
}

async function updatePortalActivationRequest(
  id: string,
  data: Prisma.PortalActivationRequestUpdateInput
) {
  return prisma.portalActivationRequest.update({
    where: { id },
    data
  });
}

async function writeAuditLog(
  action: string,
  entityType: string,
  entityId: string,
  userId?: string | null,
  ip?: string | null,
  userEmail?: string | null,
  userAgent?: string | null,
  changes?: Prisma.JsonValue | null
) {
  return prisma.auditLog.create({
    data: {
      action,
      entity: entityType,
      entityId,
      userId: userId ?? null,
      userEmail: userEmail ?? null,
      ipAddress: ip ? normalizeIp(ip) : null,
      userAgent: userAgent ?? null,
      changes: changes ?? null
    }
  });
}

async function getPortalConfig(portalId: string, agencyId: string) {
  return prisma.portalConfig.findUnique({
    where: {
      portalId_agencyId: {
        portalId,
        agencyId
      }
    }
  });
}

async function upsertPortalConfig(args: {
  portalId: string;
  agencyId: string;
  type?: PortalConfigType;
  status?: PortalConfigStatus;
  active?: boolean;
  settings?: Prisma.JsonValue | null;
}) {
  const data: Prisma.PortalConfigUpdateInput = {};

  if (args.type) {
    data.type = args.type;
  }

  if (args.status) {
    data.status = args.status;
  }

  if (typeof args.active === 'boolean') {
    data.active = args.active;
  }

  if (Object.prototype.hasOwnProperty.call(args, 'settings')) {
    data.settings = args.settings as any;
  }

  return prisma.portalConfig.upsert({
    where: {
      portalId_agencyId: {
        portalId: args.portalId,
        agencyId: args.agencyId
      }
    },
    update: data,
    create: {
      portalId: args.portalId,
      agencyId: args.agencyId,
      type: args.type ?? PortalConfigType.PER_AGENZIA,
      status: args.status ?? PortalConfigStatus.INACTIVE,
      active: args.active ?? false,
      settings: (Object.prototype.hasOwnProperty.call(args, 'settings') ? args.settings : undefined) as any
    }
  });
}

async function listPortalConfigs(agencyId: string) {
  return prisma.portalConfig.findMany({
    where: { agencyId }
  });
}

function mapStripeSubscriptionStatus(stripeStatus: string | null | undefined): SubscriptionStatus {
  const value = (stripeStatus || '').toLowerCase();
  if (value === 'trialing') return SubscriptionStatus.TRIALING;
  if (value === 'active') return SubscriptionStatus.ACTIVE;
  if (value === 'past_due') return SubscriptionStatus.PAST_DUE;
  if (value === 'canceled' || value === 'unpaid' || value === 'incomplete_expired') {
    return SubscriptionStatus.CANCELED;
  }
  return SubscriptionStatus.ACTIVE;
}

function mapSubscriptionStatusToAgencyStatus(status: SubscriptionStatus): AgencyStatus | null {
  if (status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING) {
    return AgencyStatus.ACTIVE;
  }
  if (status === SubscriptionStatus.PAST_DUE) {
    return AgencyStatus.SUSPENDED;
  }
  if (status === SubscriptionStatus.CANCELED) {
    return AgencyStatus.CANCELED;
  }
  return null;
}

async function writePortalLog(args: {
  portalId: string;
  operation: string;
  status: string;
  message?: string;
}) {
  return prisma.portalLog.create({
    data: {
      portalId: args.portalId,
      operation: args.operation,
      status: args.status,
      message: args.message ?? null
    }
  });
}

type GlobalPortalCredentials = {
  username?: string | null;
  password?: string | null;
  apiKey?: string | null;
  endpoint?: string | null;
};

function getGlobalSecretKey(): Buffer {
  if (!GLOBAL_PORTALS_SECRET_KEY) {
    throw new Error('GLOBAL_PORTALS_SECRET_KEY not configured');
  }
  return crypto.createHash('sha256').update(GLOBAL_PORTALS_SECRET_KEY).digest();
}

function encryptGlobalSecret(value: string): string {
  const key = getGlobalSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptGlobalSecret(payload: string): string {
  const buffer = Buffer.from(payload, 'base64');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const key = getGlobalSecretKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

async function getGlobalPortalCredentials(portalId: string): Promise<GlobalPortalCredentials | null> {
  const row = await prisma.globalPortalSecret.findUnique({
    where: { portalId }
  });
  if (!row) return null;
  try {
    const json = decryptGlobalSecret(row.data);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      username: parsed.username ?? null,
      password: parsed.password ?? null,
      apiKey: parsed.apiKey ?? null,
      endpoint: parsed.endpoint ?? null
    };
  } catch {
    return null;
  }
}

async function setGlobalPortalCredentials(portalId: string, credentials: GlobalPortalCredentials | null): Promise<void> {
  if (!credentials) {
    await prisma.globalPortalSecret.deleteMany({
      where: { portalId }
    });
    return;
  }
  const payload = JSON.stringify({
    username: credentials.username ?? null,
    password: credentials.password ?? null,
    apiKey: credentials.apiKey ?? null,
    endpoint: credentials.endpoint ?? null
  });
  const encrypted = encryptGlobalSecret(payload);
  await prisma.globalPortalSecret.upsert({
    where: { portalId },
    update: { data: encrypted },
    create: {
      portalId,
      data: encrypted
    }
  });
}

function sanitizeGlobalCredentialsForResponse(credentials: GlobalPortalCredentials | null) {
  if (!credentials) {
    return {
      username: null,
      endpoint: null,
      hasPassword: false,
      hasApiKey: false
    };
  }
  return {
    username: credentials.username ?? null,
    endpoint: credentials.endpoint ?? null,
    hasPassword: !!credentials.password,
    hasApiKey: !!credentials.apiKey
  };
}

const isProvisionerEnabled = () => {
  const raw = (process.env.PROVISIONER_ENABLED || '').toString().trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
};

const getProvisionerIntervalMs = () => {
  const raw = (process.env.PROVISIONER_INTERVAL_MS || '').toString().trim();
  const parsed = Number(raw || '60000');
  if (!Number.isFinite(parsed) || parsed <= 0) return 60000;
  return parsed;
};

const getOrchestratorBaseUrl = () => {
  const base = normalizeBaseUrl(process.env.ORCHESTRATOR_BASE_URL);
  return base;
};

const getInstanceBaseDomain = () => {
  const base = normalizeBaseUrl(process.env.INSTANCE_BASE_DOMAIN);
  return base;
};

const getMasterApiBaseUrl = () => {
  const base = normalizeBaseUrl(process.env.MASTER_API_BASE_URL);
  return base;
};

const getMasterApiAuthHeader = () => {
  const token = (process.env.MASTER_API_TOKEN || '').toString().trim();
  if (!token) return null;
  return `Bearer ${token}`;
};

const callMasterJson = async (path: string, options: { method: string; body?: any }) => {
  const baseUrl = getMasterApiBaseUrl();
  if (!baseUrl) {
    throw new Error('Missing MASTER_API_BASE_URL');
  }
  const url = new URL(path.startsWith('/') ? path : `/${path}`, baseUrl);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
  const auth = getMasterApiAuthHeader();
  if (auth) {
    headers.Authorization = auth;
  }
  const response = await fetch(url.toString(), {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  } as any);
  const text = await response.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!response.ok) {
    const message = (json as any)?.message || text || `Master API error ${response.status}`;
    throw new Error(String(message));
  }
  return json;
};

const isPortalSyncErrorMonitorEnabled = () => {
  const raw = (process.env.PORTAL_SYNC_ERROR_MONITOR_ENABLED || '').toString().trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
};

const getPortalSyncErrorMonitorIntervalMs = () => {
  const raw = (process.env.PORTAL_SYNC_ERROR_MONITOR_INTERVAL_MS || '').toString().trim();
  const parsed = Number(raw || '300000');
  if (!Number.isFinite(parsed) || parsed <= 0) return 300000;
  return parsed;
};

const getPortalSyncErrorWindowSize = () => {
  const raw = (process.env.PORTAL_SYNC_ERROR_WINDOW_SIZE || '').toString().trim();
  const parsed = Number(raw || '10');
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return parsed;
};

const getPortalSyncErrorThreshold = () => {
  const raw = (process.env.PORTAL_SYNC_ERROR_THRESHOLD || '').toString().trim();
  const parsed = Number(raw || '3');
  if (!Number.isFinite(parsed) || parsed <= 0) return 3;
  return parsed;
};

async function createPortalSyncErrorTicketIfNeeded(
  portalId: string,
  agencyId: string,
  logs: any[],
  consecutiveErrors: number
) {
  const existing = await prisma.ticket.findFirst({
    where: {
      agencyId,
      type: 'portale',
      status: {
        in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS]
      },
      subject: `Errori ripetuti sync portale ${portalId}`
    }
  });

  if (existing) return;

  const subject = `Errori ripetuti sync portale ${portalId}`;

  const lines: string[] = [];
  lines.push(
    `Rilevati ${consecutiveErrors} errori consecutivi nel sync del portale ${portalId} per l'agenzia ${agencyId}.`
  );
  lines.push('');
  lines.push('Ultimi eventi registrati:');

  const sample = logs.slice(0, 10);
  for (const log of sample) {
    const createdAt =
      log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt || '');
    const op = log.operation || '';
    const status = log.status || '';
    const message = log.message || '';
    lines.push(`- ${createdAt} [${op}] status=${status} ${message}`);
  }

  const message = lines.join('\n');

  const ticket = await createTicket({
    agency: {
      connect: {
        id: agencyId
      }
    },
    type: 'portale',
    subject
  });

  await addTicketMessage({
    ticketId: ticket.id,
    senderType: TicketSenderType.STAFF,
    message
  });

  try {
    await callMasterJson('/internal/tickets', {
      method: 'POST',
      body: {
        agencyId,
        type: 'portale',
        subject,
        message
      }
    });
  } catch (error: any) {
    console.error('Errore nella creazione ticket portale sul master', error?.message || error);
  }

  try {
    await writeAuditLog(
      'AUTO_TICKET_PORTAL_SYNC_ERRORS',
      'Ticket',
      ticket.id,
      null,
      null,
      null,
      null,
      {
        portalId,
        agencyId,
        consecutiveErrors,
        sampleSize: sample.length
      } as any
    );
  } catch (logError) {
    console.error('Audit log error (AUTO_TICKET_PORTAL_SYNC_ERRORS):', logError);
  }
}

async function checkPortalSyncErrorBurstsAndCreateTickets() {
  const windowSize = getPortalSyncErrorWindowSize();
  const threshold = getPortalSyncErrorThreshold();
  if (windowSize <= 0 || threshold <= 0) return;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const logs = await prisma.portalSyncLog.findMany({
    where: {
      createdAt: {
        gte: since
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 1000,
    include: {
      property: {
        select: {
          agencyId: true
        }
      }
    }
  });

  const groups = new Map<string, { portalId: string; agencyId: string; logs: any[] }>();

  for (const log of logs) {
    const agencyId = log.property?.agencyId;
    if (!agencyId) continue;
    const portalId = log.portalId;
    if (!portalId) continue;
    const key = `${portalId}::${agencyId}`;
    let group = groups.get(key);
    if (!group) {
      group = { portalId, agencyId, logs: [] };
      groups.set(key, group);
    }
    group.logs.push(log);
  }

  for (const group of groups.values()) {
    const recent = group.logs.slice(0, windowSize);
    let consecutiveErrors = 0;
    for (const log of recent) {
      if (log.status === 'ERROR') {
        consecutiveErrors += 1;
      } else {
        break;
      }
    }
    if (consecutiveErrors >= threshold) {
      await createPortalSyncErrorTicketIfNeeded(
        group.portalId,
        group.agencyId,
        recent,
        consecutiveErrors
      );
    }
  }
}

const startPortalSyncErrorMonitor = () => {
  if (!isPortalSyncErrorMonitorEnabled()) return;
  const intervalMs = getPortalSyncErrorMonitorIntervalMs();
  const loop = async () => {
    try {
      await checkPortalSyncErrorBurstsAndCreateTickets();
    } catch (error: any) {
      console.error('Portal sync error monitor loop error', error?.message || error);
    } finally {
      setTimeout(loop, intervalMs);
    }
  };
  loop();
};

const getOrchestratorAuthHeader = () => {
  const token = (process.env.ORCHESTRATOR_API_TOKEN || '').toString().trim();
  if (!token) return null;
  return `Bearer ${token}`;
};

const generateRandomToken = (length: number) => {
  const bytes = crypto.randomBytes(Math.max(length, 8));
  return bytes
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, length);
};

const slugifyAgencyName = (name: string) => {
  const lower = name.toLowerCase();
  const replaced = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
  return replaced || `agenzia-${generateRandomToken(6).toLowerCase()}`;
};

const allocateAgencySlug = async (agencyId: string, name: string) => {
  const existing = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { slug: true }
  });
  if (existing?.slug && existing.slug.trim()) return existing.slug.trim();

  let base = slugifyAgencyName(name);
  let candidate = base;
  let suffix = 1;

  for (;;) {
    const conflict = await prisma.agency.findUnique({
      where: { slug: candidate }
    });
    if (!conflict) {
      const updated = await prisma.agency.update({
        where: { id: agencyId },
        data: { slug: candidate }
      });
      return updated.slug || candidate;
    }
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
};

const callOrchestratorJson = async (path: string, options: { method: string; body?: any }) => {
  const baseUrl = getOrchestratorBaseUrl();
  if (!baseUrl) {
    throw new Error('Missing ORCHESTRATOR_BASE_URL');
  }
  const url = new URL(path.startsWith('/') ? path : `/${path}`, baseUrl);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
  const auth = getOrchestratorAuthHeader();
  if (auth) {
    headers.Authorization = auth;
  }
  const response = await fetch(url.toString(), {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  } as any);
  const text = await response.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!response.ok) {
    const message = json?.message || text || `Orchestrator error ${response.status}`;
    throw new Error(String(message));
  }
  return json;
};

const provisioningInProgress = new Set<string>();

const processPendingProvisioningAgencies = async () => {
  const agencies = await prisma.agency.findMany({
    where: { status: AgencyStatus.PENDING_PROVISIONING },
    include: {
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        take: 1
      },
      instances: {
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });

  for (const agency of agencies) {
    if (provisioningInProgress.has(agency.id)) continue;
    const latestInstance = agency.instances[0] || null;
    if (latestInstance && (latestInstance.status === InstanceStatus.PROVISIONING || latestInstance.status === InstanceStatus.READY)) {
      continue;
    }
    provisioningInProgress.add(agency.id);
    provisionAgencyInstance(agency.id).catch(error => {
      console.error('Provisioner error for agency', agency.id, error?.message || error);
    }).finally(() => {
      provisioningInProgress.delete(agency.id);
    });
  }
};

const provisionAgencyInstance = async (agencyId: string) => {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    include: {
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        take: 1
      },
      instances: {
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });
  if (!agency) return;

  const slug = await allocateAgencySlug(agency.id, agency.name);
  const subscription = agency.subscriptions[0] || null;
  const planCode = subscription?.planCode || null;

  let instance = agency.instances[0] || null;

  if (!instance) {
    instance = await prisma.instance.create({
      data: {
        agencyId: agency.id,
        slug,
        status: InstanceStatus.PROVISIONING
      }
    });
  } else {
    instance = await prisma.instance.update({
      where: { id: instance.id },
      data: {
        slug,
        status: InstanceStatus.PROVISIONING
      }
    });
  }

  await prisma.auditLog.create({
    data: {
      action: 'INSTANCE_PROVISIONING_STARTED',
      entity: 'Instance',
      entityId: instance.id,
      userId: null,
      ipAddress: null,
      changes: {
        agencyId: agency.id,
        planCode
      } as any
    }
  });

  const dbName = `crm_${slug.replace(/-/g, '_')}`.slice(0, 32);
  const dbUser = `u_${generateRandomToken(10).toLowerCase()}`;
  const dbPassword = generateRandomToken(32);

  const baseDomain = getInstanceBaseDomain();
  const expectedHost = baseDomain ? `${slug}.${baseDomain.replace(/^https?:\/\//, '')}` : null;
  const expectedBaseUrl = expectedHost ? `https://${expectedHost}` : null;

  try {
    const stackPayload: any = {
      agencyId: agency.id,
      slug,
      planCode,
      db: {
        name: dbName,
        user: dbUser,
        password: dbPassword
      },
      routing: expectedHost
        ? {
            host: expectedHost,
            https: true
          }
        : undefined
    };

    const created = await callOrchestratorJson('/stacks', {
      method: 'POST',
      body: stackPayload
    });

    const reference = created?.id || created?.reference || null;

    if (reference) {
      try {
        await callOrchestratorJson(`/stacks/${encodeURIComponent(String(reference))}/migrate`, {
          method: 'POST'
        });
      } catch (e) {
        console.error('Provisioner migrate error', agency.id, e);
        throw e;
      }

      try {
        const adminPassword = generateRandomToken(24);
        await callOrchestratorJson(`/stacks/${encodeURIComponent(String(reference))}/bootstrap-admin`, {
          method: 'POST',
          body: {
            email: agency.email,
            name: agency.name,
            password: adminPassword
          }
        });
      } catch (e) {
        console.error('Provisioner admin bootstrap error', agency.id, e);
        throw e;
      }

      try {
        await callOrchestratorJson(`/stacks/${encodeURIComponent(String(reference))}/bootstrap-portals`, {
          method: 'POST'
        });
      } catch (e) {
        console.error('Provisioner portal bootstrap error', agency.id, e);
        throw e;
      }
    }

    const statusJson = reference
      ? await callOrchestratorJson(`/stacks/${encodeURIComponent(String(reference))}`, { method: 'GET' })
      : created;

    const baseUrlCandidate =
      statusJson?.baseUrl ||
      statusJson?.url ||
      statusJson?.endpoint ||
      expectedBaseUrl ||
      null;

    const baseUrl = baseUrlCandidate ? normalizeBaseUrl(baseUrlCandidate) : null;

    await prisma.$transaction(async tx => {
      const updatedInstance = await tx.instance.update({
        where: { id: instance!.id },
        data: {
          status: InstanceStatus.READY,
          baseUrl,
          orchestratorReference: reference ? String(reference) : instance!.orchestratorReference
        }
      });

      await tx.agency.update({
        where: { id: agency.id },
        data: {
          status: AgencyStatus.ACTIVE
        }
      });

      await tx.auditLog.create({
        data: {
          action: 'INSTANCE_PROVISIONED',
          entity: 'Instance',
          entityId: updatedInstance.id,
          userId: null,
          ipAddress: null,
          changes: {
            agencyId: agency.id,
            baseUrl,
            orchestratorReference: updatedInstance.orchestratorReference
          } as any
        }
      });
    });
  } catch (error: any) {
    console.error('Provisioner failure for agency', agency.id, error?.message || error);

    await prisma.$transaction(async tx => {
      const failedInstance = await tx.instance.update({
        where: { id: instance!.id },
        data: {
          status: InstanceStatus.ERROR,
          orchestratorReference: error?.message || String(error)
        }
      });

      await tx.auditLog.create({
        data: {
          action: 'INSTANCE_PROVISIONING_FAILED',
          entity: 'Instance',
          entityId: failedInstance.id,
          userId: null,
          ipAddress: null,
          changes: {
            agencyId: agency.id,
            error: error?.message || String(error)
          } as any
        }
      });
    });
  }
};

const startProvisioner = () => {
  if (!isProvisionerEnabled()) return;
  const intervalMs = getProvisionerIntervalMs();
  const loop = async () => {
    try {
      await processPendingProvisioningAgencies();
    } catch (error: any) {
      console.error('Provisioner loop error', error?.message || error);
    } finally {
      setTimeout(loop, intervalMs);
    }
  };
  loop();
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

const runningInDocker = fs.existsSync('/.dockerenv');
const storageProvider = String(process.env.STORAGE_PROVIDER || 'minio').trim().toLowerCase();
const minioEndpoint = (process.env.MINIO_ENDPOINT || (runningInDocker ? 'minio' : 'localhost')).trim();
const minioInitCheckEnabledRaw = (process.env.MINIO_INIT_CHECK ?? (runningInDocker ? 'true' : 'false'))
  .toString()
  .trim()
  .toLowerCase();
const minioInitCheckEnabled =
  minioInitCheckEnabledRaw === '1' || minioInitCheckEnabledRaw === 'true' || minioInitCheckEnabledRaw === 'yes';
const storageUseSSLRaw = String(process.env.MINIO_USE_SSL || process.env.STORAGE_USE_SSL || 'false')
  .trim()
  .toLowerCase();
const storageUseSSL =
  storageUseSSLRaw === '1' || storageUseSSLRaw === 'true' || storageUseSSLRaw === 'yes';
const storageAutoCreateBucketRaw = String(
  process.env.STORAGE_AUTO_CREATE_BUCKET ?? (runningInDocker ? 'true' : 'false')
)
  .trim()
  .toLowerCase();
const storageAutoCreateBucket =
  storageAutoCreateBucketRaw === '1' ||
  storageAutoCreateBucketRaw === 'true' ||
  storageAutoCreateBucketRaw === 'yes';

const minioClient = new Minio.Client({
  endPoint: minioEndpoint,
  port: Number(process.env.MINIO_PORT || (storageUseSSL ? 443 : 9000)),
  useSSL: storageUseSSL,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123'
});

const OWNER_DOCUMENTS_BUCKET = process.env.MINIO_OWNER_DOCUMENTS_BUCKET || 'owner-documents';

const buildSafeFileKey = (prefix: string, originalName: string) => {
  const safeName = String(originalName || 'file')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 140);
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
};

const normalizeStoredPropertyDocuments = (oneClickData: any) => {
  const docs = Array.isArray(oneClickData?.propertyDocuments) ? oneClickData.propertyDocuments : [];
  return docs.filter((doc: any) => doc && doc.id && doc.fileKey);
};

const legacyPropertyDocumentRows = (oneClickData: any, includeEmbeddedData = false) => {
  const rows: any[] = [];
  const plan = oneClickData?.planimetria_file;
  const visura = oneClickData?.visura_file;
  if (plan?.name && !plan?.fileKey) {
    rows.push({
      id: 'embedded-planimetria',
      type: 'PLANIMETRIA',
      label: 'Planimetria catastale',
      fileName: String(plan.name),
      fileKey: null,
      mimeType: String(plan.mime || plan.type || 'application/octet-stream'),
      size: Number(plan.size || 0),
      uploadedAt: plan.uploadedAt || null,
      legacyOnly: !plan.dataUrl,
      ...(includeEmbeddedData && plan.dataUrl ? { dataUrl: String(plan.dataUrl) } : {})
    });
  }
  if (visura?.name && !visura?.fileKey) {
    rows.push({
      id: 'embedded-visura',
      type: 'VISURA',
      label: 'Visura catastale',
      fileName: String(visura.name),
      fileKey: null,
      mimeType: String(visura.mime || visura.type || 'application/octet-stream'),
      size: Number(visura.size || 0),
      uploadedAt: visura.uploadedAt || null,
      legacyOnly: !visura.dataUrl,
      ...(includeEmbeddedData && visura.dataUrl ? { dataUrl: String(visura.dataUrl) } : {})
    });
  }
  return rows;
};

const storageStatObject = (bucket: string, key: string) =>
  new Promise<any>((resolve, reject) => {
    minioClient.statObject(bucket, key, (err: any, stat: any) => {
      if (err) return reject(err);
      resolve(stat);
    });
  });

const storageGetObject = (bucket: string, key: string) =>
  new Promise<any>((resolve, reject) => {
    minioClient.getObject(bucket, key, (err: any, dataStream: any) => {
      if (err) return reject(err);
      resolve(dataStream);
    });
  });

const storagePutObject = (
  bucket: string,
  key: string,
  buffer: Buffer,
  size: number,
  contentType: string
) =>
  new Promise<void>((resolve, reject) => {
    minioClient.putObject(bucket, key, buffer, size, { 'Content-Type': contentType }, (err: any) => {
      if (err) return reject(err);
      resolve();
    });
  });

const storageRemoveObject = (bucket: string, key: string) =>
  new Promise<void>((resolve, reject) => {
    minioClient.removeObject(bucket, key, (err: any) => {
      if (err) return reject(err);
      resolve();
    });
  });

const storageEnsureBucket = async (bucket: string) => {
  const exists = await new Promise<boolean>((resolve, reject) => {
    minioClient.bucketExists(bucket, (err: any, found: boolean) => {
      if (err) return reject(err);
      resolve(Boolean(found));
    });
  });
  if (exists) return;
  await new Promise<void>((resolve, reject) => {
    minioClient.makeBucket(bucket, '', (err: any) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

const ensureOwnerDocumentsBucketExists = () => {
  if (!minioInitCheckEnabled) {
    console.log(
      `MinIO init check disabled (MINIO_INIT_CHECK=${minioInitCheckEnabledRaw || 'false'}). ` +
        'Owner documents bucket will be checked lazily on first upload.'
    );
    return;
  }

  minioClient.bucketExists(OWNER_DOCUMENTS_BUCKET, (err: any, exists: boolean) => {
    if (err) {
      console.warn(
        `Object storage init check skipped (provider=${storageProvider}, endpoint=${minioEndpoint}:${Number(
          process.env.MINIO_PORT || (storageUseSSL ? 443 : 9000)
        )}):`,
        err?.message || err
      );
      return;
    }

    if (exists) {
      return;
    }

    if (!storageAutoCreateBucket) {
      console.warn(
        `Bucket "${OWNER_DOCUMENTS_BUCKET}" not found and STORAGE_AUTO_CREATE_BUCKET=false. ` +
          'Uploads will fail until bucket is created manually.'
      );
      return;
    }

    minioClient.makeBucket(OWNER_DOCUMENTS_BUCKET, '', (bucketErr: any) => {
      if (bucketErr) {
        console.warn('Error creating object storage bucket for owner documents:', bucketErr?.message || bucketErr);
      }
    });
  });
};

ensureOwnerDocumentsBucketExists();

type FeedPortalStatus = 'NOT_SELECTED' | 'SELECTED' | 'POTENTIAL' | 'PUBLISHED';

type ImmoPortalStatus = 'NOT_SELECTED' | 'NOT_SYNCED' | 'SYNCED' | 'ERROR';

type ApimoPortalStatus = 'NOT_CONFIGURED' | 'CONFIGURED' | 'PULLING' | 'ERROR';

type PortalPerPropertyStatus =
  | {
      portalId: string;
      kind: 'FEED_PULL';
      selected: boolean;
      requirementsSatisfied: boolean;
      status: FeedPortalStatus;
    }
  | {
      portalId: string;
      kind: 'SYNC_PUSH';
      selected: boolean;
      syncStatus: ImmoSyncStatus;
      lastError: string | null;
      status: ImmoPortalStatus;
    }
  | {
      portalId: string;
      kind: 'PROXY';
      configured: boolean;
      lastError: string | null;
      status: ApimoPortalStatus;
    }
  | {
      portalId: string;
      kind: 'MANUAL';
      selected: boolean;
      status: 'NOT_SELECTED' | 'SELECTED';
    };

const PORTAL_IDS = new Set(PORTAL_REGISTRY.map((portal) => portal.id));

const toPositivePriceOrNull = (value: unknown): number | null => {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getPreferredSalePrice = (property: any): number | null =>
  toPositivePriceOrNull(property?.advertisingSalePrice) ?? toPositivePriceOrNull(property?.salePrice);

const getPreferredRentPrice = (property: any): number | null =>
  toPositivePriceOrNull(property?.advertisingRentPrice) ?? toPositivePriceOrNull(property?.rentPrice);

const getPreferredContractPrice = (property: any): number | null => {
  const contractType = (property?.contractType || '').toString().toUpperCase();
  const sale = getPreferredSalePrice(property);
  const rent = getPreferredRentPrice(property);

  if (contractType === 'RENT') return rent ?? sale;
  if (contractType === 'SALE') return sale ?? rent;
  return sale ?? rent;
};

const isRequirementSatisfied = (requirement: PortalRequirement, property: Prisma.PropertyGetPayload<{}>) => {
  if (requirement === 'price') {
    const value = getPreferredContractPrice(property);
    return value != null && Number(value) > 0;
  }

  if (requirement === 'image') {
    const images = Array.isArray(property.images) ? property.images : [];
    return images.length > 0;
  }

  if (requirement === 'giComuneIstat') {
    return property.giComuneIstat != null && property.giComuneIstat.toString().trim().length > 0;
  }

  if (requirement === 'giListingId') {
    return property.giListingId != null && Number.isFinite(Number(property.giListingId));
  }

  if (requirement === 'location') {
    const hasCoords = property.latitude != null && property.longitude != null;
    const hasIstat = property.giComuneIstat != null && property.giComuneIstat.toString().trim().length === 6;
    return hasCoords || hasIstat;
  }

  if (requirement === 'description') {
    return property.description != null && String(property.description).trim().length > 0;
  }

  if (requirement === 'reference') {
    return property.reference != null && String(property.reference).trim().length > 0;
  }

  return false;
};

const getPortalPerPropertyStatus = (
  portalId: string,
  property: Prisma.PropertyGetPayload<{}>,
  agency: Prisma.AgencyGetPayload<{}> | null
): PortalPerPropertyStatus | null => {
  const registry = PORTAL_REGISTRY.find((p) => p.id === portalId);
  if (!registry) return null;

  if (registry.kind === 'FEED_PULL') {
    const selected = Array.isArray(property.portalTargets) && property.portalTargets.includes(portalId);
    const requirementsSatisfied = registry.requirements.every((req) => isRequirementSatisfied(req, property));

    let status: FeedPortalStatus = 'NOT_SELECTED';
    if (selected && !requirementsSatisfied) status = 'SELECTED';
    if (selected && requirementsSatisfied) status = 'POTENTIAL';
    if (selected && requirementsSatisfied && property.isPublished) status = 'PUBLISHED';

    return {
      portalId,
      kind: 'FEED_PULL',
      selected,
      requirementsSatisfied,
      status
    };
  }

  if (registry.id === 'IMMOBILIARE_IT' && registry.kind === 'SYNC_PUSH') {
    const selected = Array.isArray(property.portalTargets) && property.portalTargets.includes('IMMOBILIARE_IT');
    const syncStatus = property.immoSyncStatus;
    const lastError = property.immoLastError || null;

    let status: ImmoPortalStatus = 'NOT_SELECTED';
    if (selected && syncStatus === 'NOT_SYNCED') status = 'NOT_SYNCED';
    if (selected && syncStatus === 'SYNCED') status = 'SYNCED';
    if (selected && syncStatus === 'ERROR') status = 'ERROR';

    return {
      portalId,
      kind: 'SYNC_PUSH',
      selected,
      syncStatus,
      lastError,
      status
    };
  }

  if (registry.id === 'APIMO_NET' && registry.kind === 'PROXY') {
    const provider = agency?.apimoProvider;
    const token = agency?.apimoToken;
    const agencyId = agency?.apimoAgencyId;
    const configured = Boolean(provider && token && agencyId);

    const lastError = property.apimoLastPushError || null;
    const pushStatus = property.apimoPushStatus;

    let status: ApimoPortalStatus = 'NOT_CONFIGURED';
    if (configured && pushStatus === 'NOT_SYNCED') status = 'CONFIGURED';
    if (configured && pushStatus === 'SYNCED') status = 'PULLING';
    if (configured && pushStatus === 'ERROR') status = 'ERROR';

    return {
      portalId,
      kind: 'PROXY',
      configured,
      lastError,
      status
    };
  }

  if (registry.kind === 'MANUAL') {
    const selected = Array.isArray(property.portalTargets) && property.portalTargets.includes(portalId);
    const status = selected ? 'SELECTED' : 'NOT_SELECTED';
    return {
      portalId,
      kind: 'MANUAL',
      selected,
      status
    };
  }

  return null;
};

const normalizePortalTargetsInput = (value: unknown) => {
  if (!Array.isArray(value)) {
    return { valid: true, portalIds: [] as string[], invalidIds: [] as string[] };
  }

  const rawIds = value
    .map((item) => (item == null ? '' : String(item)))
    .map((id) => id.trim())
    .filter((id) => Boolean(id));

  const uniqueIds: string[] = [];
  const seen = new Set<string>();
  const invalidIds: string[] = [];

  for (const id of rawIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (!PORTAL_IDS.has(id)) {
      invalidIds.push(id);
    } else {
      uniqueIds.push(id);
    }
  }

  if (invalidIds.length > 0) {
    return { valid: false, portalIds: uniqueIds, invalidIds };
  }

  return { valid: true, portalIds: uniqueIds, invalidIds };
};

const normalizeBaseUrl = (value: unknown) => {
  const text = value == null ? '' : String(value).trim();
  if (!text) return null;
  const withoutTrailingSlash = text.endsWith('/') ? text.slice(0, -1) : text;
  return withoutTrailingSlash || null;
};

const getRequestBaseUrl = (req: express.Request) => `${req.protocol}://${req.get('host')}`;

const DEFAULT_FRONTEND_PUBLIC_URL = 'https://frontend-three-olive-34.vercel.app';

const isBackendLikeHost = (candidate: string | null) => {
  if (!candidate) return false;
  try {
    const hostname = new URL(candidate).hostname.toLowerCase();
    if (/backend/i.test(hostname) && /\.vercel\.app$/i.test(hostname)) return true;
    if (hostname.includes('api.')) return true;
    return false;
  } catch {
    return false;
  }
};

const resolvePublicFacingBaseUrl = (candidate: string | null, req: express.Request) => {
  const normalizedCandidate = normalizeBaseUrl(candidate);
  const envFrontend = normalizeBaseUrl(process.env.FRONTEND_PUBLIC_URL) || normalizeBaseUrl(process.env.PUBLIC_FRONTEND_URL);
  const requestBase = normalizeBaseUrl(getRequestBaseUrl(req));
  if (normalizedCandidate && !isBackendLikeHost(normalizedCandidate)) return normalizedCandidate;
  if (envFrontend && !isBackendLikeHost(envFrontend)) return envFrontend;
  if (!isBackendLikeHost(DEFAULT_FRONTEND_PUBLIC_URL)) return DEFAULT_FRONTEND_PUBLIC_URL;
  return requestBase || DEFAULT_FRONTEND_PUBLIC_URL;
};

// Public landing route for shared property links.
app.get('/public/property/:id', async (req, res) => {
  try {
    const propertyId = String(req.params.id || '').trim();
    if (!propertyId) {
      return res.status(400).send('Missing property id');
    }

    const envBaseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL);
    let agencyBaseUrl: string | null = null;
    try {
      const agency = await prisma.agency.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { publicBaseUrl: true }
      });
      agencyBaseUrl = normalizeBaseUrl(agency?.publicBaseUrl);
    } catch {
      agencyBaseUrl = null;
    }

    const requestBaseUrl = normalizeBaseUrl(getRequestBaseUrl(req));
    const configuredBaseUrl = agencyBaseUrl || envBaseUrl;
    const frontendBaseUrl = resolvePublicFacingBaseUrl(configuredBaseUrl, req);
    if (frontendBaseUrl && frontendBaseUrl !== requestBaseUrl) {
      return res.redirect(302, `${frontendBaseUrl}/public/property/${encodeURIComponent(propertyId)}`);
    }

    return res.redirect(302, `/api/public/properties/${encodeURIComponent(propertyId)}`);
  } catch (error) {
    console.error('Error resolving public property route:', error);
    return res.status(500).send('Unable to resolve public property link');
  }
});

const xmlEscape = (value: unknown) => {
  const text = value == null ? '' : String(value);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const xmlCdata = (value: unknown) => {
  const text = value == null ? '' : String(value);
  const safe = text.replace(/]]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${safe}]]>`;
};

const toImmoDateTime = (value: Date) => value.toISOString().replace(/\.\d{3}Z$/, '');

const PROVINCE_META: Record<string, { name: string; region: string }> = {
  AG: { name: 'Agrigento', region: 'Sicilia' },
  AL: { name: 'Alessandria', region: 'Piemonte' },
  AN: { name: 'Ancona', region: 'Marche' },
  AO: { name: 'Aosta', region: "Valle d'Aosta" },
  AP: { name: 'Ascoli Piceno', region: 'Marche' },
  AQ: { name: "L'Aquila", region: 'Abruzzo' },
  AR: { name: 'Arezzo', region: 'Toscana' },
  AT: { name: 'Asti', region: 'Piemonte' },
  AV: { name: 'Avellino', region: 'Campania' },
  BA: { name: 'Bari', region: 'Puglia' },
  BT: { name: 'Barletta-Andria-Trani', region: 'Puglia' },
  BL: { name: 'Belluno', region: 'Veneto' },
  BN: { name: 'Benevento', region: 'Campania' },
  BG: { name: 'Bergamo', region: 'Lombardia' },
  BI: { name: 'Biella', region: 'Piemonte' },
  BO: { name: 'Bologna', region: 'Emilia-Romagna' },
  BZ: { name: 'Bolzano', region: 'Trentino-Alto Adige' },
  BS: { name: 'Brescia', region: 'Lombardia' },
  BR: { name: 'Brindisi', region: 'Puglia' },
  CA: { name: 'Cagliari', region: 'Sardegna' },
  CL: { name: 'Caltanissetta', region: 'Sicilia' },
  CB: { name: 'Campobasso', region: 'Molise' },
  CI: { name: 'Carbonia-Iglesias', region: 'Sardegna' },
  CE: { name: 'Caserta', region: 'Campania' },
  CT: { name: 'Catania', region: 'Sicilia' },
  CZ: { name: 'Catanzaro', region: 'Calabria' },
  CH: { name: 'Chieti', region: 'Abruzzo' },
  CO: { name: 'Como', region: 'Lombardia' },
  CS: { name: 'Cosenza', region: 'Calabria' },
  CR: { name: 'Cremona', region: 'Lombardia' },
  KR: { name: 'Crotone', region: 'Calabria' },
  CN: { name: 'Cuneo', region: 'Piemonte' },
  EN: { name: 'Enna', region: 'Sicilia' },
  FM: { name: 'Fermo', region: 'Marche' },
  FE: { name: 'Ferrara', region: 'Emilia-Romagna' },
  FI: { name: 'Firenze', region: 'Toscana' },
  FG: { name: 'Foggia', region: 'Puglia' },
  FC: { name: 'ForlÃ¬-Cesena', region: 'Emilia-Romagna' },
  FR: { name: 'Frosinone', region: 'Lazio' },
  GE: { name: 'Genova', region: 'Liguria' },
  GO: { name: 'Gorizia', region: 'Friuli-Venezia Giulia' },
  GR: { name: 'Grosseto', region: 'Toscana' },
  IM: { name: 'Imperia', region: 'Liguria' },
  IS: { name: 'Isernia', region: 'Molise' },
  SP: { name: 'La Spezia', region: 'Liguria' },
  LT: { name: 'Latina', region: 'Lazio' },
  LE: { name: 'Lecce', region: 'Puglia' },
  LC: { name: 'Lecco', region: 'Lombardia' },
  LI: { name: 'Livorno', region: 'Toscana' },
  LO: { name: 'Lodi', region: 'Lombardia' },
  LU: { name: 'Lucca', region: 'Toscana' },
  MC: { name: 'Macerata', region: 'Marche' },
  MN: { name: 'Mantova', region: 'Lombardia' },
  MS: { name: 'Massa-Carrara', region: 'Toscana' },
  MT: { name: 'Matera', region: 'Basilicata' },
  VS: { name: 'Medio Campidano', region: 'Sardegna' },
  ME: { name: 'Messina', region: 'Sicilia' },
  MI: { name: 'Milano', region: 'Lombardia' },
  MO: { name: 'Modena', region: 'Emilia-Romagna' },
  MB: { name: 'Monza e della Brianza', region: 'Lombardia' },
  NA: { name: 'Napoli', region: 'Campania' },
  NO: { name: 'Novara', region: 'Piemonte' },
  NU: { name: 'Nuoro', region: 'Sardegna' },
  OG: { name: 'Ogliastra', region: 'Sardegna' },
  OT: { name: 'Olbia-Tempio', region: 'Sardegna' },
  OR: { name: 'Oristano', region: 'Sardegna' },
  PD: { name: 'Padova', region: 'Veneto' },
  PA: { name: 'Palermo', region: 'Sicilia' },
  PR: { name: 'Parma', region: 'Emilia-Romagna' },
  PV: { name: 'Pavia', region: 'Lombardia' },
  PG: { name: 'Perugia', region: 'Umbria' },
  PU: { name: 'Pesaro e Urbino', region: 'Marche' },
  PE: { name: 'Pescara', region: 'Abruzzo' },
  PC: { name: 'Piacenza', region: 'Emilia-Romagna' },
  PI: { name: 'Pisa', region: 'Toscana' },
  PT: { name: 'Pistoia', region: 'Toscana' },
  PN: { name: 'Pordenone', region: 'Friuli-Venezia Giulia' },
  PZ: { name: 'Potenza', region: 'Basilicata' },
  PO: { name: 'Prato', region: 'Toscana' },
  RG: { name: 'Ragusa', region: 'Sicilia' },
  RA: { name: 'Ravenna', region: 'Emilia-Romagna' },
  RC: { name: 'Reggio Calabria', region: 'Calabria' },
  RE: { name: "Reggio nell'Emilia", region: 'Emilia-Romagna' },
  RI: { name: 'Rieti', region: 'Lazio' },
  RN: { name: 'Rimini', region: 'Emilia-Romagna' },
  RM: { name: 'Roma', region: 'Lazio' },
  RO: { name: 'Rovigo', region: 'Veneto' },
  SA: { name: 'Salerno', region: 'Campania' },
  SS: { name: 'Sassari', region: 'Sardegna' },
  SV: { name: 'Savona', region: 'Liguria' },
  SI: { name: 'Siena', region: 'Toscana' },
  SO: { name: 'Sondrio', region: 'Lombardia' },
  TA: { name: 'Taranto', region: 'Puglia' },
  TE: { name: 'Teramo', region: 'Abruzzo' },
  TR: { name: 'Terni', region: 'Umbria' },
  TO: { name: 'Torino', region: 'Piemonte' },
  TP: { name: 'Trapani', region: 'Sicilia' },
  TN: { name: 'Trento', region: 'Trentino-Alto Adige' },
  TV: { name: 'Treviso', region: 'Veneto' },
  TS: { name: 'Trieste', region: 'Friuli-Venezia Giulia' },
  UD: { name: 'Udine', region: 'Friuli-Venezia Giulia' },
  VA: { name: 'Varese', region: 'Lombardia' },
  VE: { name: 'Venezia', region: 'Veneto' },
  VB: { name: 'Verbano-Cusio-Ossola', region: 'Piemonte' },
  VC: { name: 'Vercelli', region: 'Piemonte' },
  VR: { name: 'Verona', region: 'Veneto' },
  VV: { name: 'Vibo Valentia', region: 'Calabria' },
  VI: { name: 'Vicenza', region: 'Veneto' },
  VT: { name: 'Viterbo', region: 'Lazio' },
  SU: { name: 'Sud Sardegna', region: 'Sardegna' }
};

const toImmoTypologyId = (property: any) => {
  if (property?.immoTypologyId != null) {
    const n = Number(property.immoTypologyId);
    if (Number.isInteger(n) && n > 0) return n;
  }

  switch (property?.type) {
    case 'APARTMENT':
      return 14;
    case 'HOUSE':
      return 21;
    case 'VILLA':
      return 23;
    case 'OFFICE':
      return 258;
    case 'SHOP':
      return 268;
    case 'WAREHOUSE':
      return 249;
    case 'LAND':
      return 261;
    case 'GARAGE':
      return 253;
    default:
      return 14;
  }
};

const extractXmlTagValue = (xml: string, tag: string) => {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(re);
  if (!match) return null;
  const raw = match[1] ?? '';
  return raw.replace(/^<!\\[CDATA\\[|\\]\\]>$/g, '').trim();
};

const buildImmobiliarePropertyXml = (property: any, agency: any) => {
  const uniqueId = property?.giListingId;
  if (!uniqueId || !Number.isInteger(Number(uniqueId))) {
    throw new Error('Missing unique id for Immobiliare.it (giListingId)');
  }

  const salePrice = getPreferredSalePrice(property);
  const rentPrice = getPreferredRentPrice(property);
  const hasSale = salePrice != null;
  const hasRent = rentPrice != null;
  if (!hasSale && !hasRent) {
    throw new Error('Missing salePrice/rentPrice for Immobiliare.it');
  }

  const dateUpdated = toImmoDateTime(new Date(property?.updatedAt || Date.now()));

  const provinceRaw = (property?.province || '').toString().trim();
  const provinceKey = provinceRaw.length === 2 ? provinceRaw.toUpperCase() : provinceRaw;
  const provinceName = PROVINCE_META[provinceKey]?.name || provinceRaw;
  const regionName = PROVINCE_META[provinceKey]?.region || null;

  const comuneIstat = (property?.giComuneIstat || '').toString().trim();
  const lat = property?.latitude != null ? Number(property.latitude) : null;
  const lon = property?.longitude != null ? Number(property.longitude) : null;

  if ((lat == null || lon == null) && !/^\d{6}$/.test(comuneIstat)) {
    throw new Error('Missing location coordinates or valid ISTAT code (giComuneIstat) for Immobiliare.it');
  }

  const agentEmail = (agency?.email || '').toString().trim();
  if (!agentEmail) {
    throw new Error('Missing agency email for Immobiliare.it');
  }

  const buildingIdType = toImmoTypologyId(property);
  const transactionsXml = [
    hasSale
      ? `<transaction type="S"><price currency="EUR" reserved="false">${xmlEscape(Math.round(Number(salePrice)))}</price></transaction>`
      : '',
    hasRent
      ? `<transaction type="R"><price currency="EUR" reserved="false">${xmlEscape(Math.round(Number(rentPrice)))}</price></transaction>`
      : ''
  ]
    .filter(Boolean)
    .join('');

  const pictures = Array.isArray(property?.images) ? property.images : [];
  const picturesXml = pictures.length
    ? `<pictures>${pictures
        .slice(0, 30)
        .map((url: string, idx: number) => `<picture position="${idx + 1}" url="${xmlEscape(url)}"/>`)
        .join('')}</pictures>`
    : '';

  const publishXml =
    Array.isArray(property?.portalTargets) && property.portalTargets.includes('IMMOBILIARE_IT')
      ? `<publish><portal id="immobiliare.it" status="true"></portal></publish>`
      : '';

  const locationParts = [
    `<country-code>IT</country-code>`,
    regionName ? `<administrative-area>${xmlCdata(regionName)}</administrative-area>` : '',
    provinceName ? `<sub-administrative-area>${xmlCdata(provinceName)}</sub-administrative-area>` : '',
    comuneIstat ? `<city${/^\d{6}$/.test(comuneIstat) ? ` code="${xmlEscape(comuneIstat)}"` : ''}>${xmlCdata(property?.city || '')}</city>` : `<city>${xmlCdata(property?.city || '')}</city>`,
    `<locality map="exact">` +
      [
        property?.zipCode ? `<postal-code>${xmlEscape(property.zipCode)}</postal-code>` : '',
        lat != null ? `<latitude>${xmlEscape(lat)}</latitude>` : '',
        lon != null ? `<longitude>${xmlEscape(lon)}</longitude>` : '',
        property?.address ? `<thoroughfare display="yes">${xmlCdata(property.address)}</thoroughfare>` : ''
      ]
        .filter(Boolean)
        .join('') +
      `</locality>`
  ]
    .filter(Boolean)
    .join('');

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<property operation="write">` +
    `<unique-id>${xmlCdata(uniqueId)}</unique-id>` +
    `<date-updated>${xmlEscape(dateUpdated)}</date-updated>` +
    `<agent><office-name>${xmlCdata(agency?.name || '')}</office-name><email>${xmlEscape(agentEmail)}</email></agent>` +
    `<building IDType="${xmlEscape(buildingIdType)}" />` +
    `<transactions>${transactionsXml}</transactions>` +
    `<location>${locationParts}</location>` +
    picturesXml +
    publishXml +
    `</property>`;

  return { xml, uniqueId: String(uniqueId) };
};

const buildImmobiliareDeleteXml = (property: any) => {
  const uniqueId = property?.giListingId;
  if (!uniqueId || !Number.isInteger(Number(uniqueId))) {
    throw new Error('Missing unique id for Immobiliare.it (giListingId)');
  }

  const dateUpdated = toImmoDateTime(new Date());
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<property operation="delete">` +
    `<unique-id>${xmlCdata(uniqueId)}</unique-id>` +
    `<date-updated>${xmlEscape(dateUpdated)}</date-updated>` +
    `</property>`;

  return { xml, uniqueId: String(uniqueId) };
};

const truncateText = (value: unknown, maxLen: number) => {
  const text = value == null ? '' : String(value);
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + 'â€¦';
};

const createPortalSyncLog = async (args: {
  portalId: string;
  propertyId?: string | null;
  operation: string;
  status: 'OK' | 'ERROR';
  message?: string | null;
  payloadSnippet?: unknown;
}) => {
  try {
    const messageText = args.message == null ? null : truncateText(args.message, 1000);
    let snippet: string | null = null;
    if (args.payloadSnippet !== undefined && args.payloadSnippet !== null) {
      const raw =
        typeof args.payloadSnippet === 'string'
          ? args.payloadSnippet
          : JSON.stringify(args.payloadSnippet);
      snippet = truncateText(raw, 2000);
    }

    await prisma.portalSyncLog.create({
      data: {
        portalId: args.portalId,
        propertyId: args.propertyId || null,
        operation: args.operation,
        status: args.status,
        message: messageText,
        payloadSnippet: snippet
      }
    });
  } catch {}
};

const isExternalPublishDisabled = () => {
  const raw = (process.env.DISABLE_EXTERNAL_PUBLISH || '').toString().trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
};

const sendImmobiliareXml = async (agency: any, xml: string) => {
  const globalCredentials = await getGlobalPortalCredentials('IMMOBILIARE_IT');

  const immoEndpoint = (
    globalCredentials?.endpoint ||
    agency?.immoEndpoint ||
    ''
  ).toString().trim();

  const immoUsername = (
    globalCredentials?.username ||
    agency?.immoUsername ||
    ''
  ).toString();

  const immoPassword = (
    globalCredentials?.password ||
    agency?.immoPassword ||
    ''
  ).toString();

  const immoSource = (agency?.immoSource || '').toString().trim();

  if (!immoEndpoint) throw new Error('Missing immoEndpoint');
  if (!immoUsername || !immoPassword) throw new Error('Missing immoUsername/immoPassword');
  if (!immoSource) throw new Error('Missing immoSource');

  const auth = Buffer.from(`${immoUsername}:${immoPassword}`).toString('base64');
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/xml; charset=utf-8',
    'X-IMMO-SOURCE': immoSource
  };

  const response = await fetch(immoEndpoint, { method: 'POST', headers, body: xml });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
};

const getApimoBaseUrl = () => {
  const fromEnv = normalizeBaseUrl(process.env.APIMO_ENDPOINT);
  return fromEnv || 'https://api.apimo.pro';
};

const apimoRequest = async ({
  provider,
  token,
  method,
  path,
  query,
  body
}: {
  provider: string;
  token: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: any;
}) => {
  const auth = Buffer.from(`${provider}:${token}`).toString('base64');
  const baseUrl = getApimoBaseUrl();
  const url = new URL(path.startsWith('/') ? path : `/${path}`, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    Accept: 'application/json'
  };

  const init: any = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), init);
  const text = await response.text();
  const json = text ? (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })() : null;
  return { ok: response.ok, status: response.status, text, json };
};

const coerceApimoQuery = (query: Record<string, any>) => {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query || {})) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[key] = v;
      continue;
    }
    out[key] = String(v);
  }
  return out;
};

const getApimoConfigOrThrow = async (agencyId: string) => {
  const secret = await getSecret(`portal/APIMO_NET/agency/${agencyId}`);
  if (secret) {
    const provider = (
      (secret as any).provider ||
      (secret as any).username ||
      ''
    ).toString().trim();

    const token = (
      (secret as any).token ||
      (secret as any).apiKey ||
      ''
    ).toString().trim();

    const apimoAgencyId = (
      (secret as any).apimoAgencyId ||
      (secret as any).agencyId ||
      ''
    ).toString().trim();

    if (provider && token && apimoAgencyId) {
      return { agencyId, provider, token, apimoAgencyId };
    }
  }

  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { id: true, apimoProvider: true, apimoToken: true, apimoAgencyId: true }
  });

  if (!agency?.id || !agency.apimoProvider || !agency.apimoToken || !agency.apimoAgencyId) {
    throw new Error('Missing apimoProvider/apimoToken/apimoAgencyId config');
  }

  return {
    agencyId: agency.id,
    provider: agency.apimoProvider,
    token: agency.apimoToken,
    apimoAgencyId: agency.apimoAgencyId
  };
};

const getGroqBaseUrl = () => {
  const fromEnv = normalizeBaseUrl(process.env.GROQ_BASE_URL);
  return fromEnv || 'https://api.groq.com/openai/v1';
};

const getGroqConfigOrThrow = () => {
  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) throw new Error('Missing GROQ_API_KEY');
  const model = (process.env.GROQ_MODEL || '').trim() || 'llama-3.1-8b-instant';
  const baseUrl = getGroqBaseUrl();
  return { apiKey, model, baseUrl };
};

const AI_ASSIST_ALLOWED_PAGES = new Set([
  'dashboard',
  'immobili',
  'contatti',
  'incrocio',
  'agenti',
  'zone-tasks',
  'appuntamenti',
  'contratti',
  'attivita',
  'notifiche',
  'report',
  'impostazioni',
  'portals',
  'ai-assist'
]);

const normalizeAiAssistPage = (value: unknown): string | null => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  return AI_ASSIST_ALLOWED_PAGES.has(raw) ? raw : null;
};

const normalizeAiAssistAction = (value: unknown): 'navigate' | 'reply' => {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'navigate' ? 'navigate' : 'reply';
};

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const groqChatCompletion = async ({
  apiKey,
  baseUrl,
  model,
  messages,
  temperature
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
}) => {
  const url = new URL('/chat/completions', baseUrl);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.4,
      stream: false
    })
  });
  const text = await response.text();
  const json = text
    ? (() => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })()
    : null;
  return { ok: response.ok, status: response.status, text, json };
};

const getApimoCategoryIdForProperty = (property: any) => {
  const contractType = (property?.contractType || '').toString().toUpperCase();
  if (contractType === 'RENT') return 2;
  if (contractType === 'SALE') return 1;
  const salePrice = getPreferredSalePrice(property);
  const rentPrice = getPreferredRentPrice(property);
  if (salePrice != null) return 1;
  if (rentPrice != null) return 2;
  return 1;
};

const getApimoTypeAndSubtypeForProperty = (property: any) => {
  const localType = (property?.type || '').toString().toUpperCase();
  if (localType === 'APARTMENT') return { type: 1, subtype: 5 };
  if (localType === 'HOUSE') return { type: 2, subtype: 18 };
  if (localType === 'VILLA') return { type: 2, subtype: 14 };
  if (localType === 'OFFICE') return { type: 7, subtype: 36 };
  if (localType === 'SHOP') return { type: 4, subtype: 62 };
  if (localType === 'WAREHOUSE') return { type: 9, subtype: 41 };
  if (localType === 'LAND') return { type: 3, subtype: 46 };
  if (localType === 'GARAGE') return { type: 5, subtype: 43 };
  return { type: 1, subtype: 19 };
};

const buildApimoPropertyPayloadFromLocal = (property: any) => {
  const category = getApimoCategoryIdForProperty(property);
  const { type, subtype } = getApimoTypeAndSubtypeForProperty(property);

  const reference =
    property?.reference != null && String(property.reference).trim()
      ? String(property.reference).trim()
      : property?.giListingId != null
        ? String(property.giListingId)
        : String(property?.id || '');

  const priceValue = category === 2 ? getPreferredRentPrice(property) : getPreferredSalePrice(property);

  const payload: any = {
    reference,
    name: property?.title != null ? String(property.title) : reference,
    category,
    type,
    subtype,
    address: property?.address != null ? String(property.address) : undefined,
    city: property?.city != null ? String(property.city) : undefined,
    province: property?.province != null ? String(property.province) : undefined,
    zipCode: property?.zipCode != null ? String(property.zipCode) : undefined,
    country: 'IT'
  };

  const rooms = property?.rooms != null ? Number(property.rooms) : null;
  if (rooms != null && Number.isFinite(rooms)) payload.rooms = rooms;
  const bedrooms = property?.bedrooms != null ? Number(property.bedrooms) : null;
  if (bedrooms != null && Number.isFinite(bedrooms)) payload.bedrooms = bedrooms;

  const surface = property?.surface != null ? Number(property.surface) : null;
  if (surface != null && Number.isFinite(surface)) payload.area = { unit: 1, value: surface };

  if (priceValue != null && Number.isFinite(priceValue) && priceValue > 0) {
    payload.price = { value: priceValue, currency: 'EUR', ...(category === 2 ? { period: 4 } : {}) };
  }

  const title = property?.title != null && String(property.title).trim() ? String(property.title).trim() : reference;
  const description =
    property?.description != null && String(property.description).trim() ? String(property.description).trim() : title;

  payload.comments = [{ language: 'it', title, comment: truncateText(description, 4000) }];

  const lat = property?.latitude != null ? Number(property.latitude) : null;
  const lon = property?.longitude != null ? Number(property.longitude) : null;
  if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    payload.latitude = lat;
    payload.longitude = lon;
    payload.radius = 0;
  }

  return payload;
};

const apimoPullList = async ({
  provider,
  token,
  path,
  listKey,
  timestamp,
  limit
}: {
  provider: string;
  token: string;
  path: string;
  listKey: string;
  timestamp?: number | null;
  limit?: number;
}) => {
  const safeLimit = limit && Number.isFinite(limit) ? Math.max(1, Math.min(1000, Math.floor(limit))) : 1000;
  let offset = 0;
  let totalItems: number | null = null;
  let newestTimestamp = timestamp ?? 0;
  const items: any[] = [];

  while (totalItems === null || offset < totalItems) {
    const query: Record<string, any> = { limit: safeLimit, offset };
    if (timestamp) query.timestamp = timestamp;

    const result = await apimoRequest({ provider, token, method: 'GET', path, query });
    if (!result.ok) {
      const message = result.json?.message || result.text || `APIMO request failed (${result.status})`;
      throw new Error(String(message));
    }

    const payload = result.json || {};
    const batch = Array.isArray(payload[listKey]) ? payload[listKey] : [];
    const batchTotal = typeof payload.total_items === 'number' ? payload.total_items : null;
    const batchTimestamp = typeof payload.timestamp === 'number' ? payload.timestamp : null;

    if (batchTotal !== null) totalItems = batchTotal;
    if (batchTimestamp !== null && batchTimestamp > newestTimestamp) newestTimestamp = batchTimestamp;

    items.push(...batch);

    if (batch.length === 0) break;
    offset += batch.length;
    if (batch.length < safeLimit) break;
  }

  return { items, newestTimestamp: newestTimestamp || null };
};

const upsertApimoRecord = async ({
  agencyId,
  entityType,
  apimoId,
  payload,
  localEntityId,
  pulledAt,
  error
}: {
  agencyId: string;
  entityType: any;
  apimoId: string;
  payload: any;
  localEntityId?: string | null;
  pulledAt?: Date;
  error?: string | null;
}) => {
  const now = pulledAt ?? new Date();
  return prisma.apimoRecord.upsert({
    where: {
      agencyId_entityType_apimoId: {
        agencyId,
        entityType,
        apimoId
      }
    },
    create: {
      agencyId,
      entityType,
      apimoId,
      payload,
      localEntityId: localEntityId ?? null,
      lastPulledAt: now,
      lastError: error ?? null
    },
    update: {
      payload,
      localEntityId: localEntityId ?? undefined,
      lastPulledAt: now,
      lastError: error ?? null
    }
  });
};

const upsertLocalContactFromApimo = async ({
  agencyId,
  defaultAssignedToId,
  apimoId,
  payload,
  existingLocalId
}: {
  agencyId: string;
  defaultAssignedToId: string;
  apimoId: string;
  payload: any;
  existingLocalId?: string | null;
}) => {
  const firstNameRaw = payload?.firstname ?? payload?.first_name ?? payload?.firstName;
  const lastNameRaw = payload?.lastname ?? payload?.last_name ?? payload?.lastName;
  const firstName = firstNameRaw != null && String(firstNameRaw).trim() ? String(firstNameRaw).trim() : 'APIMO';
  const lastName = lastNameRaw != null && String(lastNameRaw).trim() ? String(lastNameRaw).trim() : apimoId;
  const email = payload?.email != null && String(payload.email).trim() ? String(payload.email).trim() : null;
  const phone =
    payload?.phone != null && String(payload.phone).trim()
      ? String(payload.phone).trim()
      : payload?.mobile != null && String(payload.mobile).trim()
        ? String(payload.mobile).trim()
        : null;

  const updateData: any = {
    firstName,
    lastName,
    email,
    phone,
    address: payload?.address != null ? String(payload.address) : undefined,
    city: payload?.city != null ? String(payload.city) : undefined,
    province: payload?.province != null ? String(payload.province) : undefined,
    zipCode: payload?.zipCode != null ? String(payload.zipCode) : payload?.zip_code != null ? String(payload.zip_code) : undefined,
    notes: payload?.notes != null ? String(payload.notes) : undefined,
    source: 'APIMO'
  };

  if (existingLocalId) {
    const updated = await prisma.contact.update({ where: { id: existingLocalId }, data: updateData, select: { id: true } });
    return updated.id;
  }

  if (email) {
    const existingByEmail = await prisma.contact.findFirst({ where: { agencyId, email }, select: { id: true } });
    if (existingByEmail?.id) {
      const updated = await prisma.contact.update({ where: { id: existingByEmail.id }, data: updateData, select: { id: true } });
      return updated.id;
    }
  }

  const created = await prisma.contact.create({
    data: {
      ...updateData,
      type: 'LEAD',
      tags: [],
      agencyId,
      assignedToId: defaultAssignedToId
    },
    select: { id: true }
  });

  return created.id;
};

const upsertLocalRequestFromApimo = async ({
  agencyId,
  defaultAssignedToId,
  apimoId,
  payload,
  existingLocalId
}: {
  agencyId: string;
  defaultAssignedToId: string;
  apimoId: string;
  payload: any;
  existingLocalId?: string | null;
}) => {
  const apimoContactIdRaw =
    payload?.contact?.id ??
    payload?.customer?.id ??
    payload?.client?.id ??
    payload?.buyer?.id ??
    payload?.tenant?.id ??
    payload?.lead?.id ??
    payload?.contact_id;

  const apimoContactId = apimoContactIdRaw == null ? null : String(apimoContactIdRaw);
  let contactId: string | null = null;

  if (apimoContactId) {
    const record = await prisma.apimoRecord.findUnique({
      where: {
        agencyId_entityType_apimoId: { agencyId, entityType: 'CONTACT', apimoId: apimoContactId }
      },
      select: { localEntityId: true }
    });
    if (record?.localEntityId) contactId = record.localEntityId;
  }

  if (!contactId && payload?.contact?.email) {
    const email = String(payload.contact.email).trim();
    if (email) {
      const existingByEmail = await prisma.contact.findFirst({ where: { agencyId, email }, select: { id: true } });
      if (existingByEmail?.id) contactId = existingByEmail.id;
    }
  }

  if (!contactId) return null;

  const titleRaw = payload?.title ?? payload?.name ?? payload?.reference;
  const title = titleRaw != null && String(titleRaw).trim() ? String(titleRaw).trim() : `Richiesta APIMO ${apimoId}`;

  const rawType = (payload?.type?.name || payload?.type || payload?.category || '').toString().toLowerCase();
  const type =
    rawType.includes('appart') || rawType.includes('apartment')
      ? 'APARTMENT'
      : rawType.includes('villa')
        ? 'VILLA'
        : rawType.includes('house') || rawType.includes('casa')
          ? 'HOUSE'
          : rawType.includes('office') || rawType.includes('ufficio')
            ? 'OFFICE'
            : rawType.includes('shop') || rawType.includes('negozio')
              ? 'SHOP'
              : rawType.includes('warehouse') || rawType.includes('magazz')
                ? 'WAREHOUSE'
                : rawType.includes('land') || rawType.includes('terreno')
                  ? 'LAND'
                  : rawType.includes('garage') || rawType.includes('box')
                    ? 'GARAGE'
                    : 'OTHER';

  const rawContract = (payload?.contract?.name || payload?.contract || payload?.transaction || '').toString().toLowerCase();
  const contractType = rawContract.includes('rent') || rawContract.includes('affitto') ? 'RENT' : 'SALE';

  const cities = Array.isArray(payload?.cities)
    ? payload.cities.map((c: any) => String(c)).filter((c: any) => c && String(c).trim())
    : payload?.city != null && String(payload.city).trim()
      ? [String(payload.city).trim()]
      : [];
  const provinces = Array.isArray(payload?.provinces)
    ? payload.provinces.map((p: any) => String(p)).filter((p: any) => p && String(p).trim())
    : payload?.province != null && String(payload.province).trim()
      ? [String(payload.province).trim()]
      : [];

  const updateData: any = {
    title,
    description: payload?.description != null ? String(payload.description) : undefined,
    type: type as any,
    contractType: contractType as any,
    minPrice: payload?.min_price != null ? Number(payload.min_price) : undefined,
    maxPrice: payload?.max_price != null ? Number(payload.max_price) : undefined,
    minSurface: payload?.min_surface != null ? Number(payload.min_surface) : undefined,
    maxSurface: payload?.max_surface != null ? Number(payload.max_surface) : undefined,
    minRooms: payload?.min_rooms != null ? Number(payload.min_rooms) : undefined,
    maxRooms: payload?.max_rooms != null ? Number(payload.max_rooms) : undefined,
    cities,
    provinces,
    notes: payload?.notes != null ? String(payload.notes) : undefined
  };

  if (existingLocalId) {
    const updated = await prisma.request.update({ where: { id: existingLocalId }, data: updateData, select: { id: true } });
    return updated.id;
  }

  const created = await prisma.request.create({
    data: {
      ...updateData,
      agencyId,
      contactId,
      assignedToId: defaultAssignedToId
    },
    select: { id: true }
  });

  return created.id;
};

// Middleware
function normalizeIp(ip: string | null | undefined) {
  if (!ip) return '';
  let value = String(ip).trim();
  if (value.startsWith('::ffff:')) {
    value = value.substring('::ffff:'.length);
  }
  if (value === '::1') return '127.0.0.1';
  return value;
}

function isIpAllowed(req: express.Request) {
  if (!INTERNAL_IP_ALLOWLIST.length) return true;
  const candidates: string[] = [];
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) {
    const first = xff.split(',')[0];
    if (first) candidates.push(first.trim());
  } else if (Array.isArray(xff) && xff.length > 0) {
    const first = xff[0];
    if (typeof first === 'string') candidates.push(first.trim());
  }
  candidates.push(req.ip);
  const remote = (req.socket as any)?.remoteAddress || (req.connection as any)?.remoteAddress;
  if (remote) candidates.push(String(remote));

  const normalizedCandidates = candidates.map(c => normalizeIp(c));
  const normalizedAllowed = INTERNAL_IP_ALLOWLIST.map(a => normalizeIp(a));

  return normalizedCandidates.some(ip => ip && normalizedAllowed.includes(ip));
}

function requireIpAllowlist(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!INTERNAL_IP_ALLOWLIST.length) {
    next();
    return;
  }
  if (isIpAllowed(req)) {
    next();
    return;
  }

  const path = req.originalUrl || req.path || '';
  const userAgent =
    req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
      ? req.headers['user-agent']
      : null;

  if (path.startsWith('/internal')) {
    writeAuditLog(
      'INTERNAL_IP_BLOCKED',
      'InternalAccess',
      path,
      null,
      req.ip || null,
      null,
      userAgent,
      null
    ).catch(() => {});
  }

  res.status(403).json({ success: false, message: 'Accesso non consentito da questo IP' });
}

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: (process.env.FRONTEND_URL || '').trim() || 'http://localhost:3000',
    credentials: true
  })
);
const _jsonBodyLimit = (process.env.JSON_BODY_LIMIT || '10mb').trim() || '10mb';
const _jsonParser = express.json({ limit: _jsonBodyLimit });
app.use((req, res, next) => {
  if (req.originalUrl === '/stripe/webhook') {
    next();
    return;
  }
  _jsonParser(req, res, next);
});

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    try {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const route = (req.route && req.route.path) || req.path || req.originalUrl || 'unknown';
      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode)
      };
      httpRequestDurationSeconds.observe(labels, durationSeconds);
      httpRequestsTotal.inc(labels);
    } catch {
    }
  });
  next();
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    const metrics = await client.register.metrics();
    res.send(metrics);
  } catch {
    res.status(500).send('Errore generazione metrics');
  }
});

app.use('/internal', requireIpAllowlist);

app.post('/stripe/webhook', requireIpAllowlist, express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    res.status(500).send('Stripe non configurato');
    return;
  }

  const signatureHeader = req.headers['stripe-signature'];
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    res.status(400).send('Firma Stripe mancante');
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signatureHeader, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('Errore verifica firma Stripe:', err?.message || err);
    res.status(400).send('Firma non valida');
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerRaw = session.customer;
      const subscriptionRaw = session.subscription;

      if (!customerRaw || !subscriptionRaw) {
        res.json({ received: true });
        return;
      }

      const customerId =
        typeof customerRaw === 'string' ? customerRaw : customerRaw.id ? String(customerRaw.id) : String(customerRaw);
      const subscriptionId =
        typeof subscriptionRaw === 'string'
          ? subscriptionRaw
          : subscriptionRaw.id
            ? String(subscriptionRaw.id)
            : String(subscriptionRaw);

      let stripeSubscription: Stripe.Subscription | null = null;
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (error: any) {
        console.error('Errore caricamento subscription Stripe:', error?.message || error);
      }

      let status: SubscriptionStatus = SubscriptionStatus.ACTIVE;
      let currentPeriodEnd: Date | null = null;
      let planCode: string | null =
        (session.metadata && (session.metadata as any).plan_code) ||
        (session.metadata && (session.metadata as any).plan) ||
        null;

      if (stripeSubscription) {
        status = mapStripeSubscriptionStatus(stripeSubscription.status);
        const item = stripeSubscription.items.data[0];
        if (!planCode && item?.price?.id) {
          planCode = item.price.id;
        }
        if (stripeSubscription.current_period_end) {
          currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
        }
      }

      if (!planCode) {
        planCode = 'default';
      }

      const metadata = (session.metadata || {}) as Record<string, string | undefined>;
      const email =
        session.customer_details?.email ||
        session.customer_email ||
        metadata.admin_email ||
        metadata.email ||
        `${customerId}@placeholder.local`;
      const name =
        metadata.agency_name ||
        metadata.agencyName ||
        metadata.company_name ||
        metadata.companyName ||
        email ||
        customerId;

      await prisma.$transaction(async tx => {
        let agency = await tx.agency.findUnique({
          where: { email }
        });

        if (!agency) {
          agency = await tx.agency.create({
            data: {
              name,
              email,
              status: AgencyStatus.PENDING_PROVISIONING
            }
          });
        } else if (agency.status !== AgencyStatus.PENDING_PROVISIONING) {
          agency = await tx.agency.update({
            where: { id: agency.id },
            data: { status: AgencyStatus.PENDING_PROVISIONING }
          });
        }

        let subscription = await tx.subscription.findFirst({
          where: {
            OR: [
              { stripeSubscriptionId: subscriptionId },
              { stripeCustomerId: customerId, planCode }
            ]
          }
        });

        if (!subscription) {
          subscription = await tx.subscription.create({
            data: {
              agencyId: agency.id,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              planCode,
              status,
              currentPeriodEnd
            }
          });
        } else {
          subscription = await tx.subscription.update({
            where: { id: subscription.id },
            data: {
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              planCode,
              status,
              currentPeriodEnd
            }
          });
        }

        await tx.auditLog.create({
          data: {
            action: 'STRIPE_CHECKOUT_COMPLETED',
            entity: 'Subscription',
            entityId: subscription.id,
            userId: null,
            ipAddress: null
          }
        });
      });
    } else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionRaw = invoice.subscription;
      if (subscriptionRaw) {
        const subscriptionId = typeof subscriptionRaw === 'string' ? subscriptionRaw : String(subscriptionRaw);
        await prisma.$transaction(async tx => {
          const existing = await tx.subscription.findFirst({
            where: { stripeSubscriptionId: subscriptionId }
          });
          if (!existing) return;

          const updated = await tx.subscription.update({
            where: { id: existing.id },
            data: {
              status: SubscriptionStatus.PAST_DUE
            }
          });

          await tx.agency.update({
            where: { id: updated.agencyId },
            data: {
              status: AgencyStatus.SUSPENDED
            }
          });

          await tx.auditLog.create({
            data: {
              action: 'STRIPE_INVOICE_PAYMENT_FAILED',
              entity: 'Subscription',
              entityId: updated.id,
              userId: null,
              ipAddress: null
            }
          });
        });
      }
    } else if (event.type === 'customer.subscription.updated') {
      const stripeSubscription = event.data.object as Stripe.Subscription;
      const subscriptionId = stripeSubscription.id;
      const customer = stripeSubscription.customer;
      const customerId = typeof customer === 'string' ? customer : customer?.id ? String(customer.id) : null;

      const status = mapStripeSubscriptionStatus(stripeSubscription.status);
      const agencyStatus = mapSubscriptionStatusToAgencyStatus(status);
      const item = stripeSubscription.items.data[0];
      const planCode = item?.price?.id || null;
      const currentPeriodEnd = stripeSubscription.current_period_end
        ? new Date(stripeSubscription.current_period_end * 1000)
        : null;

      await prisma.$transaction(async tx => {
        const existing = await tx.subscription.findFirst({
          where: {
            OR: [
              { stripeSubscriptionId: subscriptionId },
              customerId
                ? {
                    stripeCustomerId: customerId
                  }
                : undefined
            ].filter(Boolean) as any
          }
        });

        if (!existing) return;

        const updated = await tx.subscription.update({
          where: { id: existing.id },
          data: {
            stripeSubscriptionId: subscriptionId,
            stripeCustomerId: customerId ?? existing.stripeCustomerId,
            status,
            currentPeriodEnd,
            ...(planCode ? { planCode } : {})
          }
        });

        if (agencyStatus) {
          await tx.agency.update({
            where: { id: updated.agencyId },
            data: {
              status: agencyStatus
            }
          });
        }

        await tx.auditLog.create({
          data: {
            action: 'STRIPE_SUBSCRIPTION_UPDATED',
            entity: 'Subscription',
            entityId: updated.id,
            userId: null,
            ipAddress: null
          }
        });
      });
    } else if (event.type === 'customer.subscription.deleted') {
      const stripeSubscription = event.data.object as Stripe.Subscription;
      const subscriptionId = stripeSubscription.id;

      await prisma.$transaction(async tx => {
        const existing = await tx.subscription.findFirst({
          where: { stripeSubscriptionId: subscriptionId }
        });
        if (!existing) return;

        const updated = await tx.subscription.update({
          where: { id: existing.id },
          data: {
            status: SubscriptionStatus.CANCELED
          }
        });

        await tx.agency.update({
          where: { id: updated.agencyId },
          data: {
            status: AgencyStatus.CANCELED
          }
        });

        await tx.auditLog.create({
          data: {
            action: 'STRIPE_SUBSCRIPTION_DELETED',
            entity: 'Subscription',
            entityId: updated.id,
            userId: null,
            ipAddress: null
          }
        });
      });
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Errore gestione webhook Stripe:', error?.message || error);
    res.status(500).send('Errore interno');
  }
});

type AuthContext = {
  id: string;
  role: string;
  agencyId: string | null;
};

const isAdminRole = (role?: string | null) => role === 'SUPER_ADMIN' || role === 'AGENCY_ADMIN';

const getJwtSecret = () => (process.env.JWT_SECRET || '').trim() || 'dev-secret';
const getRefreshJwtSecret = () => (process.env.JWT_REFRESH_SECRET || '').trim() || 'dev-refresh-secret';

const getBearerToken = (req: express.Request) => {
  const header = req.headers.authorization;
  if (!header) return null;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ? match[1].trim() : null;
};

const getAuth = (req: express.Request) => (req as any).auth as AuthContext | undefined;

type OnboardingStatusResponse = {
  status: OnboardingStatus;
  step: number;
  agencyDataComplete: boolean;
  teamComplete: boolean;
  configComplete: boolean;
  missingAgencyFields: string[];
  missingTeam: string[];
  missingConfig: string[];
};

async function evaluateOnboardingStatus(agencyId: string): Promise<OnboardingStatusResponse> {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: {
      name: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      province: true,
      zipCode: true,
      vatNumber: true,
      website: true,
      logo: true,
      publicBaseUrl: true,
      onboardingStatus: true,
      onboardingStep: true
    }
  });

  if (!agency) {
    throw new Error('Agency not found');
  }

  const users = await prisma.user.findMany({
    where: { agencyId, isActive: true },
    select: { role: true }
  });

  const portalConfigs = await prisma.portalConfig.findMany({
    where: { agencyId, active: true },
    select: { portalId: true }
  });

  const missingAgencyFields: string[] = [];
  if (!agency.name || !agency.name.trim()) missingAgencyFields.push('name');
  if (!agency.vatNumber || !agency.vatNumber.trim()) missingAgencyFields.push('vatNumber');
  if (!agency.address || !agency.address.trim()) missingAgencyFields.push('address');
  if (!agency.city || !agency.city.trim()) missingAgencyFields.push('city');
  if (!agency.zipCode || !agency.zipCode.trim()) missingAgencyFields.push('zipCode');
  if (!agency.phone || !agency.phone.trim()) missingAgencyFields.push('phone');

  const agencyDataComplete = missingAgencyFields.length === 0;

  const hasAdminUser = users.some(
    (u) => u.role === 'SUPER_ADMIN' || u.role === 'AGENCY_ADMIN'
  );
  const teamComplete = hasAdminUser;

  const hasPublicBaseUrl =
    typeof agency.publicBaseUrl === 'string' && agency.publicBaseUrl.trim() !== '';
  const activePortalsCount = portalConfigs.length;
  const configComplete = hasPublicBaseUrl || activePortalsCount > 0;

  let step = 1;
  if (agencyDataComplete) step = 2;
  if (agencyDataComplete && teamComplete) step = 3;
  if (agencyDataComplete && teamComplete && configComplete) step = 4;

  const missingTeam: string[] = [];
  if (!teamComplete) missingTeam.push('adminUser');

  const missingConfig: string[] = [];
  if (!hasPublicBaseUrl) missingConfig.push('publicBaseUrl');
  if (activePortalsCount === 0) missingConfig.push('portalConfig');

  const status = agency.onboardingStatus || OnboardingStatus.PENDING;

  return {
    status,
    step,
    agencyDataComplete,
    teamComplete,
    configComplete,
    missingAgencyFields,
    missingTeam,
    missingConfig
  };
}

const getUserIdFromToken = (token: string) => {
  const trimmed = token.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('mock-jwt-token-')) {
    return trimmed.slice('mock-jwt-token-'.length);
  }

  try {
    const decoded = jwt.verify(trimmed, getJwtSecret()) as any;
    const idCandidate = decoded?.sub || decoded?.id || decoded?.userId;
    if (typeof idCandidate === 'string' && idCandidate.trim()) return idCandidate.trim();
    return null;
  } catch {
    return null;
  }
};

app.use(async (req, res, next) => {
  try {
    if (!req.path.startsWith('/api')) return next();
    if (req.path === '/api/health') return next();
    if (req.path === '/api/internal/reminders/appointments/sweep') return next();
    // Endpoints auth pubblici: login e refresh token
    if (req.path === '/api/auth/login' || req.path === '/api/auth/refresh') return next();
    if (req.path.startsWith('/api/public/')) return next();
    if (req.method === 'GET' && /^\/api\/properties\/[^/]+\/images\/[^/]+$/i.test(req.path)) return next();
    if (req.method === 'GET' && /^\/api\/properties\/[^/]+\/documents\/[^/]+$/i.test(req.path)) return next();
    if (req.method === 'POST' && req.path === '/api/contact-requests') return next();
    if (req.method === 'POST' && req.path === '/api/visit-bookings') return next();

    const bearer = getBearerToken(req);
    const xUserIdHeader = req.headers['x-user-id'];
    const xUserId = typeof xUserIdHeader === 'string' ? xUserIdHeader : Array.isArray(xUserIdHeader) ? xUserIdHeader[0] : null;
    const token = bearer || xUserId;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = getUserIdFromToken(token) || token;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, agencyId: true, isActive: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    (req as any).auth = { id: user.id, role: user.role, agencyId: user.agencyId };
    if (!IS_VERCEL_RUNTIME) maybeRunAppointmentReminderSweep();
    return next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Auth error' });
  }
});

const parseStringQuery = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const resolvePublicAgencyId = async (req: express.Request) => {
  const queryAgencyId = parseStringQuery((req.query as any)?.agencyId);
  if (queryAgencyId) return queryAgencyId;

  const envAgencyId = (process.env.PUBLIC_AGENCY_ID || '').trim();
  if (envAgencyId) return envAgencyId;

  const hostHeader = req.headers.host;
  const host = (typeof hostHeader === 'string' ? hostHeader : Array.isArray(hostHeader) ? hostHeader[0] : '')
    .split(',')[0]
    .trim()
    .toLowerCase();

  if (host) {
    const agencies = await prisma.agency.findMany({ select: { id: true, publicBaseUrl: true } });
    const matched = agencies.find((agency) => {
      const base = normalizeBaseUrl(agency.publicBaseUrl);
      if (!base) return false;
      try {
        return new URL(base).host.toLowerCase() === host;
      } catch {
        return false;
      }
    });

    if (matched) return matched.id;
    if (agencies.length === 1) return agencies[0].id;
    return null;
  }

  const agencies = await prisma.agency.findMany({ select: { id: true }, take: 2 });
  if (agencies.length === 1) return agencies[0].id;
  return null;
};

app.get('/api/public/properties/:id', async (req, res) => {
  try {
    const agencyId = await resolvePublicAgencyId(req);

    const where: any = {
      id: req.params.id,
      isPublished: true
    };

    if (agencyId) where.agencyId = agencyId;

    const property = await prisma.property.findFirst({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        contractType: true,
        status: true,
        address: true,
        city: true,
        province: true,
        zipCode: true,
        giComuneIstat: true,
        latitude: true,
        longitude: true,
        rooms: true,
        bedrooms: true,
        bathrooms: true,
        surface: true,
        garden: true,
        terrace: true,
        balcony: true,
        parking: true,
        floor: true,
        totalFloors: true,
        elevator: true,
        furnished: true,
        salePrice: true,
        rentPrice: true,
        expenses: true,
        energyClass: true,
        images: true,
        virtualTour: true,
        floorPlan: true,
        reference: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    res.json({ success: true, data: property });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching public property' });
  }
});

app.post('/api/public/checkout/create-session', async (req, res) => {
  const body = req.body || {};
  const rawPlanCode = body.planCode;
  const rawPriceId = body.priceId ?? body.price;
  const rawAgencyName = body.agencyName ?? body.businessName ?? body.companyName ?? body.ragioneSociale;
  const rawAdminEmail = body.adminEmail ?? body.email;

  const planCode = typeof rawPlanCode === 'string' ? rawPlanCode.trim() : '';
  const priceIdFromBody = typeof rawPriceId === 'string' ? rawPriceId.trim() : '';
  const agencyName = typeof rawAgencyName === 'string' ? rawAgencyName.trim() : '';
  const adminEmail = typeof rawAdminEmail === 'string' ? rawAdminEmail.trim() : '';

  if (!planCode && !priceIdFromBody) {
    res.status(400).json({ success: false, message: 'Piano non valido' });
    return;
  }

  if (!agencyName) {
    res.status(400).json({ success: false, message: 'Ragione sociale obbligatoria' });
    return;
  }

  if (!adminEmail) {
    res.status(400).json({ success: false, message: 'Email amministratore obbligatoria' });
    return;
  }

  const envBaseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL);
  const frontendBaseUrl = normalizeBaseUrl(process.env.FRONTEND_URL);
  const baseUrl = envBaseUrl || frontendBaseUrl || getRequestBaseUrl(req);

  if (PUBLIC_FAKE_CHECKOUT_MODE) {
    const sessionId = `demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const successUrl = `${baseUrl}/public/checkout/success?session_id=${encodeURIComponent(sessionId)}`;
    res.json({
      success: true,
      data: {
        url: successUrl
      }
    });
    return;
  }

  if (!stripe || !STRIPE_SECRET_KEY) {
    res.status(500).json({ success: false, message: 'Stripe non configurato' });
    return;
  }

  let stripePriceId: string;
  let planCodeForMetadata: string;

  if (priceIdFromBody) {
    stripePriceId = priceIdFromBody;
    planCodeForMetadata = planCode || priceIdFromBody;
  } else {
    const envKey = `STRIPE_PRICE_${planCode.toUpperCase()}`;
    const envPriceId = process.env[envKey];

    if (!envPriceId) {
      res.status(400).json({ success: false, message: 'Piano non valido' });
      return;
    }

    stripePriceId = envPriceId;
    planCodeForMetadata = planCode.toUpperCase();
  }

  let customer: Stripe.Customer;

  try {
    const existing = await stripe.customers.list({ email: adminEmail, limit: 1 });
    if (existing.data.length > 0) {
      customer = existing.data[0];
    } else {
      customer = await stripe.customers.create({
        email: adminEmail,
        name: agencyName || undefined
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message ? String(error.message) : 'Errore creazione customer Stripe'
    });
    return;
  }

  const successUrl = `${baseUrl}/public/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/public/checkout/cancel`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1
        }
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        agency_name: agencyName || null,
        admin_email: adminEmail,
        plan_code: planCodeForMetadata
      }
    });

    res.json({
      success: true,
      data: {
        url: session.url
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message ? String(error.message) : 'Errore creazione sessione di checkout'
    });
  }
});

app.get('/api/public/checkout/status', async (req, res) => {
  if (PUBLIC_FAKE_CHECKOUT_MODE) {
    const envBaseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL);
    const frontendBaseUrl = normalizeBaseUrl(process.env.FRONTEND_URL);
    const baseUrl = envBaseUrl || frontendBaseUrl || getRequestBaseUrl(req);
    res.status(200).json({
      success: true,
      data: {
        status: 'READY',
        baseUrl,
        message: 'ModalitÃ  demo attiva: la tua istanza Ã¨ pronta.'
      }
    });
    return;
  }

  if (!stripe || !STRIPE_SECRET_KEY) {
    res.status(500).json({ success: false, message: 'Stripe non configurato' });
    return;
  }

  const sessionIdRaw = req.query.session_id;
  const sessionId = typeof sessionIdRaw === 'string' ? sessionIdRaw.trim() : null;

  if (!sessionId) {
    res.status(400).json({ success: false, message: 'session_id mancante' });
    return;
  }

  let session: Stripe.Checkout.Session | null = null;

  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error: any) {
    res.status(200).json({
      success: true,
      data: {
        status: 'PENDING',
        baseUrl: null,
        message: 'Stiamo attendendo la conferma del pagamento.'
      }
    });
    return;
  }

  const subscriptionRaw = session.subscription;
  const customerRaw = session.customer;

  const subscriptionId =
    typeof subscriptionRaw === 'string'
      ? subscriptionRaw
      : subscriptionRaw && (subscriptionRaw as any).id
        ? String((subscriptionRaw as any).id)
        : null;

  const customerId =
    typeof customerRaw === 'string'
      ? customerRaw
      : customerRaw && (customerRaw as any).id
        ? String((customerRaw as any).id)
        : null;

  if (!subscriptionId && !customerId) {
    res.status(200).json({
      success: true,
      data: {
        status: 'PENDING',
        baseUrl: null,
        message: 'Stiamo attendendo la conferma del pagamento.'
      }
    });
    return;
  }

  try {
    const subscription = await prisma.subscription.findFirst({
      where: {
        OR: [
          subscriptionId
            ? {
                stripeSubscriptionId: subscriptionId
              }
            : undefined,
          customerId
            ? {
                stripeCustomerId: customerId
              }
            : undefined
        ].filter(Boolean) as any
      },
      include: {
        agency: {
          include: {
            instances: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    if (!subscription || !subscription.agency) {
      res.status(200).json({
        success: true,
        data: {
          status: 'PENDING',
          baseUrl: null,
          message: 'Stiamo preparando la tua agenzia.'
        }
      });
      return;
    }

    const agency = subscription.agency;
    const instance = agency.instances[0] || null;

    let statusText = 'PENDING';
    let baseUrl: string | null = null;
    let message = 'Stiamo preparando la tua agenzia.';

    if (!instance) {
      statusText = 'PENDING';
      message = 'Stiamo preparando la tua agenzia.';
    } else if (instance.status === InstanceStatus.PROVISIONING) {
      statusText = 'PROVISIONING';
      message = 'Stiamo configurando la tua istanza.';
    } else if (instance.status === InstanceStatus.READY) {
      statusText = 'READY';
      baseUrl = instance.baseUrl || null;
      message = 'La tua istanza Ã¨ pronta.';
    } else if (instance.status === InstanceStatus.ERROR) {
      statusText = 'ERROR';
      baseUrl = null;
      message = instance.orchestratorReference || 'Si Ã¨ verificato un errore durante il provisioning.';
    }

    res.status(200).json({
      success: true,
      data: {
        status: statusText,
        baseUrl,
        message
      }
    });
  } catch {
    res.status(200).json({
      success: true,
      data: {
        status: 'PENDING',
        baseUrl: null,
        message: 'Stiamo preparando la tua agenzia.'
      }
    });
  }
});

app.get('/api/ai/status', (_req, res) => {
  try {
    const configured = Boolean((process.env.GROQ_API_KEY || '').trim());
    const model = (process.env.GROQ_MODEL || '').trim() || 'llama-3.1-8b-instant';
    res.json({ success: true, data: { configured, model } });
  } catch {
    res.status(500).json({ success: false, message: 'Error fetching AI status' });
  }
});

app.post('/api/ai-assist/respond', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const text = req.body?.text != null ? String(req.body.text).trim() : '';
    const userName = req.body?.userName != null ? String(req.body.userName).trim() : 'Utente';

    if (!text) return res.status(400).json({ success: false, message: 'Missing text' });

    const pages = Array.isArray(req.body?.pages)
      ? req.body.pages
          .map((item: any) => ({
            page: normalizeAiAssistPage(item?.page),
            label: String(item?.label || '').trim(),
            keywords: Array.isArray(item?.keywords)
              ? item.keywords
                  .map((k: any) => String(k || '').trim())
                  .filter(Boolean)
                  .slice(0, 8)
              : []
          }))
          .filter((item: any) => item.page && item.label)
      : [];

    const pagesContext = pages.length
      ? pages.map((item: any) => `${item.page} => ${item.label} (${item.keywords.join(', ')})`).join('\n')
      : 'dashboard, immobili, clienti, appuntamenti, attivita, notifiche, report, impostazioni';

    const localFallback = {
      text: 'Posso aiutarti con i comandi del gestionale. Prova: Apri immobili oppure Apri appuntamenti.',
      action: 'reply',
      page: null,
      suggestion: 'Dimmi un comando operativo semplice.',
      scope: 'in_scope',
      source: 'local_fallback'
    };

    const configured = Boolean((process.env.GROQ_API_KEY || '').trim());
    if (!configured) {
      return res.json({ success: true, data: localFallback });
    }

    const { apiKey, model, baseUrl } = getGroqConfigOrThrow();
    const result = await groqChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        {
          role: 'system',
          content:
            'Sei un assistente vocale per CRM immobiliare in italiano. ' +
            'Rispondi in modo breve e operativo. ' +
            'Se l utente chiede di aprire una sezione, imposta action="navigate" e page valida. ' +
            'Rispondi SOLO JSON con questa forma: ' +
            '{"text":"...","action":"reply|navigate","page":"dashboard|immobili|contatti|incrocio|agenti|zone-tasks|appuntamenti|contratti|attivita|notifiche|report|impostazioni|portals|ai-assist|null","suggestion":"...","scope":"in_scope|out_of_scope"}. ' +
            'Se fuori ambito gestionale usa scope="out_of_scope" e non impostare page.'
        },
        {
          role: 'user',
          content:
            `Utente: ${userName}\n` +
            `Comando: ${text}\n` +
            `Sezioni disponibili:\n${pagesContext}\n` +
            'Ricorda: testo chiaro, massimo 2 frasi.'
        }
      ],
      temperature: 0.3
    });

    if (!result.ok) {
      return res.json({ success: true, data: localFallback });
    }

    const content = String(result.json?.choices?.[0]?.message?.content || '').trim();
    const parsed = safeJsonParse(content);
    if (!parsed || typeof parsed !== 'object') {
      return res.json({ success: true, data: localFallback });
    }

    const action = normalizeAiAssistAction((parsed as any).action);
    const page = normalizeAiAssistPage((parsed as any).page);
    const scope = (parsed as any).scope === 'out_of_scope' ? 'out_of_scope' : 'in_scope';
    const responseText = String((parsed as any).text || '').trim() || localFallback.text;
    const suggestion = String((parsed as any).suggestion || '').trim();

    res.json({
      success: true,
      data: {
        text: responseText,
        action,
        page: action === 'navigate' ? page : null,
        suggestion: suggestion || undefined,
        scope,
        source: 'groq'
      }
    });
  } catch {
    res.json({
      success: true,
      data: {
        text: 'Posso aiutarti con il gestionale. Prova con un comando semplice.',
        action: 'reply',
        page: null,
        suggestion: 'Esempio: Apri clienti',
        scope: 'in_scope',
        source: 'local_fallback'
      }
    });
  }
});

app.post('/api/ai/translate', async (req, res) => {
  try {
    const { apiKey, model, baseUrl } = getGroqConfigOrThrow();
    const text = req.body?.text != null ? String(req.body.text) : '';
    const targetLanguage = req.body?.targetLanguage != null ? String(req.body.targetLanguage) : '';
    if (!text.trim()) return res.status(400).json({ success: false, message: 'Missing text' });
    if (!targetLanguage.trim()) return res.status(400).json({ success: false, message: 'Missing targetLanguage' });

    const result = await groqChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        { role: 'system', content: 'Sei un traduttore professionale. Rispondi solo con il testo tradotto, senza spiegazioni.' },
        { role: 'user', content: `Traduci in ${targetLanguage}:\n\n${text}` }
      ],
      temperature: 0.2
    });

    if (!result.ok) {
      const errorText = truncateText(result.json?.error?.message || result.json?.message || result.text, 2000);
      return res.status(502).json({ success: false, message: `Groq translate failed (HTTP ${result.status})`, error: errorText });
    }

    const content = result.json?.choices?.[0]?.message?.content;
    res.json({ success: true, data: { text: content ?? '' } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'AI translate failed' });
  }
});

app.post('/api/ai/property-description', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const { apiKey, model, baseUrl } = getGroqConfigOrThrow();
    const propertyId = req.body?.propertyId != null ? String(req.body.propertyId).trim() : '';
    const language = req.body?.language != null ? String(req.body.language).trim() : 'it';
    const style = req.body?.style != null ? String(req.body.style).trim() : 'annuncio';

    let property: any = null;
    if (propertyId) {
      const where: any = { id: propertyId, agencyId: auth.agencyId };
      if (!isAdminRole(auth.role)) where.ownerId = auth.id;

      property = await prisma.property.findFirst({
        where,
        select: {
          id: true,
          reference: true,
          title: true,
          description: true,
          type: true,
          contractType: true,
          address: true,
          city: true,
          province: true,
          zipCode: true,
          rooms: true,
          bedrooms: true,
          bathrooms: true,
          surface: true,
          salePrice: true,
          rentPrice: true,
          energyClass: true
        }
      });
      if (!property) return res.status(404).json({ success: false, message: 'Property not found' });
    } else {
      property = req.body?.property && typeof req.body.property === 'object' ? req.body.property : null;
      if (!property) return res.status(400).json({ success: false, message: 'Missing propertyId or property' });
    }

    const payload = {
      reference: property?.reference ?? null,
      title: property?.title ?? null,
      type: property?.type ?? null,
      contractType: property?.contractType ?? null,
      location: {
        address: property?.address ?? null,
        city: property?.city ?? null,
        province: property?.province ?? null,
        zipCode: property?.zipCode ?? null
      },
      details: {
        rooms: property?.rooms ?? null,
        bedrooms: property?.bedrooms ?? null,
        bathrooms: property?.bathrooms ?? null,
        surface: property?.surface ?? null,
        energyClass: property?.energyClass ?? null
      },
      prices: {
        salePrice: property?.salePrice ?? null,
        rentPrice: property?.rentPrice ?? null
      }
    };

    const result = await groqChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        {
          role: 'system',
          content:
            'Sei un copywriter immobiliare. Genera un testo pronto per pubblicazione. Niente markdown. Niente promesse non verificabili. Niente dati inventati.'
        },
        {
          role: 'user',
          content:
            `Lingua: ${language}\nStile: ${style}\n\nDati immobile (JSON):\n${JSON.stringify(payload)}\n\n` +
            'Scrivi una descrizione (max 1200 caratteri) + 5 punti di forza separati da " - " su una sola riga.'
        }
      ],
      temperature: 0.6
    });

    if (!result.ok) {
      const errorText = truncateText(result.json?.error?.message || result.json?.message || result.text, 2000);
      return res.status(502).json({ success: false, message: `Groq description failed (HTTP ${result.status})`, error: errorText });
    }

    const content = result.json?.choices?.[0]?.message?.content;
    res.json({ success: true, data: { text: content ?? '' } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'AI description failed' });
  }
});

app.post('/api/ai/improve-message', async (req, res) => {
  try {
    const { apiKey, model, baseUrl } = getGroqConfigOrThrow();
    const text = req.body?.text != null ? String(req.body.text) : '';
    const channel = req.body?.channel != null ? String(req.body.channel) : 'email';
    const tone = req.body?.tone != null ? String(req.body.tone) : 'professionale';
    const goal = req.body?.goal != null ? String(req.body.goal) : 'risposta chiara e convincente';
    if (!text.trim()) return res.status(400).json({ success: false, message: 'Missing text' });

    const result = await groqChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        { role: 'system', content: 'Sei un assistente che migliora messaggi commerciali. Rispondi solo con il testo finale.' },
        { role: 'user', content: `Canale: ${channel}\nTono: ${tone}\nObiettivo: ${goal}\n\nTesto:\n${text}` }
      ],
      temperature: 0.5
    });

    if (!result.ok) {
      const errorText = truncateText(result.json?.error?.message || result.json?.message || result.text, 2000);
      return res.status(502).json({ success: false, message: `Groq improve failed (HTTP ${result.status})`, error: errorText });
    }

    const content = result.json?.choices?.[0]?.message?.content;
    res.json({ success: true, data: { text: content ?? '' } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'AI improve failed' });
  }
});

app.get('/api/config/public-base-url', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const agency = await prisma.agency.findUnique({ where: { id: auth.agencyId }, select: { publicBaseUrl: true } });
    const stored = normalizeBaseUrl(agency?.publicBaseUrl);
    const envBaseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL);
    const effective = stored || envBaseUrl || getRequestBaseUrl(req);
    res.json({ success: true, data: { publicBaseUrl: stored, effectiveBaseUrl: effective } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching config' });
  }
});

app.get('/api/onboarding/status', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const status = await evaluateOnboardingStatus(auth.agencyId);
    res.json({ success: true, data: status });
  } catch (error: any) {
    if (error?.message === 'Agency not found') {
      return res.status(404).json({ success: false, message: 'Agency not found' });
    }
    res.status(500).json({ success: false, message: 'Error fetching onboarding status' });
  }
});

app.get('/api/portals', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const agency = await prisma.agency.findUnique({
      where: { id: auth.agencyId },
      select: {
        publicBaseUrl: true,
        apimoProvider: true,
        apimoToken: true,
        apimoAgencyId: true
      }
    });
    const stored = normalizeBaseUrl(agency?.publicBaseUrl);
    const envBaseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL);
    const effectiveBaseUrl = stored || envBaseUrl || getRequestBaseUrl(req);

    const portalConfigs = await prisma.portalConfig.findMany({
      where: { agencyId: auth.agencyId },
      select: { portalId: true, active: true }
    });

    const activationRequests = await prisma.portalActivationRequest.findMany({
      where: {
        agencyId: auth.agencyId,
        status: {
          in: [PortalActivationStatus.OPEN, PortalActivationStatus.IN_PROGRESS]
        }
      },
      select: {
        portalId: true,
        status: true
      }
    });

    const configByPortalId = new Map<string, boolean>();
    for (const config of portalConfigs) {
      configByPortalId.set(config.portalId, config.active);
    }

    const activationStatusByPortalId = new Map<string, PortalActivationStatus>();
    for (const requestRow of activationRequests) {
      const id = requestRow.portalId;
      if (!id) continue;
      if (!activationStatusByPortalId.has(id)) {
        activationStatusByPortalId.set(id, requestRow.status);
      }
    }

    const properties = await prisma.property.findMany({
      where: { agencyId: auth.agencyId },
      select: {
        portalTargets: true,
        isPublished: true,
        salePrice: true,
        rentPrice: true,
        advertisingSalePrice: true,
        advertisingRentPrice: true,
        contractType: true,
        images: true,
        giComuneIstat: true,
        giListingId: true,
        latitude: true,
        longitude: true,
        immoSyncStatus: true,
        immoLastError: true,
        apimoPushStatus: true,
        apimoLastPushError: true
      }
    });

    const portals = PORTAL_REGISTRY.map((portal) => {
      const feedUrl = portal.feedPath ? `${effectiveBaseUrl}${portal.feedPath}` : null;
      const configActive = configByPortalId.has(portal.id) ? configByPortalId.get(portal.id) === true : null;
      const defaultActive = portal.kind === 'MANUAL' ? false : portal.implemented;
      const active = configActive === null ? defaultActive : configActive;
      const activationStatus = activationStatusByPortalId.get(portal.id) ?? null;

      let selectedCount = 0;
      let publishedCount = 0;
      let errorCount = 0;

      for (const property of properties) {
        const targets = Array.isArray(property.portalTargets) ? property.portalTargets : [];
        const isSelected = portal.id === 'ONECLICKANNUNCI'
          ? Boolean(property.isPublished)
          : targets.includes(portal.id);
        if (isSelected) {
          selectedCount += 1;
        }

        const status = getPortalPerPropertyStatus(portal.id, property as any, agency as any);
        if (!status) continue;

        if (portal.kind === 'FEED_PULL') {
          if (status.kind === 'FEED_PULL' && status.status === 'PUBLISHED') {
            publishedCount += 1;
          }
        } else if (portal.id === 'IMMOBILIARE_IT' && portal.kind === 'SYNC_PUSH') {
          if (status.kind === 'SYNC_PUSH') {
            if (status.status === 'SYNCED') {
              publishedCount += 1;
            }
            if (status.status === 'ERROR') {
              errorCount += 1;
            }
          }
        } else if (portal.id === 'APIMO_NET' && portal.kind === 'PROXY') {
          if (status.kind === 'PROXY') {
            if (status.status === 'PULLING') {
              publishedCount += 1;
            }
            if (status.status === 'ERROR') {
              errorCount += 1;
            }
          }
        } else if (portal.kind === 'MANUAL') {
          if (status.kind === 'MANUAL' && status.status === 'SELECTED') {
            publishedCount += 1;
          }
        }
      }

      return {
        ...portal,
        feedUrl,
        active,
        activationStatus,
        selectedCount,
        publishedCount,
        errorCount
      };
    });

    res.json({ success: true, data: { effectiveBaseUrl, portals } });
  } catch {
    res.status(500).json({ success: false, message: 'Error fetching portals' });
  }
});

app.get('/agency/portals', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const secrets = await prisma.globalPortalSecret.findMany();
    const centralizedPortalIds = new Set<string>();
    for (const secret of secrets) {
      if (secret.portalId) {
        centralizedPortalIds.add(secret.portalId);
      }
    }

    if (centralizedPortalIds.size === 0) {
      res.json({
        success: true,
        data: {
          portals: []
        }
      });
      return;
    }

    const registryPortals = PORTAL_REGISTRY.filter((portal) =>
      centralizedPortalIds.has(portal.id)
    );

    const configs = await prisma.portalConfig.findMany({
      where: {
        agencyId: auth.agencyId,
        portalId: { in: Array.from(centralizedPortalIds) }
      },
      select: { portalId: true, type: true, status: true }
    });

    const configByPortalId = new Map<string, { type: PortalConfigType; status: PortalConfigStatus }>();
    for (const config of configs) {
      configByPortalId.set(config.portalId, {
        type: config.type,
        status: config.status
      });
    }

    const items = registryPortals.map((portal) => {
      const config = configByPortalId.get(portal.id);
      const type = config?.type ?? PortalConfigType.CENTRALIZZATO;
      const status = config?.status ?? PortalConfigStatus.INACTIVE;

      return {
        id: portal.id,
        label: portal.label,
        kind: portal.kind,
        modeLabel: portal.modeLabel,
        implemented: portal.implemented,
        type,
        status
      };
    });

    res.json({
      success: true,
      data: {
        portals: items
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error fetching agency portals' });
  }
});

app.put('/api/portals/:portalId/activation', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const portalId = (req.params.portalId || '').toString().trim();
    if (!portalId) return res.status(400).json({ success: false, message: 'Missing portalId' });

    const registryItem = PORTAL_REGISTRY.find((p) => p.id === portalId);
    if (!registryItem) {
      return res.status(404).json({ success: false, message: 'Portal not found' });
    }

    const body = req.body || {};
    if (typeof body.active !== 'boolean') {
      return res.status(400).json({ success: false, message: 'active must be boolean' });
    }

    const agencyId = auth.agencyId;

    await upsertPortalConfig({
      portalId,
      agencyId,
      type: PortalConfigType.PER_AGENZIA,
      status: body.active ? PortalConfigStatus.ACTIVE : PortalConfigStatus.INACTIVE,
      active: body.active
    });

    await writeAuditLog(
      'UPDATE_PORTAL_STATUS',
      'PortalConfig',
      `${portalId}:${agencyId}`,
      auth.id || null,
      req.ip || null,
      null,
      req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null,
      {
        portalId,
        agencyId,
        active: body.active
      }
    );

    res.json({
      success: true,
      data: {
        portalId,
        active: body.active
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error updating portal activation' });
  }
});

app.patch('/agency/portals/:portalId', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const portalId = (req.params.portalId || '').toString().trim();
    if (!portalId) return res.status(400).json({ success: false, message: 'Missing portalId' });

    const registryItem = PORTAL_REGISTRY.find((p) => p.id === portalId);
    if (!registryItem) {
      return res.status(404).json({ success: false, message: 'Portal not found' });
    }

    const secret = await prisma.globalPortalSecret.findUnique({
      where: { portalId }
    });
    if (!secret) {
      return res.status(400).json({
        success: false,
        message: 'Portal is not configured as centralized'
      });
    }

    const body = req.body || {};
    const rawStatus = typeof body.status === 'string' ? body.status.toUpperCase() : '';
    if (rawStatus !== 'ACTIVE' && rawStatus !== 'INACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'status must be ACTIVE or INACTIVE'
      });
    }

    const status = rawStatus === 'ACTIVE' ? PortalConfigStatus.ACTIVE : PortalConfigStatus.INACTIVE;
    const active = status === PortalConfigStatus.ACTIVE;

    const agencyId = auth.agencyId;

    const updated = await upsertPortalConfig({
      portalId,
      agencyId,
      type: PortalConfigType.CENTRALIZZATO,
      status,
      active
    });

    await writeAuditLog(
      'UPDATE_PORTAL_STATUS',
      'PortalConfig',
      `${portalId}:${agencyId}`,
      auth.id || null,
      req.ip || null,
      null,
      req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null,
      {
        portalId,
        agencyId,
        status: updated.status,
        active: updated.active
      }
    );

    res.json({
      success: true,
      data: {
        portalId: updated.portalId,
        type: updated.type,
        status: updated.status,
        active: updated.active
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error updating agency portal status' });
  }
});

app.post('/agency/portals/:portalId/request-activation', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const agencyId = auth.agencyId;
    const portalId = (req.params.portalId || '').toString().trim();
    const notes = req.body && typeof req.body.notes === 'string' ? req.body.notes : undefined;

    if (!portalId) {
      return res.status(400).json({ success: false, message: 'Missing portalId' });
    }

    const registryItem = PORTAL_REGISTRY.find((p) => p.id === portalId);
    if (!registryItem) {
      return res.status(404).json({ success: false, message: 'Portal not found' });
    }

    const centralizedSecret = await prisma.globalPortalSecret.findUnique({
      where: { portalId }
    });
    if (centralizedSecret) {
      return res.status(400).json({
        success: false,
        message: 'Portal is configured as centralized and cannot be activated per agency'
      });
    }

    const existing = await prisma.portalActivationRequest.findFirst({
      where: {
        agencyId,
        portalId,
        status: {
          in: [PortalActivationStatus.OPEN, PortalActivationStatus.IN_PROGRESS]
        }
      }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Esiste giÃ  una richiesta di attivazione aperta per questo portale'
      });
    }

    const agency = await prisma.agency.findUnique({
      where: { id: agencyId },
      select: { id: true }
    });

    if (!agency) {
      return res.status(404).json({ success: false, message: 'Agenzia non trovata' });
    }

    const created = await createPortalActivationRequest({
      agency: {
        connect: {
          id: agencyId
        }
      },
      portalId,
      status: PortalActivationStatus.OPEN,
      notes: notes ?? null
    });

    await upsertPortalConfig({
      portalId,
      agencyId,
      type: PortalConfigType.PER_AGENZIA
    });

    await writeAuditLog(
      'REQUEST_PORTAL_ACTIVATION',
      'PortalActivationRequest',
      created.id,
      auth.id || null,
      req.ip || null,
      null,
      req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null,
      {
        portalId,
        agencyId
      }
    );

    res.status(201).json({
      success: true,
      data: created
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message ? String(error.message) : 'Errore creazione richiesta di attivazione portale'
    });
  }
});

app.post('/agency/support/tickets', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const body = req.body || {};
    const rawType = typeof body.type === 'string' ? body.type : '';
    const rawSubject = typeof body.subject === 'string' ? body.subject : '';
    const rawMessage =
      typeof body.message === 'string'
        ? body.message
        : typeof body.description === 'string'
        ? body.description
        : '';

    const type = rawType.trim();
    const subject = rawSubject.trim();
    const message = rawMessage.trim();

    if (!type || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'type, subject and message are required'
      });
    }

    const agencyId = auth.agencyId;

    const ticket = await createTicket({
      agency: {
        connect: {
          id: agencyId
        }
      },
      type,
      subject,
      createdBy: auth.id
        ? {
            connect: {
              id: auth.id
            }
          }
        : undefined
    });

    await addTicketMessage({
      ticketId: ticket.id,
      senderType: TicketSenderType.AGENCY,
      message
    });

    try {
      await callMasterJson('/internal/tickets', {
        method: 'POST',
        body: {
          agencyId,
          type,
          subject,
          message
        }
      });
    } catch (error: any) {
      console.error('Error calling master ticket API', error?.message || error);
    }

    try {
      await writeAuditLog(
        'TICKET_CREATED',
        'Ticket',
        ticket.id,
        auth.id || null,
        req.ip || null,
        null,
        req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : null,
        {
          agencyId,
          type,
          subject
        }
      );
    } catch (logError) {
      console.error('Audit log error (TICKET_CREATED):', logError);
    }

    const fullTicket = await getTicketById(ticket.id);

    res.status(201).json({
      success: true,
      data: fullTicket
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message ? String(error.message) : 'Error creating support ticket'
    });
  }
});

app.get('/agency/support/tickets', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const tickets = await prisma.ticket.findMany({
      where: {
        agencyId: auth.agencyId
      },
      orderBy: { createdAt: 'desc' },
      include: { messages: true }
    });

    res.json({
      success: true,
      data: tickets
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error fetching support tickets' });
  }
});

app.get('/agency/support/tickets/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const ticketId = (req.params.id || '').toString().trim();
    if (!ticketId) {
      return res.status(400).json({ success: false, message: 'Missing ticket id' });
    }

    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        agencyId: auth.agencyId
      },
      include: { messages: true }
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    res.json({
      success: true,
      data: ticket
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error fetching support ticket' });
  }
});

app.get('/api/portals/:portalId/stats', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const portalId = (req.params.portalId || '').toString().trim();
    if (!portalId) return res.status(400).json({ success: false, message: 'Missing portalId' });

    const registryItem = PORTAL_REGISTRY.find((p) => p.id === portalId);
    if (!registryItem) {
      return res.status(404).json({ success: false, message: 'Portal not found' });
    }

    const agency = await prisma.agency.findUnique({
      where: { id: auth.agencyId },
      select: {
        apimoProvider: true,
        apimoToken: true,
        apimoAgencyId: true
      }
    });

    const properties = await prisma.property.findMany({
      where: {
        agencyId: auth.agencyId
      },
      select: {
        portalTargets: true,
        isPublished: true,
        salePrice: true,
        rentPrice: true,
        advertisingSalePrice: true,
        advertisingRentPrice: true,
        contractType: true,
        images: true,
        giComuneIstat: true,
        giListingId: true,
        latitude: true,
        longitude: true,
        immoSyncStatus: true,
        immoLastError: true,
        apimoPushStatus: true,
        apimoLastPushError: true
      }
    });

    const selectedProperties = portalId === 'ONECLICKANNUNCI'
      ? properties.filter((property) => Boolean(property.isPublished))
      : properties;
    const totalSelected = selectedProperties.length;

    let totalPublished = 0;
    let totalError = 0;
    let totalNotPublishable = 0;

    for (const property of selectedProperties) {
      const status = getPortalPerPropertyStatus(portalId, property as any, agency as any);
      if (!status) continue;

      if (registryItem.kind === 'FEED_PULL') {
        if (status.kind === 'FEED_PULL') {
          if (status.status === 'PUBLISHED') {
            totalPublished += 1;
          }
          if (status.status === 'SELECTED') {
            totalNotPublishable += 1;
          }
        }
      } else if (portalId === 'IMMOBILIARE_IT' && registryItem.kind === 'SYNC_PUSH') {
        if (status.kind === 'SYNC_PUSH') {
          if (status.status === 'SYNCED') {
            totalPublished += 1;
          }
          if (status.status === 'ERROR') {
            totalError += 1;
          }
        }
      } else if (portalId === 'APIMO_NET' && registryItem.kind === 'PROXY') {
        if (status.kind === 'PROXY') {
          if (status.status === 'PULLING') {
            totalPublished += 1;
          }
          if (status.status === 'ERROR') {
            totalError += 1;
          }
        }
      } else if (registryItem.kind === 'MANUAL') {
        if (status.kind === 'MANUAL' && status.status === 'SELECTED') {
          totalPublished += 1;
        }
      }

      if (registryItem.requirements.length > 0) {
        const hasAllRequirements = registryItem.requirements.every((req) =>
          isRequirementSatisfied(req, property as any)
        );
        if (!hasAllRequirements) {
          totalNotPublishable += 1;
        }
      }
    }

    const allRequirements: PortalRequirement[] = ['price', 'image', 'giComuneIstat', 'location', 'giListingId', 'description', 'reference'];
    const requirementsSummary: Record<PortalRequirement, number | null> = {
      price: null,
      image: null,
      giComuneIstat: null,
      location: null,
      giListingId: null,
      description: null,
      reference: null
    };

    if (totalSelected > 0) {
      for (const requirement of allRequirements) {
        if (!registryItem.requirements.includes(requirement)) {
          requirementsSummary[requirement] = null;
          continue;
        }

        let satisfiedCount = 0;
        for (const property of selectedProperties) {
          if (isRequirementSatisfied(requirement, property as any)) {
            satisfiedCount += 1;
          }
        }

        requirementsSummary[requirement] =
          totalSelected > 0 ? satisfiedCount / totalSelected : null;
      }
    }

    res.json({
      success: true,
      data: {
        portalId,
        totalSelected,
        totalPublished,
        totalError,
        totalNotPublishable,
        requirementsSummary
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error fetching portal stats' });
  }
});

app.get('/api/portals/:portalId/logs', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const portalId = (req.params.portalId || '').toString().trim();
    if (!portalId) return res.status(400).json({ success: false, message: 'Missing portalId' });

    const registryItem = PORTAL_REGISTRY.find((p) => p.id === portalId);
    if (!registryItem) {
      return res.status(404).json({ success: false, message: 'Portal not found' });
    }

    const { status, from, to, propertyId, page = 1, limit = 20 } = req.query as any;

    const where: any = {
      portalId
    };

    if (typeof status === 'string' && (status === 'OK' || status === 'ERROR')) {
      where.status = status;
    }

    if (propertyId && typeof propertyId === 'string') {
      where.propertyId = propertyId;
    }

    if (from || to) {
      const createdAt: any = {};
      if (from) {
        const fromDate = new Date(from);
        if (!Number.isNaN(fromDate.getTime())) {
          createdAt.gte = fromDate;
        }
      }
      if (to) {
        const toDate = new Date(to);
        if (!Number.isNaN(toDate.getTime())) {
          createdAt.lte = toDate;
        }
      }
      if (Object.keys(createdAt).length > 0) {
        where.createdAt = createdAt;
      }
    }

    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 20;
    const skip = (pageNumber - 1) * limitNumber;

    const [total, logs] = await Promise.all([
      prisma.portalSyncLog.count({ where }),
      prisma.portalSyncLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNumber,
        include: {
          property: {
            select: {
              id: true,
              title: true,
              reference: true
            }
          }
        }
      })
    ]);

    const data = logs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt,
      portalId: log.portalId,
      operation: log.operation,
      status: log.status,
      message: log.message,
      property: log.property
        ? {
            id: log.property.id,
            title: log.property.title,
            reference: log.property.reference
          }
        : null
    }));

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        pages: Math.ceil(total / limitNumber),
        order: 'createdAt_desc'
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error fetching portal logs' });
  }
});

app.get('/api/portals/:portalId/properties', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const portalId = (req.params.portalId || '').toString().trim();
    if (!portalId) return res.status(400).json({ success: false, message: 'Missing portalId' });

    const registryItem = PORTAL_REGISTRY.find((p) => p.id === portalId);
    if (!registryItem) {
      return res.status(404).json({ success: false, message: 'Portal not found' });
    }

    const { status, agentId, city, contractType, type, page = 1, limit = 10 } = req.query as any;

    const agency = await prisma.agency.findUnique({
      where: { id: auth.agencyId },
      select: {
        apimoProvider: true,
        apimoToken: true,
        apimoAgencyId: true
      }
    });

    const where: any = {
      agencyId: auth.agencyId
    };
    if (portalId === 'ONECLICKANNUNCI') {
      where.isPublished = true;
    } else {
      where.portalTargets = { has: portalId };
    }

    if (agentId) {
      where.ownerId = agentId.toString();
    }

    if (city) {
      where.city = { contains: city.toString(), mode: 'insensitive' };
    }

    if (contractType) {
      where.contractType = contractType;
    }

    if (type) {
      where.type = type;
    }

    const statusFilter = typeof status === 'string' ? status : null;
    const allowedStatusFilters = new Set(['selected', 'published', 'error', 'not_publishable']);
    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 10;

    const select = {
      id: true,
      title: true,
      address: true,
      city: true,
      type: true,
      contractType: true,
      salePrice: true,
      rentPrice: true,
      advertisingSalePrice: true,
      advertisingRentPrice: true,
      portalTargets: true,
      isPublished: true,
      images: true,
      giComuneIstat: true,
      giListingId: true,
      latitude: true,
      longitude: true,
      immoSyncStatus: true,
      immoLastError: true,
      apimoPushStatus: true,
      apimoLastPushError: true,
      ownerId: true,
      owner: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      }
    };

    let properties;
    let total;

    if (statusFilter && allowedStatusFilters.has(statusFilter)) {
      properties = await prisma.property.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select
      });
      total = undefined;
    } else {
      const skip = (pageNumber - 1) * limitNumber;
      const result = await Promise.all([
        prisma.property.count({ where }),
        prisma.property.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          select,
          skip,
          take: limitNumber
        })
      ]);
      total = result[0];
      properties = result[1];
    }

    const mapped = properties.map((property) => {
      const portalStatus = getPortalPerPropertyStatus(portalId, property as any, agency as any);

      const missingRequirements: PortalRequirement[] = [];
      for (const requirement of registryItem.requirements) {
        if (!isRequirementSatisfied(requirement, property as any)) {
          missingRequirements.push(requirement);
        }
      }

      let highLevelStatus: 'selected' | 'published' | 'error' | 'not_publishable' = 'selected';

      if (portalStatus) {
        if (registryItem.kind === 'FEED_PULL' && portalStatus.kind === 'FEED_PULL') {
          if (portalStatus.status === 'PUBLISHED') {
            highLevelStatus = 'published';
          } else if (!portalStatus.requirementsSatisfied || missingRequirements.length > 0) {
            highLevelStatus = 'not_publishable';
          } else {
            highLevelStatus = 'selected';
          }
        } else if (registryItem.id === 'IMMOBILIARE_IT' && registryItem.kind === 'SYNC_PUSH' && portalStatus.kind === 'SYNC_PUSH') {
          if (portalStatus.status === 'ERROR') {
            highLevelStatus = 'error';
          } else if (portalStatus.status === 'SYNCED') {
            highLevelStatus = 'published';
          } else if (missingRequirements.length > 0) {
            highLevelStatus = 'not_publishable';
          } else {
            highLevelStatus = 'selected';
          }
        } else if (registryItem.id === 'APIMO_NET' && registryItem.kind === 'PROXY' && portalStatus.kind === 'PROXY') {
          if (portalStatus.status === 'ERROR') {
            highLevelStatus = 'error';
          } else if (portalStatus.status === 'PULLING') {
            highLevelStatus = 'published';
          } else if (missingRequirements.length > 0) {
            highLevelStatus = 'not_publishable';
          } else {
            highLevelStatus = 'selected';
          }
        } else if (registryItem.kind === 'MANUAL' && portalStatus.kind === 'MANUAL') {
          highLevelStatus = 'published';
        }
      }

      const price =
        getPreferredContractPrice(property);

      let errorDetail: string | null = null;
      if (portalStatus?.kind === 'SYNC_PUSH') {
        errorDetail = portalStatus.lastError;
      } else if (portalStatus?.kind === 'PROXY') {
        errorDetail = portalStatus.lastError;
      }

      return {
        id: property.id,
        title: property.title,
        address: property.address,
        city: property.city,
        type: property.type,
        contractType: property.contractType,
        price,
        agent: property.owner
          ? {
              id: property.owner.id,
              firstName: property.owner.firstName,
              lastName: property.owner.lastName
            }
          : null,
        portal: {
          status: portalStatus,
          highLevelStatus,
          missingRequirements,
          error: errorDetail
        }
      };
    });

    if (statusFilter && allowedStatusFilters.has(statusFilter)) {
      const filtered = mapped.filter((item) => item.portal.highLevelStatus === statusFilter);
      const totalFiltered = filtered.length;
      const start = (pageNumber - 1) * limitNumber;
      const end = start + limitNumber;
      const paginated = filtered.slice(start, end);

      res.json({
        success: true,
        data: paginated,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total: totalFiltered,
          pages: Math.ceil(totalFiltered / limitNumber)
        }
      });
    } else {
      res.json({
        success: true,
        data: mapped,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          pages: Math.ceil((total || 0) / limitNumber)
        }
      });
    }
  } catch {
    res.status(500).json({ success: false, message: 'Error fetching portal properties' });
  }
});

app.get('/api/portals/registry-check', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const registryIds = PORTAL_REGISTRY.map((portal) => portal.id);
    const registryCounts: Record<string, number> = {};

    for (const id of registryIds) {
      registryCounts[id] = (registryCounts[id] || 0) + 1;
    }

    const duplicateRegistryIds = Object.entries(registryCounts)
      .filter(([, count]) => count > 1)
      .map(([id]) => id);

    const rows = await prisma.$queryRaw<{ portalId: string | null }[]>(Prisma.sql`
      SELECT DISTINCT unnest("portalTargets") AS "portalId"
      FROM "properties"
      WHERE array_length("portalTargets", 1) IS NOT NULL
    `);

    const usedPortalIds = Array.from(
      new Set(
        rows
          .map((row) => (row.portalId == null ? '' : String(row.portalId).trim()))
          .filter((id) => Boolean(id))
      )
    );

    const registryIdSet = new Set(registryIds);
    const usedIdSet = new Set(usedPortalIds);

    const missingInRegistry = usedPortalIds.filter((id) => !registryIdSet.has(id));
    const unusedInData = registryIds.filter((id) => !usedIdSet.has(id));

    const invalidRegistryItems = PORTAL_REGISTRY.map((item) => {
      const issues: string[] = [];
      if (!item.id || !item.id.trim()) issues.push('missing-id');
      if (!item.label || !item.label.trim()) issues.push('missing-label');
      if (!item.modeLabel || !item.modeLabel.trim()) issues.push('missing-modeLabel');
      if (item.kind === 'FEED_PULL' && (!item.feedPath || !String(item.feedPath).trim())) {
        issues.push('missing-feedPath-for-feed');
      }
      if (item.kind !== 'FEED_PULL' && item.feedPath && String(item.feedPath).trim()) {
        issues.push('unexpected-feedPath-for-non-feed');
      }
      if (!Array.isArray(item.requirements)) issues.push('invalid-requirements');
      return { id: item.id, issues };
    }).filter((entry) => entry.issues.length > 0);

    res.json({
      success: true,
      data: {
        registrySize: PORTAL_REGISTRY.length,
        usedPortalIds,
        missingInRegistry,
        unusedInData,
        duplicateRegistryIds,
        invalidRegistryItems
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error checking portal registry' });
  }
});

app.put('/api/config/public-base-url', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const nextValue = normalizeBaseUrl(req.body?.publicBaseUrl);
    if (nextValue) {
      const parsed = new URL(nextValue);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).json({ success: false, message: 'Invalid URL protocol' });
      }
    }

    const agency = await prisma.agency.findUnique({ where: { id: auth.agencyId }, select: { id: true } });
    if (!agency?.id) {
      return res.status(404).json({ success: false, message: 'Agency not found' });
    }

    const updated = await prisma.agency.update({
      where: { id: agency.id },
      data: { publicBaseUrl: nextValue }
    });

    res.json({ success: true, data: { publicBaseUrl: normalizeBaseUrl(updated.publicBaseUrl) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating config' });
  }
});

app.put('/api/onboarding/agency', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const body = req.body || {};
    const updateData: Prisma.AgencyUpdateInput = {};

    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      const value = body.name != null ? String(body.name).trim() : '';
      if (!value) {
        return res.status(400).json({ success: false, message: 'Invalid name' });
      }
      updateData.name = value;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
      const raw = body.phone;
      updateData.phone = raw == null || raw === '' ? null : String(raw).trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'address')) {
      const raw = body.address;
      updateData.address = raw == null || raw === '' ? null : String(raw).trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'city')) {
      const raw = body.city;
      updateData.city = raw == null || raw === '' ? null : String(raw).trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'province')) {
      const raw = body.province;
      updateData.province = raw == null || raw === '' ? null : String(raw).trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'zipCode')) {
      const raw = body.zipCode;
      updateData.zipCode = raw == null || raw === '' ? null : String(raw).trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'vatNumber')) {
      const raw = body.vatNumber;
      updateData.vatNumber = raw == null || raw === '' ? null : String(raw).trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'website')) {
      const raw = body.website;
      updateData.website = raw == null || raw === '' ? null : String(raw).trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'logo')) {
      const raw = body.logo;
      updateData.logo = raw == null || raw === '' ? null : String(raw).trim();
    }

    const agency = await prisma.agency.update({
      where: { id: auth.agencyId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        province: true,
        zipCode: true,
        vatNumber: true,
        website: true,
        logo: true,
        onboardingStatus: true
      }
    });

    const checklist = await evaluateOnboardingStatus(auth.agencyId);
    let nextStatus = agency.onboardingStatus || OnboardingStatus.PENDING;
    if (nextStatus !== OnboardingStatus.COMPLETED) {
      nextStatus = OnboardingStatus.IN_PROGRESS;
    }

    await prisma.agency.update({
      where: { id: auth.agencyId },
      data: {
        onboardingStatus: nextStatus,
        onboardingStep: checklist.step
      }
    });

    res.json({
      success: true,
      data: {
        agency,
        onboarding: {
          status: nextStatus,
          step: checklist.step,
          checklist
        }
      }
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Vat number already used', error: 'P2002' });
    }
    res.status(500).json({ success: false, message: 'Error updating agency onboarding data' });
  }
});

app.post('/api/onboarding/users', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const body = req.body || {};
    const usersInput = Array.isArray(body.users) ? body.users : [];
    if (usersInput.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing users payload' });
    }

    const createdUsers = [];

    for (let index = 0; index < usersInput.length; index += 1) {
      const item = usersInput[index] || {};
      const firstName = item.firstName != null ? String(item.firstName).trim() : '';
      const lastName = item.lastName != null ? String(item.lastName).trim() : '';
      const email = item.email != null ? String(item.email).trim().toLowerCase() : '';
      const phone = item.phone != null && item.phone !== '' ? String(item.phone).trim() : null;
      const rawRole = item.role != null ? String(item.role).trim().toUpperCase() : '';

      if (!firstName || !lastName || !email) {
        return res.status(400).json({ success: false, message: 'Invalid user data' });
      }

      let role: any = 'AGENT';
      if (rawRole === 'SUPER_ADMIN' || rawRole === 'AGENCY_ADMIN' || rawRole === 'AGENT' || rawRole === 'COLLABORATOR') {
        role = rawRole;
      } else if (index === 0) {
        role = 'AGENCY_ADMIN';
      }

      const passwordRaw = item.password != null ? String(item.password) : '';
      const password = await bcrypt.hash(passwordRaw || 'password123', 10);

      const user = await prisma.user.create({
        data: {
          firstName,
          lastName,
          email,
          phone: phone || undefined,
          role,
          password,
          agency: {
            connect: { id: auth.agencyId }
          }
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          agencyId: true
        }
      });

      createdUsers.push(user);
    }

    const checklist = await evaluateOnboardingStatus(auth.agencyId);
    const agency = await prisma.agency.findUnique({
      where: { id: auth.agencyId },
      select: { onboardingStatus: true }
    });

    let nextStatus = agency?.onboardingStatus || OnboardingStatus.PENDING;
    if (nextStatus !== OnboardingStatus.COMPLETED) {
      nextStatus = OnboardingStatus.IN_PROGRESS;
    }

    await prisma.agency.update({
      where: { id: auth.agencyId },
      data: {
        onboardingStatus: nextStatus,
        onboardingStep: checklist.step
      }
    });

    res.status(201).json({
      success: true,
      data: {
        users: createdUsers,
        onboarding: {
          status: nextStatus,
          step: checklist.step,
          checklist
        }
      },
      message: 'Users created successfully'
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Email already in use', error: 'P2002' });
    }
    res.status(500).json({ success: false, message: 'Error creating onboarding users' });
  }
});

app.put('/api/onboarding/portals', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const body = req.body || {};

    if (Object.prototype.hasOwnProperty.call(body, 'publicBaseUrl')) {
      const nextValue = normalizeBaseUrl(body.publicBaseUrl);
      if (nextValue) {
        const parsed = new URL(nextValue);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return res.status(400).json({ success: false, message: 'Invalid URL protocol' });
        }
      }

      await prisma.agency.update({
        where: { id: auth.agencyId },
        data: { publicBaseUrl: nextValue }
      });
    }

    const portalsInput = Array.isArray(body.portals) ? body.portals : [];
    for (const item of portalsInput) {
      const portalIdRaw = item?.portalId;
      const activeRaw = item?.active;
      const portalId = portalIdRaw != null ? String(portalIdRaw).trim() : '';
      if (!portalId) continue;
      const active = Boolean(activeRaw);
      const status = active ? PortalConfigStatus.ACTIVE : PortalConfigStatus.INACTIVE;
      await upsertPortalConfig({
        portalId,
        agencyId: auth.agencyId,
        active,
        status,
        type: PortalConfigType.PER_AGENZIA
      });
    }

    const checklist = await evaluateOnboardingStatus(auth.agencyId);
    const agency = await prisma.agency.findUnique({
      where: { id: auth.agencyId },
      select: { onboardingStatus: true }
    });

    let nextStatus = agency?.onboardingStatus || OnboardingStatus.PENDING;
    if (nextStatus !== OnboardingStatus.COMPLETED) {
      nextStatus = OnboardingStatus.IN_PROGRESS;
    }

    await prisma.agency.update({
      where: { id: auth.agencyId },
      data: {
        onboardingStatus: nextStatus,
        onboardingStep: checklist.step
      }
    });

    res.json({
      success: true,
      data: {
        onboarding: {
          status: nextStatus,
          step: checklist.step,
          checklist
        }
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error updating onboarding portals config' });
  }
});

app.post('/api/onboarding/complete', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const checklist = await evaluateOnboardingStatus(auth.agencyId);

    if (!checklist.agencyDataComplete || !checklist.teamComplete || !checklist.configComplete) {
      return res.status(400).json({
        success: false,
        message: 'Onboarding requirements not satisfied',
        data: checklist
      });
    }

    await prisma.agency.update({
      where: { id: auth.agencyId },
      data: {
        onboardingStatus: OnboardingStatus.COMPLETED,
        onboardingStep: 4
      }
    });

    res.json({
      success: true,
      data: {
        status: OnboardingStatus.COMPLETED,
        step: 4
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error completing onboarding' });
  }
});

app.get('/api/config/gestionaleimmobiliare', async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Endpoint legacy dismesso. Usa esclusivamente il feed /feeds/1clickannunci.xml'
  });
});

app.put('/api/config/gestionaleimmobiliare', async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Endpoint legacy dismesso. Usa esclusivamente il feed /feeds/1clickannunci.xml'
  });
});

app.get('/api/config/immobiliareit', async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Endpoint legacy dismesso. Usa esclusivamente il feed /feeds/1clickannunci.xml'
  });
});

app.put('/api/config/immobiliareit', async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Endpoint legacy dismesso. Usa esclusivamente il feed /feeds/1clickannunci.xml'
  });
});

app.get('/api/config/apimo', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const agency = await prisma.agency.findUnique({
      where: { id: auth.agencyId },
      select: { apimoProvider: true, apimoToken: true, apimoAgencyId: true, apimoLastPullTimestamp: true }
    });

    res.json({
      success: true,
      data: {
        apimoProvider: agency?.apimoProvider ?? null,
        apimoAgencyId: agency?.apimoAgencyId ?? null,
        apimoLastPullTimestamp: agency?.apimoLastPullTimestamp ?? null,
        hasToken: Boolean(agency?.apimoToken)
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error fetching config' });
  }
});

app.put('/api/config/apimo', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const rawProvider = req.body?.apimoProvider;
    const rawAgencyId = req.body?.apimoAgencyId;
    const hasTokenKey = Object.prototype.hasOwnProperty.call(req.body || {}, 'apimoToken');
    const rawToken = hasTokenKey ? req.body?.apimoToken : undefined;

    const apimoProvider = rawProvider == null || rawProvider === '' ? null : String(rawProvider).trim();
    const apimoAgencyId = rawAgencyId == null || rawAgencyId === '' ? null : String(rawAgencyId).trim();
    const apimoToken = rawToken == null || rawToken === '' ? null : String(rawToken).trim();

    if (apimoAgencyId && !/^\d+$/.test(apimoAgencyId)) {
      return res.status(400).json({ success: false, message: 'Invalid apimoAgencyId' });
    }

    const agency = await prisma.agency.findUnique({ where: { id: auth.agencyId }, select: { id: true } });
    if (!agency?.id) {
      return res.status(404).json({ success: false, message: 'Agency not found' });
    }

    const updateData: any = { apimoProvider, apimoAgencyId };
    if (hasTokenKey) updateData.apimoToken = apimoToken;

    const updated = await prisma.agency.update({
      where: { id: agency.id },
      data: updateData,
      select: { apimoProvider: true, apimoToken: true, apimoAgencyId: true, apimoLastPullTimestamp: true }
    });

    res.json({
      success: true,
      data: {
        apimoProvider: updated.apimoProvider ?? null,
        apimoAgencyId: updated.apimoAgencyId ?? null,
        apimoLastPullTimestamp: updated.apimoLastPullTimestamp ?? null,
        hasToken: Boolean(updated.apimoToken)
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error updating config' });
  }
});

app.all('/api/apimo/*', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const agency = await prisma.agency.findUnique({
      where: { id: auth.agencyId },
      select: { apimoProvider: true, apimoToken: true }
    });

    const provider = (agency?.apimoProvider || '').trim();
    const token = (agency?.apimoToken || '').trim();
    if (!provider || !token) {
      return res.status(400).json({ success: false, message: 'Missing apimoProvider/apimoToken config' });
    }

    const method = req.method.toUpperCase();
    if (method !== 'GET' && method !== 'POST' && method !== 'PUT' && method !== 'DELETE') {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const basePrefix = '/api/apimo';
    const path = req.path.startsWith(basePrefix) ? req.path.slice(basePrefix.length) : req.path;
    if (!path || !path.startsWith('/')) {
      return res.status(400).json({ success: false, message: 'Invalid APIMO path' });
    }

    if (isExternalPublishDisabled() && method !== 'GET') {
      return res.status(403).json({
        success: false,
        message: 'External publish disabled',
        data: {
          dryRun: true,
          request: {
            method,
            path,
            body: req.body
          }
        }
      });
    }

    const result = await apimoRequest({
      provider,
      token,
      method: method as any,
      path,
      query: coerceApimoQuery(req.query as any),
      body: method === 'GET' ? undefined : req.body
    });

    res.status(result.status).json({
      success: result.ok,
      status: result.status,
      data: result.json ?? result.text
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'APIMO proxy failed' });
  }
});

app.get('/api/sync/apimo/status', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const agency = await prisma.agency.findUnique({
      where: { id: auth.agencyId },
      select: { id: true, apimoProvider: true, apimoToken: true, apimoAgencyId: true, apimoLastPullTimestamp: true }
    });

    if (!agency) {
      return res.status(404).json({ success: false, message: 'Agency not found' });
    }

    const counts = await prisma.apimoRecord.groupBy({
      by: ['entityType'],
      where: { agencyId: agency.id },
      _count: { _all: true }
    });

    res.json({
      success: true,
      data: {
        configured: Boolean(agency.apimoProvider && agency.apimoToken && agency.apimoAgencyId),
        apimoAgencyId: agency.apimoAgencyId ?? null,
        apimoLastPullTimestamp: agency.apimoLastPullTimestamp ?? null,
        records: counts.reduce((acc: any, item: any) => {
          acc[item.entityType] = item._count._all;
          return acc;
        }, {})
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error fetching status' });
  }
});

app.post('/api/sync/apimo/pull', async (req, res) => {
  const pulledAt = new Date();
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const agency = await prisma.agency.findUnique({
      where: { id: auth.agencyId },
      select: { id: true, apimoProvider: true, apimoToken: true, apimoAgencyId: true, apimoLastPullTimestamp: true }
    });

    if (!agency) {
      return res.status(404).json({ success: false, message: 'Agency not found' });
    }

    const provider = (agency.apimoProvider || '').trim();
    const token = (agency.apimoToken || '').trim();
    const apimoAgencyId = (agency.apimoAgencyId || '').trim();
    if (!provider || !token || !apimoAgencyId) {
      return res.status(400).json({ success: false, message: 'Missing apimoProvider/apimoToken/apimoAgencyId config' });
    }

    const full = req.query.full === '1' || req.query.full === 'true';
    const includeProviders = !(req.query.providers === '0' || req.query.providers === 'false');
    const timestamp = full ? null : agency.apimoLastPullTimestamp ?? null;

    const [defaultOwner, agencyRecord] = await Promise.all([
      prisma.user.findFirst({ where: { agencyId: agency.id }, select: { id: true } }),
      prisma.agency.findUnique({ where: { id: agency.id }, select: { id: true } })
    ]);

    if (!defaultOwner || !agencyRecord) {
      return res.status(400).json({ success: false, message: 'Missing local agency/user for sync' });
    }

  const pull = async (entityType: any, path: string, listKey: string) => {
      const { items, newestTimestamp } = await apimoPullList({
        provider,
        token,
        path,
        listKey,
        timestamp: timestamp ?? undefined
      });

      for (const item of items) {
        const apimoIdRaw = item?.id;
        const apimoId = apimoIdRaw == null ? null : String(apimoIdRaw);
        if (!apimoId) continue;
        let localEntityId: string | null = null;
        let localError: string | null = null;

        try {
          const existing = await prisma.apimoRecord.findUnique({
            where: { agencyId_entityType_apimoId: { agencyId: agency.id, entityType, apimoId } },
            select: { localEntityId: true }
          });
          localEntityId = existing?.localEntityId ?? null;

          if (entityType === 'CONTACT' || entityType === 'LEAD') {
            localEntityId = await upsertLocalContactFromApimo({
              agencyId: agency.id,
              defaultAssignedToId: defaultOwner.id,
              apimoId,
              payload: item,
              existingLocalId: localEntityId
            });
          }

          if (entityType === 'REQUEST') {
            localEntityId = await upsertLocalRequestFromApimo({
              agencyId: agency.id,
              defaultAssignedToId: defaultOwner.id,
              apimoId,
              payload: item,
              existingLocalId: localEntityId
            });
          }
        } catch (e: any) {
          localError = e?.message ? String(e.message) : 'Local entity sync failed';
        }

        await upsertApimoRecord({ agencyId: agency.id, entityType, apimoId, payload: item, localEntityId, pulledAt, error: localError });
      }

      return { count: items.length, newestTimestamp, items };
    };

    const resultProperties = await apimoPullList({
      provider,
      token,
      path: `/agencies/${apimoAgencyId}/properties`,
      listKey: 'properties',
      timestamp: timestamp ?? undefined
    });

    let newest = resultProperties.newestTimestamp ?? timestamp ?? null;
    const stats: any = { PROPERTY: resultProperties.items.length };

    for (const property of resultProperties.items) {
      const apimoIdRaw = property?.id;
      const apimoId = apimoIdRaw == null ? null : String(apimoIdRaw);
      if (!apimoId) continue;

      let localEntityId: string | null = null;
      let localError: string | null = null;

      try {
        const reference = property?.reference != null && String(property.reference).trim() ? String(property.reference).trim() : `APIMO-${apimoId}`;
        const title = property?.title != null && String(property.title).trim() ? String(property.title).trim() : reference;

        const address =
          (typeof property?.address === 'string' && property.address.trim()) ||
          (property?.location?.address != null && String(property.location.address).trim()) ||
          null;
        const city =
          (typeof property?.city === 'string' && property.city.trim()) ||
          (property?.city?.name != null && String(property.city.name).trim()) ||
          (typeof property?.location?.city === 'string' && property.location.city.trim()) ||
          (property?.location?.city?.name != null && String(property.location.city.name).trim()) ||
          null;
        const province =
          (typeof property?.province === 'string' && property.province.trim()) ||
          (property?.region?.name != null && String(property.region.name).trim()) ||
          (property?.location?.province != null && String(property.location.province).trim()) ||
          null;
        const zipCode =
          (typeof property?.zipCode === 'string' && property.zipCode.trim()) ||
          (property?.zip_code != null && String(property.zip_code).trim()) ||
          (property?.city?.zipcode != null && String(property.city.zipcode).trim()) ||
          (property?.city?.zip_code != null && String(property.city.zip_code).trim()) ||
          (property?.location?.zip_code != null && String(property.location.zip_code).trim()) ||
          (property?.location?.postal_code != null && String(property.location.postal_code).trim()) ||
          null;

        const canCreateLocal = Boolean(address && city && province && zipCode);

        if (canCreateLocal) {
          const rawType = (property?.type?.name || property?.type || property?.category || '').toString().toLowerCase();
          const type =
            rawType.includes('appart') || rawType.includes('apartment')
              ? 'APARTMENT'
              : rawType.includes('villa')
                ? 'VILLA'
                : rawType.includes('house') || rawType.includes('casa')
                  ? 'HOUSE'
                  : rawType.includes('office') || rawType.includes('ufficio')
                    ? 'OFFICE'
                    : rawType.includes('shop') || rawType.includes('negozio')
                      ? 'SHOP'
                      : rawType.includes('warehouse') || rawType.includes('magazz')
                        ? 'WAREHOUSE'
                        : rawType.includes('land') || rawType.includes('terreno')
                          ? 'LAND'
                          : rawType.includes('garage') || rawType.includes('box')
                            ? 'GARAGE'
                            : 'OTHER';

          const rawContract = (property?.contract?.name || property?.contract || property?.transaction || '').toString().toLowerCase();
          const contractType = rawContract.includes('rent') || rawContract.includes('affitto') ? 'RENT' : 'SALE';

          const salePrice =
            property?.sale_price != null
              ? Number(property.sale_price)
              : property?.price != null && contractType === 'SALE'
                ? Number(property.price)
                : null;
          const rentPrice =
            property?.rent_price != null
              ? Number(property.rent_price)
              : property?.price != null && contractType === 'RENT'
                ? Number(property.price)
                : null;

          const images = Array.isArray(property?.pictures)
            ? property.pictures.map((p: any) => p?.url).filter((u: any) => typeof u === 'string' && u.trim())
            : [];

          const existingByReference = await prisma.property.findUnique({ where: { reference }, select: { id: true } }).catch(() => null);
          if (existingByReference?.id) {
            localEntityId = existingByReference.id;
            await prisma.property.update({
              where: { id: existingByReference.id },
              data: {
                title,
                description: property?.description ? String(property.description) : undefined,
                type: type as any,
                contractType: contractType as any,
                address,
                city,
                province,
                zipCode,
                salePrice: salePrice != null && Number.isFinite(salePrice) ? salePrice : undefined,
                rentPrice: rentPrice != null && Number.isFinite(rentPrice) ? rentPrice : undefined,
                images
              }
            });
          } else {
            const created = await prisma.property.create({
              data: {
                title,
                description: property?.description ? String(property.description) : null,
                type: type as any,
                contractType: contractType as any,
                status: 'AVAILABLE',
                address,
                city,
                province,
                zipCode,
                images,
                reference,
                agencyId: agency.id,
                ownerId: defaultOwner.id
              },
              select: { id: true }
            });
            localEntityId = created.id;
          }
        }
      } catch (e: any) {
        localError = e?.message ? String(e.message) : 'Local property sync failed';
      }

      await upsertApimoRecord({
        agencyId: agency.id,
        entityType: 'PROPERTY',
        apimoId,
        payload: property,
        localEntityId,
        pulledAt,
        error: localError
      });

      if (includeProviders) {
        try {
          const providersResult = await apimoRequest({
            provider,
            token,
            method: 'GET',
            path: `/agencies/${apimoAgencyId}/properties/${apimoId}/providers`
          });
          if (providersResult.ok) {
            await upsertApimoRecord({
              agencyId: agency.id,
              entityType: 'ACTION',
              apimoId: `${apimoId}/providers`,
              payload: providersResult.json ?? providersResult.text,
              pulledAt
            });
          }
        } catch {}
      }
    }

    const pullOther = [
      { entityType: 'AGENCY', path: `/agencies`, listKey: 'agencies' },
      { entityType: 'CONTACT', path: `/agencies/${apimoAgencyId}/contacts`, listKey: 'contacts' },
      { entityType: 'REQUEST', path: `/agencies/${apimoAgencyId}/requests`, listKey: 'requests' },
      { entityType: 'LEAD', path: `/agencies/${apimoAgencyId}/leads`, listKey: 'leads' },
      { entityType: 'RESIDENCE', path: `/agencies/${apimoAgencyId}/residences`, listKey: 'residences' },
      { entityType: 'USER', path: `/agencies/${apimoAgencyId}/users`, listKey: 'users' },
      { entityType: 'CATALOG', path: `/catalogs`, listKey: 'catalogs' }
    ];

    const includeUserActions = req.query.userActions === '1' || req.query.userActions === 'true';

    for (const entry of pullOther) {
      const r = await pull(entry.entityType, entry.path, entry.listKey);
      stats[entry.entityType] = r.count;
      if (r.newestTimestamp != null && (newest == null || r.newestTimestamp > newest)) newest = r.newestTimestamp;

      if (entry.entityType === 'USER' && includeUserActions) {
        for (const userItem of r.items) {
          const apimoUserIdRaw = userItem?.id;
          const apimoUserId = apimoUserIdRaw == null ? null : String(apimoUserIdRaw);
          if (!apimoUserId) continue;
          try {
            const actionsResult = await apimoRequest({
              provider,
              token,
              method: 'GET',
              path: `/agencies/${apimoAgencyId}/users/${apimoUserId}/actions`
            });
            if (actionsResult.ok) {
              await upsertApimoRecord({
                agencyId: agency.id,
                entityType: 'ACTION',
                apimoId: `user/${apimoUserId}/actions`,
                payload: actionsResult.json ?? actionsResult.text,
                pulledAt
              });
            }
          } catch {}
        }
      }
    }

    if (newest != null) {
      await prisma.agency.update({
        where: { id: agency.id },
        data: { apimoLastPullTimestamp: newest }
      });
    }

    await createPortalSyncLog({
      portalId: 'APIMO_NET',
      propertyId: null,
      operation: 'sync_pull',
      status: 'OK',
      message: 'APIMO pull completed',
      payloadSnippet: {
        timestampUsed: timestamp,
        newestTimestamp: newest,
        stats
      }
    });

    res.json({
      success: true,
      data: {
        pulledAt: pulledAt.toISOString(),
        apimoAgencyId,
        timestampUsed: timestamp,
        newestTimestamp: newest,
        stats
      }
    });
  } catch (error: any) {
    const message = error?.message ? String(error.message) : 'APIMO sync failed';
    await createPortalSyncLog({
      portalId: 'APIMO_NET',
      propertyId: null,
      operation: 'sync_pull',
      status: 'ERROR',
      message,
      payloadSnippet: null
    });
    res.status(500).json({ success: false, message });
  }
});

app.post('/api/sync/apimo/properties/:id/push', async (req, res) => {
  const localPropertyId = req.params.id;
  const pushedAt = new Date();
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true' || isExternalPublishDisabled();
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const { provider, token, apimoAgencyId, agencyId } = await getApimoConfigOrThrow(auth.agencyId);
    const property = await prisma.property.findFirst({
      where: { id: localPropertyId, agencyId },
      select: {
        id: true,
        giListingId: true,
        reference: true,
        title: true,
        description: true,
        type: true,
        contractType: true,
        address: true,
        city: true,
        province: true,
        zipCode: true,
        latitude: true,
        longitude: true,
        rooms: true,
        bedrooms: true,
        surface: true,
        salePrice: true,
        rentPrice: true,
        advertisingSalePrice: true,
        advertisingRentPrice: true,
        images: true,
        apimoPropertyId: true
      }
    });

    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    const apimoPropertyIdFromBody =
      req.body?.apimoPropertyId != null && String(req.body.apimoPropertyId).trim() ? String(req.body.apimoPropertyId).trim() : null;
    const existingApimoPropertyId = apimoPropertyIdFromBody || (property.apimoPropertyId || '').trim() || null;

    const basePayload = buildApimoPropertyPayloadFromLocal(property);
    const payload = req.body?.payload && typeof req.body.payload === 'object' ? { ...basePayload, ...req.body.payload } : basePayload;

    const mode = req.query.mode === 'create' || req.query.mode === 'update' ? String(req.query.mode) : null;
    const shouldUpdate = mode === 'update' || (mode == null && Boolean(existingApimoPropertyId));

    if (shouldUpdate && !existingApimoPropertyId) {
      return res.status(400).json({ success: false, message: 'Missing apimoPropertyId for update' });
    }

    const requestMethod = shouldUpdate ? 'PUT' : 'POST';
    const requestPath = shouldUpdate
      ? `/agencies/${apimoAgencyId}/properties/${existingApimoPropertyId}`
      : `/agencies/${apimoAgencyId}/properties`;

    if (dryRun) {
      await createPortalSyncLog({
        portalId: 'APIMO_NET',
        propertyId: property.id,
        operation: 'sync_push_dry_run',
        status: 'OK',
        message: 'APIMO push dry-run',
        payloadSnippet: {
          method: requestMethod,
          path: requestPath,
          body: payload
        }
      });

      return res.json({
        success: true,
        data: {
          dryRun: true,
          pushedAt: pushedAt.toISOString(),
          apimoAgencyId,
          request: {
            method: requestMethod,
            path: requestPath,
            body: payload
          }
        }
      });
    }

    const result = await apimoRequest({
      provider,
      token,
      method: requestMethod,
      path: requestPath,
      body: payload
    });

    if (!result.ok) {
      const errorText = truncateText(result.json?.message || result.text, 2000);
      await prisma.property.update({
        where: { id: property.id },
        data: {
          apimoPushStatus: 'ERROR',
          apimoLastPushAt: pushedAt,
          apimoLastPushError: `HTTP ${result.status}: ${errorText}`
        }
      });
      await createPortalSyncLog({
        portalId: 'APIMO_NET',
        propertyId: property.id,
        operation: 'sync_push',
        status: 'ERROR',
        message: `HTTP ${result.status}: ${errorText}`,
        payloadSnippet: result.json ?? result.text
      });
      return res.status(502).json({ success: false, message: 'APIMO push failed', status: result.status, response: result.json ?? result.text });
    }

    const responseJson = result.json;
    const returnedIdRaw =
      responseJson?.id ??
      responseJson?.property?.id ??
      responseJson?.data?.id ??
      responseJson?.data?.property?.id ??
      null;
    const returnedId = returnedIdRaw != null && String(returnedIdRaw).trim() ? String(returnedIdRaw).trim() : null;
    const finalApimoPropertyId = returnedId || existingApimoPropertyId;

    await prisma.property.update({
      where: { id: property.id },
      data: {
        apimoPropertyId: finalApimoPropertyId ?? undefined,
        apimoPushStatus: 'SYNCED',
        apimoLastPushAt: pushedAt,
        apimoLastPushError: null
      }
    });

    if (finalApimoPropertyId) {
      await prisma.apimoRecord.upsert({
        where: {
          agencyId_entityType_apimoId: { agencyId, entityType: 'PROPERTY', apimoId: finalApimoPropertyId }
        },
        create: {
          agencyId,
          entityType: 'PROPERTY',
          apimoId: finalApimoPropertyId,
          payload: responseJson ?? result.text,
          localEntityId: property.id,
          lastPushedAt: pushedAt,
          lastError: null
        },
        update: {
          payload: responseJson ?? result.text,
          localEntityId: property.id,
          lastPushedAt: pushedAt,
          lastError: null
        }
      });
    }

    await createPortalSyncLog({
      portalId: 'APIMO_NET',
      propertyId: property.id,
      operation: 'sync_push',
      status: 'OK',
      message: 'APIMO push succeeded',
      payloadSnippet: {
        status: result.status,
        response: responseJson ?? result.text
      }
    });

    res.json({
      success: true,
      data: {
        pushedAt: pushedAt.toISOString(),
        apimoAgencyId,
        apimoPropertyId: finalApimoPropertyId,
        status: result.status,
        response: responseJson ?? result.text
      }
    });
  } catch (error: any) {
    const errorMessage = error?.message ? String(error.message) : 'APIMO push failed';
    try {
      await prisma.property.update({
        where: { id: localPropertyId },
        data: {
          apimoPushStatus: 'ERROR',
          apimoLastPushAt: pushedAt,
          apimoLastPushError: truncateText(errorMessage, 2000)
        }
      });
    } catch {}
    await createPortalSyncLog({
      portalId: 'APIMO_NET',
      propertyId: localPropertyId,
      operation: 'sync_push',
      status: 'ERROR',
      message: errorMessage,
      payloadSnippet: null
    });
    res.status(500).json({ success: false, message: errorMessage });
  }
});

app.get('/api/sync/apimo/properties/:id/providers', async (req, res) => {
  const localPropertyId = req.params.id;
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const { provider, token, apimoAgencyId, agencyId } = await getApimoConfigOrThrow(auth.agencyId);
    const property = await prisma.property.findFirst({
      where: { id: localPropertyId, agencyId },
      select: { id: true, apimoPropertyId: true }
    });
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

    const apimoPropertyId = (property.apimoPropertyId || '').trim();
    if (!apimoPropertyId) return res.status(400).json({ success: false, message: 'Missing apimoPropertyId on local property' });

    const result = await apimoRequest({
      provider,
      token,
      method: 'GET',
      path: `/agencies/${apimoAgencyId}/properties/${apimoPropertyId}/providers`
    });

    if (!result.ok) {
      await createPortalSyncLog({
        portalId: 'APIMO_NET',
        propertyId: property.id,
        operation: 'providers_fetch',
        status: 'ERROR',
        message: `HTTP ${result.status}`,
        payloadSnippet: result.json ?? result.text
      });
      return res.status(502).json({ success: false, message: 'APIMO providers fetch failed', status: result.status, response: result.json ?? result.text });
    }

    await prisma.apimoRecord.upsert({
      where: { agencyId_entityType_apimoId: { agencyId, entityType: 'ACTION', apimoId: `${apimoPropertyId}/providers` } },
      create: {
        agencyId,
        entityType: 'ACTION',
        apimoId: `${apimoPropertyId}/providers`,
        payload: result.json ?? result.text,
        localEntityId: property.id,
        lastPulledAt: new Date(),
        lastError: null
      },
      update: {
        payload: result.json ?? result.text,
        localEntityId: property.id,
        lastPulledAt: new Date(),
        lastError: null
      }
    });

    await createPortalSyncLog({
      portalId: 'APIMO_NET',
      propertyId: property.id,
      operation: 'providers_fetch',
      status: 'OK',
      message: 'APIMO providers fetch succeeded',
      payloadSnippet: result.json ?? result.text
    });

    res.json({ success: true, data: result.json ?? result.text });
  } catch (error: any) {
    await createPortalSyncLog({
      portalId: 'APIMO_NET',
      propertyId: localPropertyId,
      operation: 'providers_fetch',
      status: 'ERROR',
      message: error?.message ? String(error.message) : 'APIMO providers fetch failed',
      payloadSnippet: null
    });
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'APIMO providers fetch failed' });
  }
});

app.post('/api/sync/apimo/properties/:id/providers', async (req, res) => {
  const localPropertyId = req.params.id;
  const pushedAt = new Date();
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true' || isExternalPublishDisabled();
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const { provider, token, apimoAgencyId, agencyId } = await getApimoConfigOrThrow(auth.agencyId);
    const property = await prisma.property.findFirst({
      where: { id: localPropertyId, agencyId },
      select: { id: true, apimoPropertyId: true }
    });
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

    const apimoPropertyId = (property.apimoPropertyId || '').trim();
    if (!apimoPropertyId) return res.status(400).json({ success: false, message: 'Missing apimoPropertyId on local property' });

    if (dryRun) {
      await createPortalSyncLog({
        portalId: 'APIMO_NET',
        propertyId: property.id,
        operation: 'providers_grant_dry_run',
        status: 'OK',
        message: 'APIMO providers grant dry-run',
        payloadSnippet: {
          method: 'POST',
          path: `/agencies/${apimoAgencyId}/properties/${apimoPropertyId}/providers`,
          body: req.body
        }
      });

      return res.json({
        success: true,
        data: {
          dryRun: true,
          pushedAt: pushedAt.toISOString(),
          apimoAgencyId,
          apimoPropertyId,
          request: {
            method: 'POST',
            path: `/agencies/${apimoAgencyId}/properties/${apimoPropertyId}/providers`,
            body: req.body
          }
        }
      });
    }

    const result = await apimoRequest({
      provider,
      token,
      method: 'POST',
      path: `/agencies/${apimoAgencyId}/properties/${apimoPropertyId}/providers`,
      body: req.body
    });

    if (!result.ok) {
      await createPortalSyncLog({
        portalId: 'APIMO_NET',
        propertyId: property.id,
        operation: 'providers_grant',
        status: 'ERROR',
        message: `HTTP ${result.status}`,
        payloadSnippet: result.json ?? result.text
      });
      return res.status(502).json({ success: false, message: 'APIMO providers grant failed', status: result.status, response: result.json ?? result.text });
    }

    await prisma.apimoRecord.upsert({
      where: { agencyId_entityType_apimoId: { agencyId, entityType: 'ACTION', apimoId: `${apimoPropertyId}/providers:grant` } },
      create: {
        agencyId,
        entityType: 'ACTION',
        apimoId: `${apimoPropertyId}/providers:grant`,
        payload: result.json ?? result.text,
        localEntityId: property.id,
        lastPushedAt: pushedAt,
        lastError: null
      },
      update: {
        payload: result.json ?? result.text,
        localEntityId: property.id,
        lastPushedAt: pushedAt,
        lastError: null
      }
    });

    await createPortalSyncLog({
      portalId: 'APIMO_NET',
      propertyId: property.id,
      operation: 'providers_grant',
      status: 'OK',
      message: 'APIMO providers grant succeeded',
      payloadSnippet: result.json ?? result.text
    });

    res.json({ success: true, data: result.json ?? result.text });
  } catch (error: any) {
    await createPortalSyncLog({
      portalId: 'APIMO_NET',
      propertyId: localPropertyId,
      operation: 'providers_grant',
      status: 'ERROR',
      message: error?.message ? String(error.message) : 'APIMO providers grant failed',
      payloadSnippet: null
    });
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'APIMO providers grant failed' });
  }
});

app.put('/api/sync/apimo/properties/:id/provider', async (req, res) => {
  const localPropertyId = req.params.id;
  const pushedAt = new Date();
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true' || isExternalPublishDisabled();
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const { provider, token, apimoAgencyId, agencyId } = await getApimoConfigOrThrow(auth.agencyId);
    const property = await prisma.property.findFirst({
      where: { id: localPropertyId, agencyId },
      select: { id: true, apimoPropertyId: true }
    });
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

    const apimoPropertyId = (property.apimoPropertyId || '').trim();
    if (!apimoPropertyId) return res.status(400).json({ success: false, message: 'Missing apimoPropertyId on local property' });

    if (dryRun) {
      await createPortalSyncLog({
        portalId: 'APIMO_NET',
        propertyId: property.id,
        operation: 'provider_update_dry_run',
        status: 'OK',
        message: 'APIMO provider update dry-run',
        payloadSnippet: {
          method: 'PUT',
          path: `/agencies/${apimoAgencyId}/properties/${apimoPropertyId}/provider`,
          body: req.body
        }
      });

      return res.json({
        success: true,
        data: {
          dryRun: true,
          pushedAt: pushedAt.toISOString(),
          apimoAgencyId,
          apimoPropertyId,
          request: {
            method: 'PUT',
            path: `/agencies/${apimoAgencyId}/properties/${apimoPropertyId}/provider`,
            body: req.body
          }
        }
      });
    }

    const result = await apimoRequest({
      provider,
      token,
      method: 'PUT',
      path: `/agencies/${apimoAgencyId}/properties/${apimoPropertyId}/provider`,
      body: req.body
    });

    if (!result.ok) {
      await createPortalSyncLog({
        portalId: 'APIMO_NET',
        propertyId: property.id,
        operation: 'provider_update',
        status: 'ERROR',
        message: `HTTP ${result.status}`,
        payloadSnippet: result.json ?? result.text
      });
      return res.status(502).json({ success: false, message: 'APIMO provider update failed', status: result.status, response: result.json ?? result.text });
    }

    await prisma.apimoRecord.upsert({
      where: { agencyId_entityType_apimoId: { agencyId, entityType: 'ACTION', apimoId: `${apimoPropertyId}/provider:update` } },
      create: {
        agencyId,
        entityType: 'ACTION',
        apimoId: `${apimoPropertyId}/provider:update`,
        payload: result.json ?? result.text,
        localEntityId: property.id,
        lastPushedAt: pushedAt,
        lastError: null
      },
      update: {
        payload: result.json ?? result.text,
        localEntityId: property.id,
        lastPushedAt: pushedAt,
        lastError: null
      }
    });

    await createPortalSyncLog({
      portalId: 'APIMO_NET',
      propertyId: property.id,
      operation: 'provider_update',
      status: 'OK',
      message: 'APIMO provider update succeeded',
      payloadSnippet: result.json ?? result.text
    });

    res.json({ success: true, data: result.json ?? result.text });
  } catch (error: any) {
    await createPortalSyncLog({
      portalId: 'APIMO_NET',
      propertyId: localPropertyId,
      operation: 'provider_update',
      status: 'ERROR',
      message: error?.message ? String(error.message) : 'APIMO provider update failed',
      payloadSnippet: null
    });
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'APIMO provider update failed' });
  }
});

app.put('/api/immobiliareit/properties/:id', async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Sync legacy dismesso. Usa il feed /feeds/1clickannunci.xml'
  });
  const propertyId = req.params.id;
  const auth = getAuth(req);
  if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true' || isExternalPublishDisabled();
  try {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { agency: true }
    });

    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    if (auth.role !== 'SUPER_ADMIN' && auth.agencyId && property.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { xml, uniqueId } = buildImmobiliarePropertyXml(property, property.agency);

    if (dryRun) {
      await createPortalSyncLog({
        portalId: 'IMMOBILIARE_IT',
        propertyId: property.id,
        operation: 'sync_push_dry_run',
        status: 'OK',
        message: 'Immobiliare.it sync dry-run',
        payloadSnippet: {
          xml,
          uniqueId
        }
      });

      return res.json({
        success: true,
        data: {
          dryRun: true,
          uniqueId,
          xml
        }
      });
    }
    const result = await sendImmobiliareXml(property.agency, xml);

    if (!result.ok) {
      const errorText = truncateText(result.text, 2000);
      await prisma.property.update({
        where: { id: propertyId },
        data: {
          immoSyncStatus: 'ERROR',
          immoLastSyncAt: new Date(),
          immoLastError: `HTTP ${result.status}: ${errorText}`
        }
      });
      await createPortalSyncLog({
        portalId: 'IMMOBILIARE_IT',
        propertyId,
        operation: 'sync_push',
        status: 'ERROR',
        message: `HTTP ${result.status}: ${errorText}`,
        payloadSnippet: result.text
      });
      return res.status(502).json({ success: false, message: 'Immobiliare.it sync failed', status: result.status, response: errorText });
    }

    const idListingRaw =
      extractXmlTagValue(result.text, 'idListing') ||
      extractXmlTagValue(result.text, 'id-listing') ||
      extractXmlTagValue(result.text, 'id_listing');

    const parsedIdListing = idListingRaw != null && /^\d+$/.test(idListingRaw) ? Number(idListingRaw) : null;

    await prisma.property.update({
      where: { id: propertyId },
      data: {
        immoSyncStatus: 'SYNCED',
        immoLastSyncAt: new Date(),
        immoLastError: null,
        immoListingId: parsedIdListing ?? undefined
      }
    });

    await createPortalSyncLog({
      portalId: 'IMMOBILIARE_IT',
      propertyId,
      operation: 'sync_push',
      status: 'OK',
      message: 'Immobiliare.it sync succeeded',
      payloadSnippet: {
        status: result.status,
        response: truncateText(result.text, 2000)
      }
    });

    res.json({
      success: true,
      data: {
        uniqueId,
        immoListingId: parsedIdListing,
        status: result.status,
        response: truncateText(result.text, 2000)
      }
    });
  } catch (error: any) {
    const errorMessage = error?.message ? String(error.message) : 'Sync failed';
    try {
      await prisma.property.update({
        where: { id: propertyId },
        data: {
          immoSyncStatus: 'ERROR',
          immoLastSyncAt: new Date(),
          immoLastError: truncateText(errorMessage, 2000)
        }
      });
    } catch {}
    await createPortalSyncLog({
      portalId: 'IMMOBILIARE_IT',
      propertyId,
      operation: 'sync_push',
      status: 'ERROR',
      message: errorMessage,
      payloadSnippet: null
    });
    res.status(500).json({ success: false, message: errorMessage });
  }
});

app.delete('/api/immobiliareit/properties/:id', async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Sync legacy dismesso. Usa il feed /feeds/1clickannunci.xml'
  });
  const propertyId = req.params.id;
  const auth = getAuth(req);
  if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true' || isExternalPublishDisabled();
  try {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { agency: true }
    });

    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    if (auth.role !== 'SUPER_ADMIN' && auth.agencyId && property.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { xml, uniqueId } = buildImmobiliareDeleteXml(property);

    if (dryRun) {
      await createPortalSyncLog({
        portalId: 'IMMOBILIARE_IT',
        propertyId: property.id,
        operation: 'delete_dry_run',
        status: 'OK',
        message: 'Immobiliare.it delete dry-run',
        payloadSnippet: {
          xml,
          uniqueId
        }
      });

      return res.json({
        success: true,
        data: {
          dryRun: true,
          uniqueId,
          xml
        }
      });
    }
    const result = await sendImmobiliareXml(property.agency, xml);

    if (!result.ok) {
      const errorText = truncateText(result.text, 2000);
      await prisma.property.update({
        where: { id: propertyId },
        data: {
          immoSyncStatus: 'ERROR',
          immoLastSyncAt: new Date(),
          immoLastError: `HTTP ${result.status}: ${errorText}`
        }
      });
      await createPortalSyncLog({
        portalId: 'IMMOBILIARE_IT',
        propertyId,
        operation: 'delete',
        status: 'ERROR',
        message: `HTTP ${result.status}: ${errorText}`,
        payloadSnippet: result.text
      });
      return res.status(502).json({ success: false, message: 'Immobiliare.it delete failed', status: result.status, response: errorText });
    }

    await prisma.property.update({
      where: { id: propertyId },
      data: {
        portalTargets: {
          set: Array.isArray(property.portalTargets)
            ? property.portalTargets.filter((t: string) => t !== 'IMMOBILIARE_IT')
            : []
        },
        immoSyncStatus: 'NOT_SYNCED',
        immoLastSyncAt: new Date(),
        immoLastError: null,
        immoListingId: null
      }
    });

    await createPortalSyncLog({
      portalId: 'IMMOBILIARE_IT',
      propertyId,
      operation: 'delete',
      status: 'OK',
      message: 'Immobiliare.it delete succeeded',
      payloadSnippet: {
        status: result.status,
        response: truncateText(result.text, 2000)
      }
    });

    res.json({
      success: true,
      data: { uniqueId, status: result.status, response: truncateText(result.text, 2000) }
    });
  } catch (error: any) {
    const errorMessage = error?.message ? String(error.message) : 'Delete failed';
    try {
      await prisma.property.update({
        where: { id: propertyId },
        data: {
          immoSyncStatus: 'ERROR',
          immoLastSyncAt: new Date(),
          immoLastError: truncateText(errorMessage, 2000)
        }
      });
    } catch {}
    await createPortalSyncLog({
      portalId: 'IMMOBILIARE_IT',
      propertyId,
      operation: 'delete',
      status: 'ERROR',
      message: errorMessage,
      payloadSnippet: null
    });
    res.status(500).json({ success: false, message: errorMessage });
  }
});

// Endpoint root
app.get('/', async (req, res) => {
  try {
    const [properties, contacts, appointments, activities, users] = await Promise.all([
      prisma.property.count(),
      prisma.contact.count(),
      prisma.appointment.count(),
      prisma.activity.count(),
      prisma.user.count()
    ]);

    res.json({
      message: 'CRM Immobiliare API (Database Connected)',
      version: '1.0.0',
      status: 'active',
      endpoints: {
        auth: '/api/auth/login',
        properties: '/api/properties',
        contacts: '/api/contacts',
        appointments: '/api/appointments',
        activities: '/api/activities',
        dashboard: '/api/dashboard/stats',
        matching: '/api/matching/properties/:requestId'
      },
      data: {
        properties,
        contacts,
        appointments,
        activities,
        agents: users
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/feeds/1clickannunci.xml', async (req, res) => {
  try {
    const agencyId = await resolvePublicAgencyId(req);
    const where: any = {
      isPublished: true
    };
    if (agencyId) where.agencyId = agencyId;

    const properties = await prisma.property.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        giListingId: true,
        reference: true,
        title: true,
        description: true,
        type: true,
        contractType: true,
        address: true,
        city: true,
        province: true,
        zipCode: true,
        giComuneIstat: true,
        latitude: true,
        longitude: true,
        rooms: true,
        bedrooms: true,
        bathrooms: true,
        surface: true,
        garden: true,
        terrace: true,
        balcony: true,
        floor: true,
        totalFloors: true,
        elevator: true,
        furnished: true,
        salePrice: true,
        rentPrice: true,
        advertisingSalePrice: true,
        advertisingRentPrice: true,
        expenses: true,
        energyClass: true,
        buildingConstructionYear: true,
        buildingHeatingType: true,
        buildingCondition: true,
        images: true,
        oneClickData: true,
        createdAt: true,
        updatedAt: true
      }
    });

    const xml = buildOneClickFeedXml(properties as any[]);
    res.status(200);
    res.setHeader('Content-Type', 'application/xml; charset=ISO-8859-1');
    res.setHeader('Content-Disposition', 'inline; filename="1clickannunci.xml"');
    res.send(xml);
  } catch (error: any) {
    const message = error?.message ? String(error.message) : 'Error generating 1clickannunci feed';
    await createPortalSyncLog({
      portalId: 'ONECLICKANNUNCI',
      propertyId: null,
      operation: 'feed_generate',
      status: 'ERROR',
      message,
      payloadSnippet: null
    });
    res.status(500).json({ success: false, message });
  }
});

app.get('/api/oneclick/dictionaries', async (_req, res) => {
  res.json({
    success: true,
    data: {
      propertyTypes: ONECLICK_PROPERTY_TYPES,
      announcementTypes: ONECLICK_ANNOUNCEMENT_TYPES,
      portalCodes: ONECLICK_PORTAL_CODES,
      enums: ONECLICK_ENUMS
    }
  });
});

app.get('/feeds/trovit.xml', async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Legacy feed dismesso. Usa /feeds/1clickannunci.xml'
  });
});

app.get('/feeds/meta_catalog.csv', async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Legacy feed dismesso. Usa /feeds/1clickannunci.xml'
  });
});

app.get('/feeds/gestionaleimmobiliare.xml', async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Legacy feed dismesso. Usa /feeds/1clickannunci.xml'
  });
});

app.get('/feeds/gestionale_sync.tar.gz', async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Legacy feed dismesso. Usa /feeds/1clickannunci.xml'
  });
});


app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const auth = getAuth(req);
    const propertyWhere: any = {};
    const contactWhere: any = {};
    const appointmentWhere: any = {};
    const activityWhere: any = {};

    if (auth?.agencyId) {
      propertyWhere.agencyId = auth.agencyId;
      contactWhere.agencyId = auth.agencyId;
      appointmentWhere.agencyId = auth.agencyId;
      activityWhere.agencyId = auth.agencyId;
    }

    if (auth?.role === 'AGENT') {
      propertyWhere.ownerId = auth.id;
      contactWhere.assignedToId = auth.id;
      appointmentWhere.assignedToId = auth.id;
      activityWhere.assignedToId = auth.id;
    }

    const [
      totalProperties,
      availableProperties,
      reservedProperties,
      soldProperties,
      totalContacts,
      activeContacts,
      buyers,
      sellers,
      totalAppointments,
      scheduledAppointments,
      totalActivities,
      pendingActivities,
      completedActivities,
      priceAgg
    ] = await Promise.all([
      prisma.property.count({ where: propertyWhere }),
      prisma.property.count({ where: { ...propertyWhere, status: 'AVAILABLE' } }),
      prisma.property.count({ where: { ...propertyWhere, status: 'RESERVED' } }),
      prisma.property.count({ where: { ...propertyWhere, status: 'SOLD' } }),
      prisma.contact.count({ where: contactWhere }),
      prisma.contact.count({ where: { ...contactWhere, isActive: true } }),
      prisma.contact.count({ where: { ...contactWhere, type: 'BUYER' } }),
      prisma.contact.count({ where: { ...contactWhere, type: 'SELLER' } }),
      prisma.appointment.count({ where: appointmentWhere }),
      prisma.appointment.count({ where: { ...appointmentWhere, status: 'SCHEDULED' } }),
      prisma.activity.count({ where: activityWhere }),
      prisma.activity.count({ where: { ...activityWhere, completed: false } }),
      prisma.activity.count({ where: { ...activityWhere, completed: true } }),
      prisma.property.aggregate({
        _avg: { salePrice: true },
        where: { ...propertyWhere, salePrice: { not: null } }
      })
    ]);

    res.json({
      success: true,
      data: {
        totalProperties,
        availableProperties,
        reservedProperties,
        soldProperties,
        totalContacts,
        activeContacts,
        buyers,
        sellers,
        totalAppointments,
        scheduledAppointments,
        totalActivities,
        pendingActivities,
        completedActivities,
        averagePropertyPrice: priceAgg._avg.salePrice || 0
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ success: false, message: 'Error fetching dashboard stats' });
  }
});

// Agents endpoints
app.get('/api/agents', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { isActive } = req.query;
    const where: any = {};
    
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    if (auth.agencyId && !isAdminRole(auth.role)) {
      where.agencyId = auth.agencyId;
    } else if (auth.agencyId && isAdminRole(auth.role) && auth.role !== 'SUPER_ADMIN') {
      where.agencyId = auth.agencyId;
    }

    // Gli agenti devono poter vedere gli altri utenti della propria agenzia
    // per collaborazioni (es. appuntamenti multi-agente).

    let agents = await prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        agencyId: true
      }
    });

    if (agents.length === 0 && isAdminRole(auth.role)) {
      agents = await prisma.user.findMany({
        where: {
          isActive: true,
          role: {
            in: ['SUPER_ADMIN', 'AGENCY_ADMIN', 'AGENT']
          }
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          agencyId: true
        }
      });
    }

    // Map to frontend expected format if needed
    const mappedAgents = agents.map(agent => ({
      ...agent,
      name: `${agent.firstName} ${agent.lastName}`
    }));

    res.json(mappedAgents);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching agents' });
  }
});

const STREET_PREFIX_REGEX =
  /\b(via|viale|corso|piazza|largo|vicolo|contrada|strada|lungomare|vico|salita|traversa)\s+[a-zÃ -Ã¿0-9'`.\- ]{2,}/gi;

const normalizeStreetName = (value: string): string => {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/g, '')
    .trim()
    .toLowerCase();
};

const sanitizeStreetName = (value: string): string => {
  return value
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*\d{5}\s+[a-zÃ -Ã¿'`.\- ]+$/i, '')
    .replace(/\s+\d{3,5}$/g, '')
    .replace(/[.,;:]+$/g, '')
    .trim();
};

const isLikelyStreetName = (value: string): boolean => {
  const candidate = sanitizeStreetName(value);
  if (!candidate) return false;
  if (!/^(via|viale|corso|piazza|largo|vicolo|contrada|strada|lungomare|vico|salita|traversa)\b/i.test(candidate)) {
    return false;
  }
  if (candidate.length < 6 || candidate.length > 100) return false;
  const lower = candidate.toLowerCase();
  const bannedTokens = [
    'prezzo',
    'immobili',
    'mercato',
    'compra',
    'vendita',
    'pescara',
    'metri',
    'mÂ²',
    'm2',
    'quota',
    'fino a',
    'partire da'
  ];
  if (bannedTokens.some((token) => lower.includes(token))) return false;
  return true;
};

const parseSourceUrls = (raw: string): string[] => {
  return raw
    .split(/[\s,;]+/)
    .map((v) => v.trim())
    .filter((v) => /^https?:\/\//i.test(v));
};

const extractStreetCandidatesFromHtml = (html: string): string[] => {
  const collected = new Set<string>();
  const pushStreet = (candidate: string) => {
    const sanitized = sanitizeStreetName(candidate);
    if (!isLikelyStreetName(sanitized)) return;
    const normalized = normalizeStreetName(sanitized);
    if (!normalized) return;
    collected.add(sanitized);
  };

  const jsonLdMatches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const match of jsonLdMatches) {
    const raw = (match[1] || '').trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const scanNode = (node: any) => {
        if (node == null) return;
        if (typeof node === 'string') {
          if (STREET_PREFIX_REGEX.test(node)) {
            const found = node.match(STREET_PREFIX_REGEX) || [];
            found.forEach(pushStreet);
          }
          STREET_PREFIX_REGEX.lastIndex = 0;
          return;
        }
        if (Array.isArray(node)) {
          node.forEach(scanNode);
          return;
        }
        if (typeof node === 'object') {
          for (const key of Object.keys(node)) {
            scanNode(node[key]);
          }
        }
      };
      scanNode(parsed);
    } catch {
    }
  }

  const streetRegexMatches = html.match(STREET_PREFIX_REGEX) || [];
  streetRegexMatches.forEach(pushStreet);
  STREET_PREFIX_REGEX.lastIndex = 0;

  const quotedStreetMatches = html.matchAll(/"street(?:Name|Address)?"\s*:\s*"([^"]+)"/gi);
  for (const match of quotedStreetMatches) {
    pushStreet(match[1] || '');
  }

  const listItemMatches = html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
  for (const match of listItemMatches) {
    const raw = (match[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    if (STREET_PREFIX_REGEX.test(raw)) {
      const found = raw.match(STREET_PREFIX_REGEX) || [];
      found.forEach(pushStreet);
      STREET_PREFIX_REGEX.lastIndex = 0;
    }
  }

  const paragraphMatches = html.matchAll(/<(?:p|span|div)[^>]*>([\s\S]*?)<\/(?:p|span|div)>/gi);
  for (const match of paragraphMatches) {
    const raw = (match[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw || raw.length > 120) continue;
    if (/^(via|viale|corso|piazza|largo|vicolo|contrada|strada|lungomare|vico|salita|traversa)\b/i.test(raw)) {
      pushStreet(raw);
    }
  }

  return Array.from(collected).sort((a, b) => a.localeCompare(b, 'it'));
};

const regenerateZoneGroups = async (zone: any, requestedGroupSize?: number) => {
  const prismaAny = prisma as any;
  const groupSize = Math.max(1, Math.min(200, Number(requestedGroupSize || zone.groupSize || 20)));
  const streets = await prismaAny.zoneStreet.findMany({
    where: { zoneId: zone.id },
    orderBy: [{ orderIndex: 'asc' }, { name: 'asc' }]
  });

  if (!Array.isArray(streets) || streets.length === 0) {
    throw new Error('No streets mapped for this zone');
  }

  await prismaAny.$transaction(async (tx: any) => {
    await tx.zoneAssignment.updateMany({
      where: { zoneId: zone.id, assignmentType: 'GROUP', isActive: true },
      data: { isActive: false }
    });
    await tx.zoneStreetGroupMember.deleteMany({
      where: { group: { zoneId: zone.id } }
    });
    await tx.zoneStreetGroup.deleteMany({
      where: { zoneId: zone.id }
    });

    for (let offset = 0, groupIndex = 1; offset < streets.length; offset += groupSize, groupIndex += 1) {
      const chunk = streets.slice(offset, offset + groupSize);
      const createdGroup = await tx.zoneStreetGroup.create({
        data: {
          agencyId: zone.agencyId,
          zoneId: zone.id,
          groupIndex,
          name: `Gruppo ${groupIndex}`,
          groupSize
        }
      });

      await tx.zoneStreetGroupMember.createMany({
        data: chunk.map((street: any, idx: number) => ({
          groupId: createdGroup.id,
          streetId: street.id,
          position: idx
        }))
      });
    }

    await tx.agentZone.update({
      where: { id: zone.id },
      data: { groupSize }
    });
  });

  const groups = await prismaAny.zoneStreetGroup.findMany({
    where: { zoneId: zone.id },
    orderBy: { groupIndex: 'asc' },
    include: {
      members: {
        orderBy: { position: 'asc' },
        include: {
          street: { select: { id: true, name: true } }
        }
      }
    }
  });

  return { groupSize, groups };
};

const collectAssignedStreetIdsForGroup = async (groupId: string): Promise<string[]> => {
  const prismaAny = prisma as any;
  const members = await prismaAny.zoneStreetGroupMember.findMany({
    where: { groupId },
    select: { streetId: true }
  });
  return members.map((m: any) => String(m.streetId));
};

const pruneInactiveGroupAssignments = async (
  tx: any,
  zoneId: string,
  groupId: string,
  keepAssignmentId?: string
) => {
  await tx.zoneAssignment.deleteMany({
    where: {
      zoneId,
      groupId,
      assignmentType: 'GROUP',
      isActive: false,
      ...(keepAssignmentId ? { id: { not: keepAssignmentId } } : {})
    }
  });
};

app.get('/api/agent-zones', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { agentId } = req.query;
    const prismaAny = prisma as any;
    const where: any = {};

    if (auth.agencyId && !isAdminRole(auth.role)) {
      where.agencyId = auth.agencyId;

      // Agents must see zones they own OR zones where they have active assignments.
      const assignedRows = await prismaAny.zoneAssignment.findMany({
        where: {
          agentId: auth.id,
          isActive: true
        },
        select: { zoneId: true }
      });
      const assignedZoneIds = Array.from(
        new Set(
          (assignedRows || [])
            .map((row: any) => String(row.zoneId || '').trim())
            .filter(Boolean)
        )
      );

      where.OR = [
        { agentId: auth.id },
        ...(assignedZoneIds.length > 0 ? [{ id: { in: assignedZoneIds } }] : [])
      ];
    } else {
      if (auth.agencyId && auth.role !== 'SUPER_ADMIN') {
        where.agencyId = auth.agencyId;
      }
      if (agentId) {
        where.agentId = String(agentId);
      }
    }

    const zones = await prisma.agentZone.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    const zoneIds = zones.map((z) => z.id);
    const [streetCountRows, groupCountRows, activeAssignments] = await Promise.all([
      prismaAny.zoneStreet.groupBy({
        by: ['zoneId'],
        where: { zoneId: { in: zoneIds } },
        _count: { _all: true }
      }),
      prismaAny.zoneStreetGroup.groupBy({
        by: ['zoneId'],
        where: { zoneId: { in: zoneIds } },
        _count: { _all: true }
      }),
      prismaAny.zoneAssignment.findMany({
        where: {
          zoneId: { in: zoneIds },
          isActive: true
        },
        select: {
          zoneId: true,
          assignmentType: true,
          streetId: true,
          groupId: true
        }
      })
    ]);

    const streetCountMap = new Map<string, number>();
    for (const row of streetCountRows || []) {
      streetCountMap.set(String(row.zoneId), Number(row._count?._all || 0));
    }
    const groupCountMap = new Map<string, number>();
    for (const row of groupCountRows || []) {
      groupCountMap.set(String(row.zoneId), Number(row._count?._all || 0));
    }
    const coveredByZone = new Map<string, Set<string>>();
    for (const assignment of activeAssignments || []) {
      const zoneId = String(assignment.zoneId);
      if (!coveredByZone.has(zoneId)) coveredByZone.set(zoneId, new Set<string>());
      const bucket = coveredByZone.get(zoneId)!;
      if (assignment.assignmentType === 'STREET' && assignment.streetId) {
        bucket.add(String(assignment.streetId));
      } else if (assignment.assignmentType === 'GROUP' && assignment.groupId) {
        const streetIds = await collectAssignedStreetIdsForGroup(String(assignment.groupId));
        streetIds.forEach((id) => bucket.add(id));
      }
    }

    const withStats = zones.map((zone) => {
      const streetCount = streetCountMap.get(zone.id) || 0;
      const groupCount = groupCountMap.get(zone.id) || 0;
      const assignedStreetCount = coveredByZone.get(zone.id)?.size || 0;
      return {
        ...zone,
        streetCount,
        groupCount,
        assignedStreetCount,
        hasStreetMapping: streetCount > 0
      };
    });

    res.json({ success: true, data: withStats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching agent zones' });
  }
});

app.post('/api/agent-zones', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const { agentId, region, province, city, zone, notes, groupSize } = req.body;

    if (!agentId || !region || !province || !city) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    let agencyId = auth.agencyId;
    if (!agencyId) {
      const agent = await prisma.user.findUnique({
        where: { id: agentId },
        select: { agencyId: true }
      });
      agencyId = agent?.agencyId || undefined;
    }

    if (!agencyId) {
      return res.status(400).json({ success: false, message: 'Missing agencyId' });
    }

    const created = await prisma.agentZone.create({
      data: {
        agencyId,
        agentId,
        region,
        province,
        city,
        zone,
        groupSize: Math.max(1, Math.min(200, Number(groupSize || 20))),
        notes
      }
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error creating agent zone' });
  }
});

app.delete('/api/agent-zones/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const zone = await prisma.agentZone.findUnique({
      where: { id: req.params.id },
      select: { id: true, agencyId: true }
    });

    if (!zone) {
      return res.status(404).json({ success: false, message: 'Zone not found' });
    }

    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && zone.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await prisma.agentZone.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting agent zone' });
  }
});

const DYNAMIC_ZONE_GROUP_MARKER = '[DYNAMIC_ZONE_GROUP]';
const DYNAMIC_ZONE_PREFIX = 'DYNAMIC:';

const normalizeDynamicToken = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const buildDynamicZoneLabel = (zoneName: string) => `${DYNAMIC_ZONE_PREFIX}${String(zoneName || '').trim()}`;
const parseDynamicZoneLabel = (zoneValue: string | null | undefined) => {
  const raw = String(zoneValue || '').trim();
  if (!raw) return '';
  return raw.startsWith(DYNAMIC_ZONE_PREFIX) ? raw.slice(DYNAMIC_ZONE_PREFIX.length).trim() : raw;
};

const ensureDynamicZoneAccess = async (auth: any, zoneId: string) => {
  const prismaAny = prisma as any;
  const zone = await prismaAny.agentZone.findUnique({
    where: { id: zoneId },
    select: {
      id: true,
      agencyId: true,
      notes: true,
      city: true,
      province: true,
      region: true,
      zone: true
    }
  });
  if (!zone) return { success: false, status: 404, message: 'Gruppo zona non trovato' };
  if (String(zone.notes || '') !== DYNAMIC_ZONE_GROUP_MARKER) {
    return { success: false, status: 400, message: 'Il gruppo selezionato non è dinamico' };
  }
  if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && String(zone.agencyId) !== String(auth.agencyId)) {
    return { success: false, status: 403, message: 'Forbidden' };
  }
  return { success: true, zone };
};

app.get('/api/agent-zones/dynamic-groups', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const prismaAny = prisma as any;
    const cityFilter = String(req.query.city || '').trim();
    const keyword = String(req.query.q || '').trim().toLowerCase();
    const isAdmin = isAdminRole(auth.role);
    const agencyId = isAdmin
      ? await resolveAgencyIdForAdminAction(auth)
      : String(auth.agencyId || '').trim();
    if (!agencyId) return res.status(400).json({ success: false, message: 'Agency not found' });
    const assignmentWhere = isAdmin
      ? { isActive: true, assignmentType: 'GROUP' as const }
      : { isActive: true, assignmentType: 'GROUP' as const, agentId: auth.id };

    const zones = await prismaAny.agentZone.findMany({
      where: {
        agencyId,
        notes: DYNAMIC_ZONE_GROUP_MARKER,
        ...(cityFilter ? { city: cityFilter } : {}),
        ...(!isAdmin
          ? {
              groups: {
                some: {
                  assignments: {
                    some: assignmentWhere
                  }
                }
              }
            }
          : {})
      },
      include: {
        groups: {
          where: !isAdmin
            ? {
                assignments: {
                  some: assignmentWhere
                }
              }
            : undefined,
          orderBy: { createdAt: 'asc' },
          include: {
            members: {
              orderBy: { position: 'asc' },
              include: {
                street: { select: { id: true, name: true } }
              }
            },
            assignments: {
              where: assignmentWhere,
              include: { agent: { select: { id: true, firstName: true, lastName: true } } },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const mapped = zones
      .flatMap((zone: any) =>
        (zone.groups || []).map((group: any) => ({
          zoneId: String(zone.id),
          groupId: String(group.id),
          city: String(zone.city || ''),
          province: String(zone.province || ''),
          region: String(zone.region || ''),
          zoneName: parseDynamicZoneLabel(zone.zone),
          groupName: String(group.name || ''),
          streets: (group.members || [])
            .map((m: any) => m?.street)
            .filter(Boolean)
            .map((street: any) => ({ id: String(street.id), name: String(street.name) })),
          activeAssignment: group.assignments?.[0]
            ? {
                assignmentId: String(group.assignments[0].id),
                agentId: String(group.assignments[0].agent.id),
                agentName: `${group.assignments[0].agent.firstName} ${group.assignments[0].agent.lastName}`.trim()
              }
            : null
        }))
      )
      .filter((item: any) => {
        if (!keyword) return true;
        const haystack = [
          item.city,
          item.zoneName,
          item.groupName,
          ...(item.streets || []).map((s: any) => s.name)
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(keyword);
      });

    res.json({ success: true, data: mapped });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error loading dynamic groups' });
  }
});

app.get('/api/agent-zones/dynamic-groups/import-template', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const rows = [
      'city,zone_name,group_name,street_name',
      'Pescara,Zona Centro,Gruppo 1,Corso Vittorio Emanuele II',
      'Pescara,Zona Centro,Gruppo 1,Via Nicola Fabrizi',
      'Pescara,Zona Nord,Gruppo A,Viale Bovio'
    ];
    const csv = rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="template-import-zone.csv"');
    res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Errore download template CSV zone' });
  }
});

app.get('/api/agent-zones/dynamic-groups/import-template-example', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const rows = [
      'city,zone_name,group_name,street_name',
      'Pescara,Zona Centro,Gruppo 1,Corso Vittorio Emanuele II',
      'Pescara,Zona Centro,Gruppo 1,Via Nicola Fabrizi',
      'Pescara,Zona Centro,Gruppo 1,Viale Regina Margherita',
      'Pescara,Zona Nord,Gruppo A,Viale Bovio',
      'Pescara,Zona Nord,Gruppo A,Via Nazionale Adriatica Nord',
      'Pescara,Zona Colli,Gruppo B,Via di Sotto',
      'Chieti,Zona Stazione,Gruppo C,Viale Abruzzo',
      'Chieti,Zona Tricalle,Gruppo D,Via dei Frentani'
    ];
    const csv = rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="esempio-import-zone.csv"');
    res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Errore download esempio CSV zone' });
  }
});

app.post('/api/agent-zones/dynamic-groups/import', upload.single('file'), async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const agencyId = await resolveAgencyIdForAdminAction(auth);
    if (!agencyId) return res.status(400).json({ success: false, message: 'Agency not found' });

    const modeRaw = String(req.body?.mode || 'APPEND').trim().toUpperCase();
    const mode: 'APPEND' | 'UPSERT' = modeRaw === 'UPSERT' ? 'UPSERT' : 'APPEND';
    const fileBuffer = req.file?.buffer;
    if (!fileBuffer) return res.status(400).json({ success: false, message: 'File CSV mancante' });

    const raw = fileBuffer.toString('utf8');
    const rows = parseCsvSemicolon(raw);
    if (!rows.length) return res.status(400).json({ success: false, message: 'CSV vuoto o non valido' });
    if (rows.length > 20000) return res.status(400).json({ success: false, message: 'CSV troppo grande: massimo 20.000 righe' });

    const getCell = (row: any, aliases: string[]) => {
      for (const k of aliases) {
        const value = row?.[k];
        if (value !== undefined && String(value).trim() !== '') return String(value).trim();
      }
      return '';
    };

    type ParsedRow = { line: number; city: string; zoneName: string; groupName: string; streetName: string };
    const parsedRows: ParsedRow[] = [];
    const rejectedRows: Array<{ line: number; reason: string; raw: string }> = [];

    rows.forEach((row, idx) => {
      const city = getCell(row, ['city', 'citta']);
      const zoneName = getCell(row, ['zonename', 'zone_name', 'zona', 'nomezona']);
      const groupName = getCell(row, ['groupname', 'group_name', 'gruppo', 'nomegruppo']);
      const streetRaw = getCell(row, ['streetname', 'street_name', 'via', 'nomevia']);
      const streetName = sanitizeStreetName(streetRaw);
      const line = idx + 2;
      if (!city || !zoneName || !groupName || !streetName) {
        rejectedRows.push({ line, reason: 'Campi obbligatori mancanti (city, zone_name, group_name, street_name)', raw: JSON.stringify(row) });
        return;
      }
      parsedRows.push({ line, city, zoneName, groupName, streetName });
    });

    if (!parsedRows.length) {
      return res.status(400).json({
        success: false,
        message: 'Nessuna riga valida trovata nel CSV',
        data: { rejectedRows }
      });
    }

    type GroupBucket = {
      city: string;
      zoneName: string;
      groupName: string;
      cityNorm: string;
      zoneNorm: string;
      groupNorm: string;
      streets: string[];
      streetNormSet: Set<string>;
    };
    const buckets = new Map<string, GroupBucket>();
    for (const row of parsedRows) {
      const cityNorm = normalizeDynamicToken(row.city);
      const zoneNorm = normalizeDynamicToken(row.zoneName);
      const groupNorm = normalizeDynamicToken(row.groupName);
      const streetNorm = normalizeStreetName(row.streetName);
      const key = `${cityNorm}__${zoneNorm}__${groupNorm}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          city: row.city,
          zoneName: row.zoneName,
          groupName: row.groupName,
          cityNorm,
          zoneNorm,
          groupNorm,
          streets: [],
          streetNormSet: new Set<string>()
        });
      }
      const bucket = buckets.get(key)!;
      if (!streetNorm) {
        rejectedRows.push({ line: row.line, reason: 'Nome via non valido', raw: row.streetName });
        continue;
      }
      if (bucket.streetNormSet.has(streetNorm)) continue;
      bucket.streetNormSet.add(streetNorm);
      bucket.streets.push(row.streetName);
    }

    const geoRows = loadGeoLocations();
    const summary = {
      mode,
      totalRows: rows.length,
      validRows: parsedRows.length,
      zoneCreated: 0,
      groupCreated: 0,
      groupUpdated: 0,
      streetsCreated: 0,
      duplicatesIgnored: 0,
      rejectedRows
    };

    const prismaAny = prisma as any;
    await prismaAny.$transaction(async (tx: any) => {
      const existingZones = await tx.agentZone.findMany({
        where: { agencyId, notes: DYNAMIC_ZONE_GROUP_MARKER },
        include: {
          groups: {
            include: {
              members: {
                include: { street: { select: { id: true, name: true, normalizedName: true } } }
              }
            }
          }
        }
      });

      const zoneMap = new Map<string, any>();
      for (const zone of existingZones) {
        const zoneKey = `${normalizeDynamicToken(String(zone.city || ''))}__${normalizeDynamicToken(parseDynamicZoneLabel(zone.zone))}`;
        zoneMap.set(zoneKey, zone);
      }

      const getNextGroupIndex = (zone: any) => {
        const groups = Array.isArray(zone.groups) ? zone.groups : [];
        const maxIndex = groups.reduce((acc: number, g: any) => Math.max(acc, Number(g.groupIndex || 0)), 0);
        return maxIndex + 1;
      };

      for (const bucket of buckets.values()) {
        const zoneKey = `${bucket.cityNorm}__${bucket.zoneNorm}`;
        let zone = zoneMap.get(zoneKey);
        if (!zone) {
          const matchedGeo = geoRows.find((g) => normalizeDynamicToken(g.city) === bucket.cityNorm);
          zone = await tx.agentZone.create({
            data: {
              agencyId,
              agentId: auth.id,
              region: String(matchedGeo?.region || 'N/D'),
              province: String(matchedGeo?.province || 'N/D'),
              city: bucket.city,
              zone: buildDynamicZoneLabel(bucket.zoneName),
              groupSize: 0,
              notes: DYNAMIC_ZONE_GROUP_MARKER,
              importStatus: 'SUCCESS',
              lastImportedAt: new Date()
            },
            include: { groups: { include: { members: { include: { street: true } } } } }
          });
          zoneMap.set(zoneKey, zone);
          summary.zoneCreated += 1;
        }

        let targetGroup: any = null;
        const groups = Array.isArray(zone.groups) ? zone.groups : [];
        if (mode === 'UPSERT') {
          targetGroup = groups.find((g: any) => normalizeDynamicToken(String(g.name || '')) === bucket.groupNorm) || null;
        }
        if (!targetGroup) {
          targetGroup = await tx.zoneStreetGroup.create({
            data: {
              agencyId,
              zoneId: zone.id,
              groupIndex: getNextGroupIndex(zone),
              name: bucket.groupName,
              groupSize: 0
            },
            include: {
              members: { include: { street: { select: { id: true, name: true, normalizedName: true } } } }
            }
          });
          zone.groups = [...groups, targetGroup];
          summary.groupCreated += 1;
        } else {
          summary.groupUpdated += 1;
        }

        const existingStreetNorms = new Set<string>(
          (targetGroup.members || [])
            .map((m: any) => String(m?.street?.normalizedName || '').trim())
            .filter(Boolean)
        );
        let nextPosition = Number(
          (targetGroup.members || []).reduce((acc: number, m: any) => Math.max(acc, Number(m.position || 0)), -1)
        ) + 1;

        for (const streetName of bucket.streets) {
          const normalizedName = normalizeStreetName(streetName);
          if (!normalizedName || existingStreetNorms.has(normalizedName)) {
            summary.duplicatesIgnored += 1;
            continue;
          }

          const street = await tx.zoneStreet.create({
            data: {
              agencyId,
              zoneId: zone.id,
              name: streetName,
              normalizedName,
              orderIndex: nextPosition
            }
          });
          await tx.zoneStreetGroupMember.create({
            data: {
              groupId: targetGroup.id,
              streetId: street.id,
              position: nextPosition
            }
          });
          nextPosition += 1;
          summary.streetsCreated += 1;
          existingStreetNorms.add(normalizedName);
        }

        const refreshedGroupSize = await tx.zoneStreetGroupMember.count({ where: { groupId: targetGroup.id } });
        await tx.zoneStreetGroup.update({
          where: { id: targetGroup.id },
          data: { groupSize: refreshedGroupSize }
        });
      }

      const zoneIds = Array.from(new Set(Array.from(zoneMap.values()).map((z) => String(z.id))));
      for (const zoneId of zoneIds) {
        const totalStreets = await tx.zoneStreet.count({ where: { zoneId } });
        await tx.agentZone.update({
          where: { id: zoneId },
          data: { groupSize: totalStreets, lastImportedAt: new Date() }
        });
      }
    });

    return res.json({
      success: true,
      message: 'Import completato',
      data: summary
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Errore import CSV zone' });
  }
});

app.post('/api/agent-zones/dynamic-groups', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const prismaAny = prisma as any;
    const zoneIdInput = String(req.body?.zoneId || '').trim();
    const city = String(req.body?.city || '').trim();
    const zoneNameInput = String(req.body?.zoneName || '').trim();
    const groupName = String(req.body?.groupName || '').trim();
    const rawStreets = Array.isArray(req.body?.streets) ? req.body.streets : [];
    const agencyId = await resolveAgencyIdForAdminAction(auth);
    if (!agencyId) return res.status(400).json({ success: false, message: 'Agency not found' });
    if (!groupName) {
      return res.status(400).json({ success: false, message: 'groupName è obbligatorio' });
    }

    const dedup = new Map<string, string>();
    for (const raw of rawStreets) {
      const sanitized = sanitizeStreetName(String(raw || ''));
      const normalized = normalizeStreetName(sanitized);
      if (!sanitized || !normalized) continue;
      if (!dedup.has(normalized)) dedup.set(normalized, sanitized);
    }
    const streets = Array.from(dedup.values());
    if (streets.length === 0) {
      return res.status(400).json({ success: false, message: 'Inserisci almeno una via valida' });
    }

    const created = await prismaAny.$transaction(async (tx: any) => {
      let zone: any = null;
      if (zoneIdInput) {
        zone = await tx.agentZone.findUnique({
          where: { id: zoneIdInput },
          select: {
            id: true,
            agencyId: true,
            notes: true,
            city: true,
            province: true,
            region: true,
            zone: true
          }
        });
        if (!zone) throw new Error('DYNAMIC_ZONE_NOT_FOUND');
        if (String(zone.notes || '') !== DYNAMIC_ZONE_GROUP_MARKER) throw new Error('DYNAMIC_ZONE_INVALID');
        if (String(zone.agencyId) !== String(agencyId)) throw new Error('DYNAMIC_ZONE_FORBIDDEN');
      } else {
        if (!city || !zoneNameInput) throw new Error('DYNAMIC_ZONE_MISSING_CREATE_FIELDS');
        const geoRows = loadGeoLocations();
        const cityNorm = normalizeDynamicToken(city);
        const matchedGeo = geoRows.find((row) => normalizeDynamicToken(row.city) === cityNorm);
        const region = String(req.body?.region || matchedGeo?.region || 'N/D').trim();
        const province = String(req.body?.province || matchedGeo?.province || 'N/D').trim();
        zone = await tx.agentZone.create({
          data: {
            agencyId,
            agentId: auth.id,
            region,
            province,
            city,
            zone: buildDynamicZoneLabel(zoneNameInput),
            groupSize: streets.length,
            notes: DYNAMIC_ZONE_GROUP_MARKER,
            importStatus: 'SUCCESS',
            lastImportedAt: new Date()
          }
        });
      }

      const lastGroup = await tx.zoneStreetGroup.findFirst({
        where: { zoneId: zone.id },
        orderBy: { groupIndex: 'desc' },
        select: { groupIndex: true }
      });
      const nextGroupIndex = Number(lastGroup?.groupIndex || 0) + 1;
      const group = await tx.zoneStreetGroup.create({
        data: {
          agencyId,
          zoneId: zone.id,
          groupIndex: nextGroupIndex,
          name: groupName,
          groupSize: streets.length
        }
      });
      const createdStreets = [];
      for (let i = 0; i < streets.length; i++) {
        const name = streets[i];
        const street = await tx.zoneStreet.create({
          data: {
            agencyId,
            zoneId: zone.id,
            name,
            normalizedName: normalizeStreetName(name),
            orderIndex: i
          }
        });
        createdStreets.push(street);
      }
      if (createdStreets.length > 0) {
        await tx.zoneStreetGroupMember.createMany({
          data: createdStreets.map((street: any, idx: number) => ({
            groupId: group.id,
            streetId: street.id,
            position: idx
          }))
        });
      }
      await tx.agentZone.update({
        where: { id: zone.id },
        data: {
          groupSize: await tx.zoneStreet.count({ where: { zoneId: zone.id } }),
          lastImportedAt: new Date()
        }
      });
      return { zone, group, createdStreets };
    });

    res.status(201).json({
      success: true,
      data: {
        zoneId: String(created.zone.id),
        groupId: String(created.group.id),
        city: String(created.zone.city || ''),
        province: String(created.zone.province || ''),
        region: String(created.zone.region || ''),
        zoneName: parseDynamicZoneLabel(created.zone.zone),
        groupName: String(created.group.name || ''),
        streets: created.createdStreets.map((street: any) => ({ id: String(street.id), name: String(street.name) })),
        activeAssignment: null
      }
    });
  } catch (error) {
    const message = String((error as any)?.message || '');
    if (message === 'DYNAMIC_ZONE_NOT_FOUND') return res.status(404).json({ success: false, message: 'Zona dinamica non trovata' });
    if (message === 'DYNAMIC_ZONE_INVALID') return res.status(400).json({ success: false, message: 'La zona selezionata non è dinamica' });
    if (message === 'DYNAMIC_ZONE_FORBIDDEN') return res.status(403).json({ success: false, message: 'Forbidden' });
    if (message === 'DYNAMIC_ZONE_MISSING_CREATE_FIELDS') {
      return res.status(400).json({ success: false, message: 'city e zoneName sono obbligatori se non passi zoneId' });
    }
    res.status(500).json({ success: false, message: 'Error creating dynamic group' });
  }
});

app.delete('/api/agent-zones/dynamic-groups/:groupId', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const prismaAny = prisma as any;
    const groupId = String(req.params.groupId || '').trim();
    if (!groupId) return res.status(400).json({ success: false, message: 'groupId obbligatorio' });

    const group = await prismaAny.zoneStreetGroup.findUnique({
      where: { id: groupId },
      include: {
        zone: { select: { id: true, agencyId: true, notes: true } },
        members: { select: { streetId: true } }
      }
    });
    if (!group || !group.zone) return res.status(404).json({ success: false, message: 'Gruppo non trovato' });
    if (String(group.zone.notes || '') !== DYNAMIC_ZONE_GROUP_MARKER) {
      return res.status(400).json({ success: false, message: 'Il gruppo selezionato non è dinamico' });
    }
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && String(group.zone.agencyId) !== String(auth.agencyId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const streetIds = Array.from(new Set((group.members || []).map((m: any) => String(m.streetId)).filter(Boolean)));
    await prismaAny.$transaction(async (tx: any) => {
      await tx.zoneAssignment.updateMany({
        where: {
          zoneId: String(group.zone.id),
          groupId: String(group.id),
          assignmentType: 'GROUP',
          isActive: true
        },
        data: {
          isActive: false,
          note: 'Assegnazione chiusa automaticamente: gruppo dinamico eliminato'
        }
      });

      if (streetIds.length > 0) {
        await tx.zoneStreet.deleteMany({
          where: {
            zoneId: String(group.zone.id),
            id: { in: streetIds }
          }
        });
      }

      await tx.zoneStreetGroup.delete({
        where: { id: String(group.id) }
      });

      const remainingGroups = await tx.zoneStreetGroup.count({
        where: { zoneId: String(group.zone.id) }
      });
      if (remainingGroups === 0) {
        await tx.agentZone.delete({
          where: { id: String(group.zone.id) }
        });
      }
    });

    res.json({ success: true, message: 'Gruppo eliminato con successo' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting dynamic group' });
  }
});

app.get('/api/agent-zones/dynamic-groups/:groupId/workspace', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const prismaAny = prisma as any;
    const groupId = String(req.params.groupId || '').trim();
    if (!groupId) return res.status(400).json({ success: false, message: 'groupId obbligatorio' });

    const group = await prismaAny.zoneStreetGroup.findUnique({
      where: { id: groupId },
      include: {
        zone: { select: { id: true, agencyId: true, city: true, province: true, region: true, zone: true, notes: true } },
        members: {
          orderBy: { position: 'asc' },
          include: { street: { select: { id: true, name: true } } }
        },
        assignments: {
          where: { isActive: true, assignmentType: 'GROUP' },
          include: { agent: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });
    if (!group || !group.zone) return res.status(404).json({ success: false, message: 'Gruppo non trovato' });
    if (String(group.zone.notes || '') !== DYNAMIC_ZONE_GROUP_MARKER) {
      return res.status(400).json({ success: false, message: 'Gruppo non dinamico' });
    }
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && String(group.zone.agencyId) !== String(auth.agencyId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const logs = await prismaAny.zoneGroupWorkLog.findMany({
      where: { zoneId: group.zone.id, groupId: group.id },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });
    const assignmentHistory = await prismaAny.zoneAssignment.findMany({
      where: { zoneId: group.zone.id, groupId: group.id, assignmentType: 'GROUP' },
      orderBy: { createdAt: 'asc' },
      include: { agent: { select: { id: true, firstName: true, lastName: true, email: true } } }
    });

    res.json({
      success: true,
      data: {
        zoneId: String(group.zone.id),
        groupId: String(group.id),
        groupName: String(group.name || ''),
        groupIndex: Number(group.groupIndex || 1),
        city: String(group.zone.city || ''),
        province: String(group.zone.province || ''),
        region: String(group.zone.region || ''),
        zoneName: parseDynamicZoneLabel(group.zone.zone),
        canWrite: isAdminRole(auth.role),
        streets: (group.members || []).map((m: any) => ({ id: String(m.street.id), name: String(m.street.name) })),
        activeAssignment: group.assignments?.[0]
          ? {
              assignmentId: String(group.assignments[0].id),
              agentId: String(group.assignments[0].agent.id),
              agentName: `${group.assignments[0].agent.firstName} ${group.assignments[0].agent.lastName}`.trim()
            }
          : null,
        assignmentHistory: assignmentHistory.map((a: any) => ({
          id: String(a.id),
          isActive: Boolean(a.isActive),
          note: a.note || null,
          assignedAt: a.createdAt,
          endedAt: a.isActive ? null : a.updatedAt,
          agent: a.agent
        })),
        logs: logs.map((log: any) => ({
          id: String(log.id),
          entryType: String(log.entryType),
          title: log.title || null,
          content: String(log.content || ''),
          metadata: log.metadata || null,
          createdAt: log.createdAt,
          createdBy: log.createdBy
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error loading dynamic group workspace' });
  }
});

app.post('/api/agent-zones/dynamic-groups/:groupId/logs', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const prismaAny = prisma as any;
    const groupId = String(req.params.groupId || '').trim();
    if (!groupId) return res.status(400).json({ success: false, message: 'groupId obbligatorio' });

    const group = await prismaAny.zoneStreetGroup.findUnique({
      where: { id: groupId },
      include: { zone: { select: { id: true, agencyId: true, notes: true } } }
    });
    if (!group || !group.zone) return res.status(404).json({ success: false, message: 'Gruppo non trovato' });
    if (String(group.zone.notes || '') !== DYNAMIC_ZONE_GROUP_MARKER) {
      return res.status(400).json({ success: false, message: 'Gruppo non dinamico' });
    }
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && String(group.zone.agencyId) !== String(auth.agencyId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    let canWrite = isAdminRole(auth.role);
    if (!canWrite) {
      const activeAssignment = await prismaAny.zoneAssignment.findFirst({
        where: {
          zoneId: group.zone.id,
          groupId: group.id,
          assignmentType: 'GROUP',
          agentId: auth.id,
          isActive: true
        },
        select: { id: true }
      });
      canWrite = Boolean(activeAssignment);
    }
    if (!canWrite) return res.status(403).json({ success: false, message: 'Forbidden' });

    const entryTypeRaw = String(req.body?.entryType || 'NOTE').trim().toUpperCase();
    const validTypes = ['NOTE', 'STATUS', 'STATISTICS', 'HANDOVER'];
    const entryType = validTypes.includes(entryTypeRaw) ? entryTypeRaw : 'NOTE';
    const title = req.body?.title != null ? String(req.body.title).trim() : '';
    const content = String(req.body?.content || '').trim();
    if (!content) return res.status(400).json({ success: false, message: 'Contenuto obbligatorio' });

    const created = await prismaAny.zoneGroupWorkLog.create({
      data: {
        agencyId: String(group.zone.agencyId),
        zoneId: String(group.zone.id),
        groupId: String(group.id),
        createdById: String(auth.id),
        entryType,
        title: title || null,
        content,
        metadata: req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : null
      }
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error saving dynamic group log' });
  }
});

app.post('/api/agent-zones/dynamic-groups/streets/:streetId/move', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const prismaAny = prisma as any;
    const streetId = String(req.params.streetId || '').trim();
    const targetGroupId = String(req.body?.targetGroupId || '').trim();
    if (!streetId || !targetGroupId) {
      return res.status(400).json({ success: false, message: 'streetId e targetGroupId sono obbligatori' });
    }

    const sourceMember = await prismaAny.zoneStreetGroupMember.findFirst({
      where: { streetId },
      include: { group: { select: { id: true, zoneId: true } }, street: { select: { id: true, name: true } } }
    });
    if (!sourceMember || !sourceMember.group) return res.status(404).json({ success: false, message: 'Via non trovata in alcun gruppo' });
    const targetGroup = await prismaAny.zoneStreetGroup.findUnique({
      where: { id: targetGroupId },
      include: { zone: { select: { id: true, agencyId: true, notes: true } } }
    });
    if (!targetGroup || !targetGroup.zone) return res.status(404).json({ success: false, message: 'Gruppo destinazione non trovato' });
    if (String(targetGroup.zone.notes || '') !== DYNAMIC_ZONE_GROUP_MARKER) {
      return res.status(400).json({ success: false, message: 'Il gruppo destinazione non è dinamico' });
    }
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && String(targetGroup.zone.agencyId) !== String(auth.agencyId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (String(sourceMember.group.zoneId) !== String(targetGroup.zoneId)) {
      return res.status(400).json({ success: false, message: 'Puoi spostare la via solo tra gruppi della stessa zona' });
    }
    if (String(sourceMember.group.id) === String(targetGroup.id)) {
      return res.status(400).json({ success: false, message: 'La via è già in questo gruppo' });
    }

    await prismaAny.$transaction(async (tx: any) => {
      await tx.zoneStreetGroupMember.delete({
        where: { id: sourceMember.id }
      });
      const lastTarget = await tx.zoneStreetGroupMember.findFirst({
        where: { groupId: targetGroup.id },
        orderBy: { position: 'desc' },
        select: { position: true }
      });
      await tx.zoneStreetGroupMember.create({
        data: {
          groupId: targetGroup.id,
          streetId,
          position: Number(lastTarget?.position || -1) + 1
        }
      });
    });

    res.json({ success: true, message: 'Via spostata con successo' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error moving street' });
  }
});

app.put('/api/agent-zones/dynamic-groups/streets/:streetId', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const prismaAny = prisma as any;
    const streetId = String(req.params.streetId || '').trim();
    const name = sanitizeStreetName(String(req.body?.name || ''));
    if (!streetId || !name) return res.status(400).json({ success: false, message: 'streetId e nome via sono obbligatori' });
    const normalizedName = normalizeStreetName(name);
    if (!normalizedName) return res.status(400).json({ success: false, message: 'Nome via non valido' });

    const street = await prismaAny.zoneStreet.findUnique({
      where: { id: streetId },
      include: { zone: { select: { id: true, agencyId: true, notes: true } } }
    });
    if (!street || !street.zone) return res.status(404).json({ success: false, message: 'Via non trovata' });
    if (String(street.zone.notes || '') !== DYNAMIC_ZONE_GROUP_MARKER) {
      return res.status(400).json({ success: false, message: 'La via non appartiene a un gruppo dinamico' });
    }
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && String(street.zone.agencyId) !== String(auth.agencyId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const duplicate = await prismaAny.zoneStreet.findFirst({
      where: {
        zoneId: street.zoneId,
        normalizedName,
        id: { not: streetId }
      },
      select: { id: true }
    });
    if (duplicate) return res.status(400).json({ success: false, message: 'Esiste già una via con questo nome nel gruppo/zona' });

    const updated = await prismaAny.zoneStreet.update({
      where: { id: streetId },
      data: { name, normalizedName }
    });
    res.json({ success: true, data: { id: String(updated.id), name: String(updated.name) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating street' });
  }
});

app.delete('/api/agent-zones/dynamic-groups/streets/:streetId', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const prismaAny = prisma as any;
    const streetId = String(req.params.streetId || '').trim();
    if (!streetId) return res.status(400).json({ success: false, message: 'streetId obbligatorio' });

    const street = await prismaAny.zoneStreet.findUnique({
      where: { id: streetId },
      include: { zone: { select: { id: true, agencyId: true, notes: true } } }
    });
    if (!street || !street.zone) return res.status(404).json({ success: false, message: 'Via non trovata' });
    if (String(street.zone.notes || '') !== DYNAMIC_ZONE_GROUP_MARKER) {
      return res.status(400).json({ success: false, message: 'La via non appartiene a un gruppo dinamico' });
    }
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && String(street.zone.agencyId) !== String(auth.agencyId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await prismaAny.zoneStreet.delete({ where: { id: streetId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting street' });
  }
});

app.get('/api/agent-zones/:zoneId/details', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const prismaAny = prisma as any;
    const { zoneId } = req.params;
    const zone = await prismaAny.agentZone.findUnique({
      where: { id: zoneId },
      include: {
        agent: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });

    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && zone.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (!isAdminRole(auth.role) && zone.agentId !== auth.id) {
      // Agents can access zone details when they have at least one active assignment in the zone.
      const hasAssignment = await prismaAny.zoneAssignment.findFirst({
        where: {
          zoneId,
          agentId: auth.id,
          isActive: true
        },
        select: { id: true }
      });
      if (!hasAssignment) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    const [groups, assignments, recentImports] = await Promise.all([
      prismaAny.zoneStreetGroup.findMany({
        where: { zoneId },
        orderBy: { groupIndex: 'asc' },
        include: {
          members: {
            orderBy: { position: 'asc' },
            include: {
              street: {
                select: { id: true, name: true }
              }
            }
          }
        }
      }),
      prismaAny.zoneAssignment.findMany({
        where: {
          zoneId,
          isActive: true,
          ...(isAdminRole(auth.role) ? {} : { agentId: auth.id })
        },
        orderBy: { createdAt: 'desc' },
        include: {
          agent: { select: { id: true, firstName: true, lastName: true, email: true } },
          group: { select: { id: true, name: true, groupIndex: true } },
          street: { select: { id: true, name: true } }
        }
      }),
      prismaAny.zoneImportJob.findMany({
        where: { zoneId },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ]);

    const streets = await prismaAny.zoneStreet.findMany({
      where: { zoneId },
      orderBy: [{ orderIndex: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, normalizedName: true }
    });

    res.json({
      success: true,
      data: {
        ...zone,
        streets,
        groups,
        assignments,
        importJobs: recentImports
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching zone details' });
  }
});

app.post('/api/agent-zones/:zoneId/streets/import', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const prismaAny = prisma as any;
    const { zoneId } = req.params;
    const sourceUrlRaw = req.body?.sourceUrl != null ? String(req.body.sourceUrl).trim() : '';
    const sourceUrlsRaw = Array.isArray(req.body?.sourceUrls)
      ? req.body.sourceUrls.map((item: any) => String(item).trim()).filter(Boolean)
      : [];
    const streetsTextRaw = req.body?.streetsText != null ? String(req.body.streetsText) : '';

    if (!sourceUrlRaw && sourceUrlsRaw.length === 0 && !streetsTextRaw.trim()) {
      return res.status(400).json({ success: false, message: 'sourceUrl or streetsText is required' });
    }

    const candidateRawUrls = [
      ...sourceUrlsRaw,
      ...parseSourceUrls(sourceUrlRaw)
    ];
    const uniqueRawUrls = Array.from(new Set(candidateRawUrls));
    const parsedUrls: URL[] = [];
    for (const rawUrl of uniqueRawUrls) {
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return res.status(400).json({ success: false, message: `Invalid URL: ${rawUrl}` });
      }
      if (!parsed.hostname.endsWith('realadvisor.it')) {
        return res.status(400).json({ success: false, message: `URL must belong to realadvisor.it: ${rawUrl}` });
      }
      parsedUrls.push(parsed);
    }

    const zone = await prismaAny.agentZone.findUnique({ where: { id: zoneId } });
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && zone.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const importJob = await prismaAny.zoneImportJob.create({
      data: {
        agencyId: zone.agencyId,
        zoneId: zone.id,
        sourceUrl: parsedUrls.length > 0 ? parsedUrls.map((u) => u.toString()).join('\n') : 'manual://streets-text',
        status: 'RUNNING'
      }
    });

    try {
      let streets: string[] = [];
      if (streetsTextRaw.trim()) {
        streets = streetsTextRaw
          .split(/[\n,;]+/)
          .map((item: string) => sanitizeStreetName(item))
          .filter((item: string) => isLikelyStreetName(item));
      } else if (parsedUrls.length > 0) {
        const streetsSet = new Set<string>();
        for (const parsedUrl of parsedUrls) {
          const response = await fetch(parsedUrl.toString(), {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; CosmoCasaBot/1.0; +https://cosmocasa.example)'
            }
          });
          if (!response.ok) {
            throw new Error(`Failed to fetch URL (${response.status})`);
          }
          const html = await response.text();
          const extracted = extractStreetCandidatesFromHtml(html);
          extracted.forEach((street) => streetsSet.add(street));
        }
        streets = Array.from(streetsSet);
      }

      const dedupByNormalized = new Map<string, string>();
      for (const street of streets) {
        const sanitized = sanitizeStreetName(street);
        if (!isLikelyStreetName(sanitized)) continue;
        const normalized = normalizeStreetName(sanitized);
        if (!normalized) continue;
        if (!dedupByNormalized.has(normalized)) {
          dedupByNormalized.set(normalized, sanitized);
        }
      }
      streets = Array.from(dedupByNormalized.values()).sort((a, b) => a.localeCompare(b, 'it'));

      if (streets.length === 0) {
        throw new Error('No streets found. Provide streetsText or a page containing street names.');
      }

      await prismaAny.$transaction(async (tx: any) => {
        await tx.zoneStreetGroupMember.deleteMany({
          where: { group: { zoneId: zone.id } }
        });
        await tx.zoneStreetGroup.deleteMany({ where: { zoneId: zone.id } });
        await tx.zoneAssignment.updateMany({
          where: { zoneId: zone.id, isActive: true },
          data: { isActive: false }
        });
        await tx.zoneStreet.deleteMany({ where: { zoneId: zone.id } });
        await tx.zoneStreet.createMany({
          data: streets.map((name, index) => ({
            agencyId: zone.agencyId,
            zoneId: zone.id,
            name,
            normalizedName: normalizeStreetName(name),
            orderIndex: index
          })),
          skipDuplicates: true
        });
        await tx.agentZone.update({
          where: { id: zone.id },
          data: {
            sourceUrl: parsedUrls.length > 0 ? parsedUrls.map((u) => u.toString()).join('\n') : null,
            importStatus: 'SUCCESS',
            lastImportedAt: new Date()
          }
        });
      });

      const grouping = await regenerateZoneGroups(zone, zone.groupSize || 20);
      await prismaAny.zoneImportJob.update({
        where: { id: importJob.id },
        data: {
          status: 'SUCCESS',
          importedCount: streets.length,
          completedAt: new Date()
        }
      });

      return res.json({
        success: true,
        message: `Import completed: ${streets.length} streets`,
        data: {
          importedCount: streets.length,
          groupSize: grouping.groupSize,
          groupCount: grouping.groups.length
        }
      });
    } catch (error: any) {
      await prismaAny.zoneImportJob.update({
        where: { id: importJob.id },
        data: {
          status: 'FAILED',
          errorMessage: String(error?.message || error),
          completedAt: new Date()
        }
      });
      await prismaAny.agentZone.update({
        where: { id: zone.id },
        data: { importStatus: 'FAILED' }
      });
      return res.status(400).json({
        success: false,
        message: String(error?.message || 'Street import failed')
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error importing streets' });
  }
});

app.post('/api/agent-zones/:zoneId/import-cap-streets', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const prismaAny = prisma as any;
    const { zoneId } = req.params;
    const cap = req.body?.cap != null ? String(req.body.cap).trim() : '';
    const groupSizeInput = Number(req.body?.groupSize || 0);
    if (!cap) return res.status(400).json({ success: false, message: 'cap is required' });

    const zone = await prismaAny.agentZone.findUnique({ where: { id: zoneId } });
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && zone.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const items = loadPescaraCapCatalog();
    const capItem = items.find((it: any) => String(it?.cap || '').trim() === cap);
    if (!capItem || !Array.isArray(capItem.streets) || capItem.streets.length === 0) {
      return res.status(404).json({ success: false, message: 'CAP not found in catalog or no streets available' });
    }

    const streets = Array.from(
      new Set(
        capItem.streets
          .map((s: any) => sanitizeStreetName(String(s || '')))
          .filter((s: string) => s.length > 2)
      )
    ).sort((a: string, b: string) => a.localeCompare(b, 'it'));

    const effectiveGroupSize = Number.isFinite(groupSizeInput) && groupSizeInput > 0
      ? Math.max(1, Math.min(200, groupSizeInput))
      : Math.max(1, Math.min(200, Number(capItem.groupSizeSuggested || zone.groupSize || 20)));

    await prismaAny.$transaction(async (tx: any) => {
      await tx.zoneStreetGroupMember.deleteMany({ where: { group: { zoneId: zone.id } } });
      await tx.zoneStreetGroup.deleteMany({ where: { zoneId: zone.id } });
      await tx.zoneAssignment.updateMany({
        where: { zoneId: zone.id, isActive: true },
        data: { isActive: false }
      });
      await tx.zoneStreet.deleteMany({ where: { zoneId: zone.id } });
      await tx.zoneStreet.createMany({
        data: streets.map((name: string, index: number) => ({
          agencyId: zone.agencyId,
          zoneId: zone.id,
          name,
          normalizedName: normalizeStreetName(name),
          orderIndex: index
        }))
      });
      await tx.agentZone.update({
        where: { id: zone.id },
        data: {
          sourceUrl: String(capItem.sourceUrl || ''),
          importStatus: 'SUCCESS',
          lastImportedAt: new Date(),
          groupSize: effectiveGroupSize
        }
      });
      await tx.zoneImportJob.create({
        data: {
          agencyId: zone.agencyId,
          zoneId: zone.id,
          sourceUrl: `cap://${cap}`,
          status: 'SUCCESS',
          importedCount: streets.length,
          completedAt: new Date()
        }
      });
    });

    const grouping = await regenerateZoneGroups({ ...zone, groupSize: effectiveGroupSize }, effectiveGroupSize);
    res.json({
      success: true,
      data: {
        cap,
        importedCount: streets.length,
        groupSize: grouping.groupSize,
        groupCount: grouping.groups.length,
        avgEurM2: capItem.avgEurM2 || null,
        title: capItem.title || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error importing CAP streets' });
  }
});

// Legacy mapping: zone identity currently derived from CAP label.
// Keep this indirection so we can swap to perimeter-based identity later.
const zoneLabelFromCap = (cap: string) => buildLegacyCapZoneLabel(cap);

const resolveAgencyIdForAdminAction = async (auth: any, fallbackAgentId?: string) => {
  if (auth?.agencyId) return auth.agencyId;
  if (fallbackAgentId) {
    const user = await prisma.user.findUnique({ where: { id: fallbackAgentId }, select: { agencyId: true } });
    if (user?.agencyId) return user.agencyId;
  }
  const agency = await prisma.agency.findFirst({ select: { id: true } });
  return agency?.id || null;
};

app.get('/api/agent-zones/cap-groups', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const cap = req.query.cap != null ? String(req.query.cap).trim() : '';
    const region = req.query.region != null ? String(req.query.region).trim() : '';
    const province = req.query.province != null ? String(req.query.province).trim() : '';
    const city = req.query.city != null ? String(req.query.city).trim() : '';
    if (!cap || !region || !province || !city) {
      return res.status(400).json({ success: false, message: 'cap, region, province, city are required' });
    }

    const prismaAny = prisma as any;
    const capCatalog = loadPescaraCapCatalog();
    const capItem = capCatalog.find((it: any) => String(it?.cap || '') === cap);
    if (!capItem) return res.status(404).json({ success: false, message: 'CAP not found in catalog' });

    const agencyId = await resolveAgencyIdForAdminAction(auth);
    if (!agencyId) return res.status(400).json({ success: false, message: 'Agency not found' });

    const zone = await prismaAny.agentZone.findFirst({
      where: {
        agencyId,
        region,
        province,
        city,
        zone: zoneLabelFromCap(cap)
      }
    });

    let assignedByGroupIndex = new Map<number, { agentId: string; agentName: string }>();
    let zoneId: string | null = null;

    if (zone) {
      zoneId = String(zone.id);
      const groups = await prismaAny.zoneStreetGroup.findMany({
        where: { zoneId: zone.id },
        select: { id: true, groupIndex: true }
      });
      if (groups.length > 0) {
        const groupIdToIndex = new Map<string, number>();
        groups.forEach((g: any) => groupIdToIndex.set(String(g.id), Number(g.groupIndex)));
        const assignments = await prismaAny.zoneAssignment.findMany({
          where: {
            zoneId: zone.id,
            isActive: true,
            assignmentType: 'GROUP',
            groupId: { in: groups.map((g: any) => g.id) }
          },
          include: {
            agent: { select: { id: true, firstName: true, lastName: true } }
          }
        });
        for (const assignment of assignments) {
          const idx = groupIdToIndex.get(String(assignment.groupId || ''));
          if (!idx) continue;
          assignedByGroupIndex.set(idx, {
            agentId: String(assignment.agent.id),
            agentName: `${assignment.agent.firstName} ${assignment.agent.lastName}`.trim()
          });
        }
      }
    }

    const groups = (Array.isArray(capItem.groups) ? capItem.groups : []).map((g: any) => {
      const groupIndex = Number(g.groupIndex || 0);
      const assigned = assignedByGroupIndex.get(groupIndex) || null;
      return {
        groupIndex,
        groupName: String(g.groupName || `Gruppo ${groupIndex}`),
        streetCount: Array.isArray(g.streets) ? g.streets.length : 0,
        streets: Array.isArray(g.streets) ? g.streets : [],
        assigned
      };
    });

    res.json({
      success: true,
      data: {
        cap,
        zoneId,
        groupSizeSuggested: Number(capItem.groupSizeSuggested || 20),
        groups
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error loading CAP groups' });
  }
});

app.get('/api/agent-zones/cap-summary', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const region = req.query.region != null ? String(req.query.region).trim() : '';
    const province = req.query.province != null ? String(req.query.province).trim() : '';
    const city = req.query.city != null ? String(req.query.city).trim() : '';
    if (!region || !province || !city) {
      return res.status(400).json({ success: false, message: 'region, province, city are required' });
    }

    const prismaAny = prisma as any;
    const capCatalog = loadPescaraCapCatalog().filter(
      (it: any) => String(it?.region || '') === region && String(it?.province || '') === province && String(it?.city || '') === city
    );

    const agencyId = await resolveAgencyIdForAdminAction(auth);
    if (!agencyId) return res.status(400).json({ success: false, message: 'Agency not found' });

    const zones = await prismaAny.agentZone.findMany({
      where: {
        agencyId,
        region,
        province,
        city
      },
      select: { id: true, zone: true }
    });

    const zoneByCap = new Map<string, string>();
    for (const z of zones) {
      const cap = extractLegacyCapFromZoneLabel(String(z.zone || ''));
      if (cap) zoneByCap.set(cap, String(z.id));
    }

    const zoneIds = Array.from(zoneByCap.values());
    const groupsByZoneId = new Map<string, Array<{ id: string; groupIndex: number }>>();
    if (zoneIds.length > 0) {
      const groups = await prismaAny.zoneStreetGroup.findMany({
        where: { zoneId: { in: zoneIds } },
        select: { id: true, zoneId: true, groupIndex: true }
      });
      for (const g of groups) {
        const key = String(g.zoneId);
        if (!groupsByZoneId.has(key)) groupsByZoneId.set(key, []);
        groupsByZoneId.get(key)!.push({ id: String(g.id), groupIndex: Number(g.groupIndex) });
      }
    }

    const assignments = zoneIds.length === 0
      ? []
      : await prismaAny.zoneAssignment.findMany({
          where: {
            zoneId: { in: zoneIds },
            isActive: true,
            assignmentType: 'GROUP'
          },
          include: {
            agent: { select: { id: true, firstName: true, lastName: true } }
          }
        });

    const handoverLogs = zoneIds.length === 0
      ? []
      : await prismaAny.zoneGroupWorkLog.findMany({
          where: {
            zoneId: { in: zoneIds },
            entryType: 'HANDOVER'
          },
          select: {
            zoneId: true,
            groupId: true
          }
        });

    const assignedMap = new Map<string, { agentId: string; agentName: string }>();
    const handoverCountByKey = new Map<string, number>();
    for (const zoneId of zoneIds) {
      const groups = groupsByZoneId.get(zoneId) || [];
      const byId = new Map<string, number>();
      groups.forEach((g) => byId.set(g.id, g.groupIndex));
      assignments
        .filter((a: any) => String(a.zoneId) === zoneId && a.groupId)
        .forEach((a: any) => {
          const idx = byId.get(String(a.groupId));
          if (!idx) return;
          assignedMap.set(`${zoneId}:${idx}`, {
            agentId: String(a.agent.id),
            agentName: `${a.agent.firstName} ${a.agent.lastName}`.trim()
          });
        });
      handoverLogs
        .filter((row: any) => String(row.zoneId) === zoneId && row.groupId)
        .forEach((row: any) => {
          const idx = byId.get(String(row.groupId));
          if (!idx) return;
          const key = `${zoneId}:${idx}`;
          handoverCountByKey.set(key, (handoverCountByKey.get(key) || 0) + 1);
        });
    }

    const summary = capCatalog.map((capItem: any) => {
      const cap = String(capItem.cap || '');
      const zoneId = zoneByCap.get(cap) || null;
      const groups = (Array.isArray(capItem.groups) ? capItem.groups : []).map((g: any) => {
        const idx = Number(g.groupIndex || 0);
        const assigned = zoneId ? assignedMap.get(`${zoneId}:${idx}`) || null : null;
        const handoverCount = zoneId ? (handoverCountByKey.get(`${zoneId}:${idx}`) || 0) : 0;
        return {
          groupIndex: idx,
          groupName: String(g.groupName || `Gruppo ${idx}`),
          streetCount: Array.isArray(g.streets) ? g.streets.length : 0,
          assigned,
          handoverCount,
          hasHandover: handoverCount > 0
        };
      });
      return {
        cap,
        streetCount: Number(capItem.streetCount || 0),
        zoneId,
        groups
      };
    });

    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error loading CAP summary' });
  }
});

app.get('/api/agent-zones/group-workspace', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const cap = req.query.cap != null ? String(req.query.cap).trim() : '';
    const region = req.query.region != null ? String(req.query.region).trim() : '';
    const province = req.query.province != null ? String(req.query.province).trim() : '';
    const city = req.query.city != null ? String(req.query.city).trim() : '';
    const groupIndex = Number(req.query.groupIndex || 0);
    if (!cap || !region || !province || !city || !groupIndex) {
      return res.status(400).json({ success: false, message: 'cap, region, province, city, groupIndex are required' });
    }

    const capCatalog = loadPescaraCapCatalog();
    const capItem = capCatalog.find((it: any) => String(it?.cap || '') === cap);
    if (!capItem) return res.status(404).json({ success: false, message: 'CAP not found in catalog' });
    const groupFromCatalog = (Array.isArray(capItem.groups) ? capItem.groups : []).find((g: any) => Number(g.groupIndex || 0) === groupIndex);
    if (!groupFromCatalog) return res.status(404).json({ success: false, message: 'Group not found for selected CAP' });

    const prismaAny = prisma as any;
    const agencyId = isAdminRole(auth.role)
      ? await resolveAgencyIdForAdminAction(auth)
      : auth.agencyId || null;
    if (!agencyId) return res.status(400).json({ success: false, message: 'Agency not found' });

    const zone = await prismaAny.agentZone.findFirst({
      where: {
        agencyId,
        region,
        province,
        city,
        zone: zoneLabelFromCap(cap)
      },
      select: { id: true, zone: true }
    });

    if (!zone) {
      return res.json({
        success: true,
        data: {
          zoneId: null,
          cap,
          groupIndex,
          groupName: String(groupFromCatalog.groupName || `Gruppo ${groupIndex}`),
          streets: Array.isArray(groupFromCatalog.streets) ? groupFromCatalog.streets : [],
          assignmentHistory: [],
          logs: []
        }
      });
    }

    const group = await prismaAny.zoneStreetGroup.findFirst({
      where: { zoneId: zone.id, groupIndex },
      select: { id: true, name: true, groupIndex: true }
    });
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found in zone mapping' });
    }

    let canWrite = isAdminRole(auth.role);
    if (!isAdminRole(auth.role)) {
      const canRead = await prismaAny.zoneAssignment.findFirst({
        where: {
          zoneId: zone.id,
          groupId: group.id,
          assignmentType: 'GROUP',
          agentId: auth.id
        },
        select: { id: true }
      });
      if (!canRead) return res.status(403).json({ success: false, message: 'Forbidden' });
      const activeAssignment = await prismaAny.zoneAssignment.findFirst({
        where: {
          zoneId: zone.id,
          groupId: group.id,
          assignmentType: 'GROUP',
          agentId: auth.id,
          isActive: true
        },
        select: { id: true }
      });
      canWrite = Boolean(activeAssignment);
    }

    const streetsRows = await prismaAny.zoneStreetGroupMember.findMany({
      where: { groupId: group.id },
      orderBy: { position: 'asc' },
      include: { street: { select: { id: true, name: true } } }
    });
    const assignmentHistory = await prismaAny.zoneAssignment.findMany({
      where: {
        zoneId: zone.id,
        groupId: group.id,
        assignmentType: 'GROUP'
      },
      orderBy: { createdAt: 'asc' },
      include: {
        agent: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });
    const logs = await prismaAny.zoneGroupWorkLog.findMany({
      where: {
        zoneId: zone.id,
        groupId: group.id
      },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });

    res.json({
      success: true,
      data: {
        zoneId: zone.id,
        groupId: group.id,
        cap,
        groupIndex: group.groupIndex,
        groupName: group.name,
        canWrite,
        streetItems: streetsRows
          .map((row: any) => ({
            id: String(row.street?.id || ''),
            name: String(row.street?.name || '')
          }))
          .filter((s: any) => s.id && s.name),
        streets: streetsRows.map((row: any) => row.street?.name).filter(Boolean),
        assignmentHistory: assignmentHistory.map((a: any) => ({
          id: a.id,
          isActive: Boolean(a.isActive),
          note: a.note || null,
          assignedAt: a.createdAt,
          endedAt: a.isActive ? null : a.updatedAt,
          agent: a.agent
        })),
        logs: logs.map((log: any) => ({
          id: log.id,
          entryType: log.entryType,
          title: log.title || null,
          content: log.content,
          statusLabel: log.statusLabel || null,
          leadsCount: log.leadsCount,
          appointmentsCount: log.appointmentsCount,
          contractsCount: log.contractsCount,
          metadata: log.metadata || null,
          createdAt: log.createdAt,
          createdBy: log.createdBy
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error loading group workspace' });
  }
});

app.post('/api/contact-requests', async (req, res) => {
  try {
    const {
      propertyId,
      name,
      email,
      phone,
      message
    } = req.body || {};

    const safePropertyId = typeof propertyId === 'string' ? propertyId.trim() : '';
    const safeName = typeof name === 'string' ? name.trim() : '';
    const safeEmail = typeof email === 'string' ? email.trim() : '';
    const safePhone = typeof phone === 'string' ? phone.trim() : '';
    const safeMessage = typeof message === 'string' ? message.trim() : '';

    if (!safePropertyId || !safeName || (!safeEmail && !safePhone)) {
      return res.status(400).json({
        success: false,
        message: 'Compila almeno nome e un recapito (email o telefono).'
      });
    }

    const property = await prisma.property.findFirst({
      where: {
        id: safePropertyId,
        isPublished: true
      },
      select: {
        id: true,
        title: true,
        reference: true,
        agencyId: true,
        ownerId: true,
        agentId: true
      }
    });

    if (!property) {
      return res.status(404).json({ success: false, message: 'Immobile non trovato o non pubblicato.' });
    }

    const [admins, assignedAgent, propertyOwner, linkedMatches] = await Promise.all([
      prisma.user.findMany({
        where: {
          agencyId: property.agencyId,
          isActive: true,
          role: { in: ['SUPER_ADMIN', 'AGENCY_ADMIN'] }
        },
        select: { id: true }
      }),
      property.agentId
        ? prisma.user.findFirst({
            where: {
              id: property.agentId,
              agencyId: property.agencyId,
              isActive: true
            },
            select: { id: true, role: true }
          })
        : Promise.resolve(null),
      prisma.user.findFirst({
        where: {
          id: property.ownerId,
          agencyId: property.agencyId,
          isActive: true
        },
        select: { id: true, role: true }
      }),
      prisma.propertyMatch.findMany({
        where: { propertyId: property.id },
        select: {
          request: {
            select: {
              assignedToId: true
            }
          }
        }
      })
    ]);

    const recipientIds = new Set<string>();
    admins.forEach((admin) => recipientIds.add(admin.id));
    if (assignedAgent) recipientIds.add(assignedAgent.id);
    if (propertyOwner) recipientIds.add(propertyOwner.id);
    for (const match of linkedMatches) {
      const assignedToId = match.request?.assignedToId ? String(match.request.assignedToId) : '';
      if (assignedToId) recipientIds.add(assignedToId);
    }

    const contactLabel = `${safeName}${safePhone ? ` · ${safePhone}` : ''}${safeEmail ? ` · ${safeEmail}` : ''}`;
    const notificationData = {
      source: 'PUBLIC_CONTACT_FORM',
      propertyId: property.id,
      propertyReference: property.reference || null,
      propertyTitle: property.title,
      contactName: safeName,
      contactEmail: safeEmail || null,
      contactPhone: safePhone || null,
      message: safeMessage || null
    };

    if (recipientIds.size > 0) {
      await Promise.all(
        Array.from(recipientIds).map((recipientId) =>
          createNotificationRecord({
            agencyId: property.agencyId,
            recipientId,
            type: 'PUBLIC_CONTACT_REQUEST',
            title: 'Nuova richiesta informazioni immobile',
            message: `${contactLabel} ha richiesto informazioni su ${property.title}`,
            data: notificationData
          })
        )
      );
    }

    const firstLinkedAgentId = linkedMatches
      .map((match) => (match.request?.assignedToId ? String(match.request.assignedToId) : ''))
      .find((id) => Boolean(id));
    const activityAssigneeId =
      (assignedAgent?.id || null) ||
      firstLinkedAgentId ||
      (propertyOwner && propertyOwner.role === 'AGENT' ? propertyOwner.id : null) ||
      admins[0]?.id ||
      propertyOwner?.id ||
      null;

    if (activityAssigneeId) {
      await prisma.activity.create({
        data: {
          type: 'TASK',
          title: `Richiesta info · ${property.reference || property.id}`,
          description: [
            `Immobile: ${property.title}`,
            `Contatto: ${safeName}`,
            safePhone ? `Telefono: ${safePhone}` : null,
            safeEmail ? `Email: ${safeEmail}` : null,
            safeMessage ? `Messaggio: ${safeMessage}` : null
          ]
            .filter(Boolean)
            .join('\n'),
          priority: 2,
          agencyId: property.agencyId,
          assignedToId: activityAssigneeId,
          propertyId: property.id,
          notes: JSON.stringify(notificationData)
        }
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Richiesta inviata con successo'
    });
  } catch (error) {
    console.error('Error creating public contact request:', error);
    return res.status(500).json({
      success: false,
      message: 'Errore durante l\'invio della richiesta'
    });
  }
});

app.post('/api/visit-bookings', async (req, res) => {
  try {
    const {
      propertyId,
      name,
      email,
      phone,
      message,
      availability,
      timeSlot
    } = req.body || {};

    const safePropertyId = typeof propertyId === 'string' ? propertyId.trim() : '';
    const safeName = typeof name === 'string' ? name.trim() : '';
    const safeEmail = typeof email === 'string' ? email.trim() : '';
    const safePhone = typeof phone === 'string' ? phone.trim() : '';
    const safeMessage = typeof message === 'string' ? message.trim() : '';
    const safeAvailability = typeof availability === 'string' ? availability.trim() : '';
    const safeTimeSlot = typeof timeSlot === 'string' ? timeSlot.trim() : '';

    if (!safePropertyId || !safeName || (!safeEmail && !safePhone)) {
      return res.status(400).json({
        success: false,
        message: 'Compila almeno nome e un recapito (email o telefono).'
      });
    }

    const property = await prisma.property.findFirst({
      where: {
        id: safePropertyId,
        isPublished: true
      },
      select: {
        id: true,
        title: true,
        reference: true,
        city: true,
        address: true,
        agencyId: true,
        ownerId: true,
        agentId: true
      }
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Immobile non trovato o non pubblicato.'
      });
    }

    const [admins, assignedAgent, propertyOwner, linkedMatches] = await Promise.all([
      prisma.user.findMany({
        where: {
          agencyId: property.agencyId,
          isActive: true,
          role: { in: ['SUPER_ADMIN', 'AGENCY_ADMIN'] }
        },
        select: { id: true }
      }),
      property.agentId
        ? prisma.user.findFirst({
            where: {
              id: property.agentId,
              agencyId: property.agencyId,
              isActive: true
            },
            select: { id: true, role: true }
          })
        : Promise.resolve(null),
      prisma.user.findFirst({
        where: {
          id: property.ownerId,
          agencyId: property.agencyId,
          isActive: true
        },
        select: { id: true, role: true }
      }),
      prisma.propertyMatch.findMany({
        where: {
          propertyId: property.id
        },
        select: {
          request: {
            select: {
              assignedToId: true
            }
          }
        }
      })
    ]);

    const recipientIds = new Set<string>();
    admins.forEach((admin) => recipientIds.add(admin.id));
    if (assignedAgent) recipientIds.add(assignedAgent.id);
    if (propertyOwner) {
      recipientIds.add(propertyOwner.id);
    }
    for (const match of linkedMatches) {
      const assignedToId = match.request?.assignedToId ? String(match.request.assignedToId) : '';
      if (assignedToId) recipientIds.add(assignedToId);
    }

    const requestLabel = `${safeName}${safePhone ? ` · ${safePhone}` : ''}${safeEmail ? ` · ${safeEmail}` : ''}`;
    const notificationTitle = 'Nuova richiesta visita immobile';
    const notificationMessage = `${requestLabel} ha richiesto una visita per ${property.title}`;
    const notificationData = {
      propertyId: property.id,
      propertyReference: property.reference,
      propertyTitle: property.title,
      contactName: safeName,
      contactEmail: safeEmail || null,
      contactPhone: safePhone || null,
      availability: safeAvailability || null,
      timeSlot: safeTimeSlot || null,
      message: safeMessage || null,
      source: 'PUBLIC_VISIT_FORM'
    };

    if (recipientIds.size > 0) {
      await Promise.all(
        Array.from(recipientIds).map((recipientId) =>
          createNotificationRecord({
            agencyId: property.agencyId,
            recipientId,
            type: 'VISIT_REQUEST',
            title: notificationTitle,
            message: notificationMessage,
            data: notificationData
          })
        )
      );
    }

    const firstLinkedAgentId = linkedMatches
      .map((match) => (match.request?.assignedToId ? String(match.request.assignedToId) : ''))
      .find((id) => Boolean(id));
    const activityAssigneeId =
      (assignedAgent?.id || null) ||
      firstLinkedAgentId ||
      (propertyOwner && propertyOwner.role === 'AGENT' ? propertyOwner.id : null) ||
      admins[0]?.id ||
      propertyOwner?.id ||
      null;

    if (activityAssigneeId) {
      await prisma.activity.create({
        data: {
          type: 'TASK',
          title: `Richiesta visita · ${property.reference || property.id}`,
          description: [
            `Contatto: ${safeName}`,
            safePhone ? `Telefono: ${safePhone}` : null,
            safeEmail ? `Email: ${safeEmail}` : null,
            safeAvailability ? `Disponibilità: ${safeAvailability}` : null,
            safeTimeSlot ? `Fascia oraria: ${safeTimeSlot}` : null,
            safeMessage ? `Messaggio: ${safeMessage}` : null,
            `Immobile: ${property.title}`
          ]
            .filter(Boolean)
            .join('\n'),
          priority: 2,
          agencyId: property.agencyId,
          assignedToId: activityAssigneeId,
          propertyId: property.id
        }
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Richiesta visita inviata con successo'
    });
  } catch (error) {
    console.error('Error creating visit booking:', error);
    return res.status(500).json({
      success: false,
      message: 'Errore durante l\'invio della richiesta visita'
    });
  }
});

app.get('/api/agent-zones/group-workspace/overview', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const cap = req.query.cap != null ? String(req.query.cap).trim() : '';
    const region = req.query.region != null ? String(req.query.region).trim() : '';
    const province = req.query.province != null ? String(req.query.province).trim() : '';
    const city = req.query.city != null ? String(req.query.city).trim() : '';
    const groupIndex = Number(req.query.groupIndex || 0);
    if (!cap || !region || !province || !city || !groupIndex) {
      return res.status(400).json({ success: false, message: 'cap, region, province, city, groupIndex are required' });
    }

    const prismaAny = prisma as any;
    const agencyId = isAdminRole(auth.role)
      ? await resolveAgencyIdForAdminAction(auth)
      : auth.agencyId || null;
    if (!agencyId) return res.status(400).json({ success: false, message: 'Agency not found' });

    const zone = await prismaAny.agentZone.findFirst({
      where: {
        agencyId,
        region,
        province,
        city,
        zone: zoneLabelFromCap(cap)
      },
      select: { id: true }
    });
    if (!zone) {
      return res.json({
        success: true,
        data: {
          dailyListings: [],
          mapPoints: [],
          center: null
        }
      });
    }

    const group = await prismaAny.zoneStreetGroup.findFirst({
      where: { zoneId: zone.id, groupIndex },
      select: { id: true }
    });
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found in zone mapping' });
    }

    if (!isAdminRole(auth.role)) {
      const canRead = await prismaAny.zoneAssignment.findFirst({
        where: {
          zoneId: zone.id,
          groupId: group.id,
          assignmentType: 'GROUP',
          agentId: auth.id
        },
        select: { id: true }
      });
      if (!canRead) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const [dailyListings, mapRows, streetsRows] = await Promise.all([
      prismaAny.zoneStreetListing.findMany({
        where: {
          zoneId: zone.id,
          groupId: group.id
        },
        orderBy: { firstSeenAt: 'desc' },
        take: 120,
        include: {
          street: { select: { id: true, name: true } }
        }
      }),
      prismaAny.zoneStreetGroupMember.findMany({
        where: { groupId: group.id },
        include: { street: { select: { id: true, name: true } } },
        orderBy: { position: 'asc' }
      }),
      prismaAny.zoneStreetMarketSnapshot.findMany({
        where: {
          zoneId: zone.id,
          street: { groupMembers: { some: { groupId: group.id } } }
        },
        select: {
          streetId: true,
          lat: true,
          lng: true,
          rawPayload: true,
          street: { select: { id: true, name: true } }
        },
        take: 500
      })
    ]);

    const points: Array<{
      streetId: string
      streetName: string
      lat: number
      lng: number
      geomCoordinates?: any
    }> = (Array.isArray(mapRows) ? mapRows : [])
      .map((row: any) => ({
        streetId: String(row.streetId || ''),
        streetName: String(row.street?.name || ''),
        lat: typeof row.lat === 'number' ? row.lat : null,
        lng: typeof row.lng === 'number' ? row.lng : null,
        geomCoordinates: row?.rawPayload?.geomCoordinates ?? null
      }))
      .filter((row: any) => row.streetId && row.streetName && row.lat != null && row.lng != null);

    const existingPointStreetIds = new Set(points.map((p: any) => p.streetId));
    const missingStreets = (Array.isArray(streetsRows) ? streetsRows : [])
      .map((row: any) => ({
        streetId: String(row.street?.id || ''),
        streetName: String(row.street?.name || '')
      }))
      .filter((s: any) => s.streetId && s.streetName && !existingPointStreetIds.has(s.streetId))
      .slice(0, 25);

    for (const s of missingStreets) {
      try {
        const geo = await geocodeStreetWithNominatim(s.streetName, city, province);
        if (geo) {
          points.push({
            streetId: s.streetId,
            streetName: s.streetName,
            lat: geo.lat,
            lng: geo.lng,
            geomCoordinates: null
          });
        }
      } catch {
      }
    }

    const center =
      points.length > 0
        ? {
            lat: points.reduce((acc: number, p: any) => acc + Number(p.lat || 0), 0) / points.length,
            lng: points.reduce((acc: number, p: any) => acc + Number(p.lng || 0), 0) / points.length
          }
        : null;

    res.json({
      success: true,
      data: {
        dailyListings: dailyListings.map((row: any) => ({
          id: row.id,
          sourceListingId: row.sourceListingId,
          title: row.title || null,
          priceText: row.priceText || null,
          surfaceText: row.surfaceText || null,
          roomsText: row.roomsText || null,
          mainImageUrl: row.mainImageUrl || null,
          listingUrl: row.listingUrl,
          street: row.street ? { id: row.street.id, name: row.street.name } : null,
          firstSeenAt: row.firstSeenAt
        })),
        mapPoints: points,
        center
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: String(error?.message || 'Error loading group overview') });
  }
});

app.post('/api/agent-zones/group-workspace/close-assignment', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const assignmentId = req.body?.assignmentId != null ? String(req.body.assignmentId).trim() : '';
    const note = req.body?.note != null ? String(req.body.note).trim() : '';
    if (!assignmentId) {
      return res.status(400).json({ success: false, message: 'assignmentId is required' });
    }

    const prismaAny = prisma as any;
    const assignment = await prismaAny.zoneAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        zone: { select: { id: true, agencyId: true, region: true, province: true, city: true, zone: true } },
        group: { select: { id: true, groupIndex: true, name: true } },
        agent: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });
    if (!assignment || assignment.assignmentType !== 'GROUP' || !assignment.groupId) {
      return res.status(404).json({ success: false, message: 'Group assignment not found' });
    }
    if (!assignment.isActive) {
      return res.status(400).json({ success: false, message: 'Assignment is already closed' });
    }

    const agencyId = await resolveAgencyIdForAdminAction(auth);
    if (!agencyId || assignment.agencyId !== agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const updated = await prismaAny.$transaction(async (tx: any) => {
      await pruneInactiveGroupAssignments(tx, assignment.zoneId, assignment.groupId, assignment.id);
      const closed = await tx.zoneAssignment.update({
        where: { id: assignment.id },
        data: {
          isActive: false,
          note: note || 'Gruppo chiuso e archiviato da admin'
        }
      });
      await tx.zoneGroupWorkLog.create({
        data: {
          agencyId: assignment.agencyId,
          zoneId: assignment.zoneId,
          groupId: assignment.groupId,
          createdById: auth.id,
          entryType: 'HANDOVER',
          title: 'Chiusura gruppo',
          content: `Gruppo ${assignment.group?.name || 'N/D'} chiuso e archiviato da admin (${assignment.agent.firstName} ${assignment.agent.lastName})`,
          metadata: {
            assignmentId: assignment.id,
            closedAgentId: assignment.agentId,
            closedAgentEmail: assignment.agent.email,
            closedAt: new Date().toISOString()
          }
        }
      });
      return closed;
    });

    res.json({
      success: true,
      data: {
        assignmentId: updated.id,
        isActive: updated.isActive,
        endedAt: updated.updatedAt
      },
      message: 'Gruppo chiuso e archiviato'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: String(error?.message || 'Error closing group assignment')
    });
  }
});

app.post('/api/agent-zones/group-workspace/logs', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const cap = req.body?.cap != null ? String(req.body.cap).trim() : '';
    const region = req.body?.region != null ? String(req.body.region).trim() : '';
    const province = req.body?.province != null ? String(req.body.province).trim() : '';
    const city = req.body?.city != null ? String(req.body.city).trim() : '';
    const groupIndex = Number(req.body?.groupIndex || 0);
    const entryTypeRaw = req.body?.entryType != null ? String(req.body.entryType).toUpperCase() : 'NOTE';
    const entryType = ['NOTE', 'STATUS', 'STATISTICS', 'HANDOVER'].includes(entryTypeRaw) ? entryTypeRaw : 'NOTE';
    const title = req.body?.title != null ? String(req.body.title).trim() : '';
    const content = req.body?.content != null ? String(req.body.content).trim() : '';
    const statusLabel = req.body?.statusLabel != null ? String(req.body.statusLabel).trim() : '';
    const leadsCount = req.body?.leadsCount != null ? Number(req.body.leadsCount) : null;
    const appointmentsCount = req.body?.appointmentsCount != null ? Number(req.body.appointmentsCount) : null;
    const contractsCount = req.body?.contractsCount != null ? Number(req.body.contractsCount) : null;
    const normalizeWorkspaceMetadata = (raw: unknown) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const base: Record<string, any> = { ...(raw as Record<string, any>) };
      const normalizedAttachments: Array<{ type: 'image'; dataUrl: string; label?: string | null }> = [];
      const rawAttachments = Array.isArray(base.attachments) ? base.attachments : [];
      for (const item of rawAttachments) {
        if (!item || typeof item !== 'object') continue;
        const dataUrl = typeof (item as any).dataUrl === 'string' ? String((item as any).dataUrl).trim() : '';
        if (!dataUrl) continue;
        const label = typeof (item as any).label === 'string' ? String((item as any).label).trim() : '';
        normalizedAttachments.push({ type: 'image', dataUrl, ...(label ? { label } : {}) });
      }
      const legacyPhoto = typeof base.photoDataUrl === 'string' ? String(base.photoDataUrl).trim() : '';
      if (normalizedAttachments.length === 0 && legacyPhoto) {
        normalizedAttachments.push({ type: 'image', dataUrl: legacyPhoto });
      }
      if (normalizedAttachments.length > 0) {
        base.attachments = normalizedAttachments;
        if (!legacyPhoto) base.photoDataUrl = normalizedAttachments[0].dataUrl;
      }
      return Object.keys(base).length > 0 ? base : null;
    };
    const metadata = normalizeWorkspaceMetadata(req.body?.metadata ?? null);
    const attachments = Array.isArray((metadata as any)?.attachments) ? (metadata as any).attachments : [];
    for (const attachment of attachments) {
      const dataUrl = typeof attachment?.dataUrl === 'string' ? String(attachment.dataUrl).trim() : '';
      if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(dataUrl)) {
        return res.status(400).json({ success: false, message: 'Formato immagine non supportato (usa PNG/JPG/WEBP/GIF)' });
      }
      // Base64 payload length ~= bytes * 4/3. Keep a 5MB ceiling.
      const commaIdx = dataUrl.indexOf(',');
      const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
      const estimatedBytes = Math.floor((base64.length * 3) / 4);
      if (estimatedBytes > 5 * 1024 * 1024) {
        return res.status(413).json({ success: false, message: 'Immagine troppo grande: massimo 5MB' });
      }
    }
    if (!cap || !region || !province || !city || !groupIndex || !content) {
      return res.status(400).json({ success: false, message: 'cap, region, province, city, groupIndex, content are required' });
    }

    const prismaAny = prisma as any;
    const agencyId = isAdminRole(auth.role)
      ? await resolveAgencyIdForAdminAction(auth)
      : auth.agencyId || null;
    if (!agencyId) return res.status(400).json({ success: false, message: 'Agency not found' });

    const zone = await prismaAny.agentZone.findFirst({
      where: {
        agencyId,
        region,
        province,
        city,
        zone: zoneLabelFromCap(cap)
      },
      select: { id: true }
    });
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });

    const group = await prismaAny.zoneStreetGroup.findFirst({
      where: { zoneId: zone.id, groupIndex },
      select: { id: true }
    });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found in zone mapping' });

    if (!isAdminRole(auth.role)) {
      const activeAssignment = await prismaAny.zoneAssignment.findFirst({
        where: {
          zoneId: zone.id,
          groupId: group.id,
          assignmentType: 'GROUP',
          agentId: auth.id,
          isActive: true
        },
        select: { id: true }
      });
      if (!activeAssignment) {
        return res.status(403).json({ success: false, message: "Solo l'agente assegnato puo scrivere su questo gruppo" });
      }
    }

    const created = await prismaAny.zoneGroupWorkLog.create({
      data: {
        agencyId,
        zoneId: zone.id,
        groupId: group.id,
        createdById: auth.id,
        entryType,
        title: title || null,
        content,
        statusLabel: statusLabel || null,
        leadsCount: Number.isFinite(leadsCount as number) ? Number(leadsCount) : null,
        appointmentsCount: Number.isFinite(appointmentsCount as number) ? Number(appointmentsCount) : null,
        contractsCount: Number.isFinite(contractsCount as number) ? Number(contractsCount) : null,
        metadata
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });

    res.status(201).json({
      success: true,
      data: {
        id: created.id,
        entryType: created.entryType,
        title: created.title,
        content: created.content,
        statusLabel: created.statusLabel,
        leadsCount: created.leadsCount,
        appointmentsCount: created.appointmentsCount,
        contractsCount: created.contractsCount,
        metadata: normalizeWorkspaceMetadata(created.metadata),
        createdAt: created.createdAt,
        createdBy: created.createdBy
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error creating workspace log' });
  }
});

app.get('/api/agent-zones/street-workspace', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const cap = req.query.cap != null ? String(req.query.cap).trim() : '';
    const region = req.query.region != null ? String(req.query.region).trim() : '';
    const province = req.query.province != null ? String(req.query.province).trim() : '';
    const city = req.query.city != null ? String(req.query.city).trim() : '';
    const groupIndex = Number(req.query.groupIndex || 0);
    const streetId = req.query.streetId != null ? String(req.query.streetId).trim() : '';
    if (!cap || !region || !province || !city || !groupIndex || !streetId) {
      return res.status(400).json({ success: false, message: 'cap, region, province, city, groupIndex, streetId are required' });
    }

    const prismaAny = prisma as any;
    const agencyId = isAdminRole(auth.role)
      ? await resolveAgencyIdForAdminAction(auth)
      : auth.agencyId || null;
    if (!agencyId) return res.status(400).json({ success: false, message: 'Agency not found' });

    const zone = await prismaAny.agentZone.findFirst({
      where: { agencyId, region, province, city, zone: zoneLabelFromCap(cap) },
      select: { id: true }
    });
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });

    const group = await prismaAny.zoneStreetGroup.findFirst({
      where: { zoneId: zone.id, groupIndex },
      select: { id: true, name: true, groupIndex: true }
    });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found in zone mapping' });

    const member = await prismaAny.zoneStreetGroupMember.findFirst({
      where: { groupId: group.id, streetId },
      include: { street: { select: { id: true, name: true } } }
    });
    if (!member || !member.street) return res.status(404).json({ success: false, message: 'Street not found in selected group' });

    let canWrite = isAdminRole(auth.role);
    if (!isAdminRole(auth.role)) {
      const canRead = await prismaAny.zoneAssignment.findFirst({
        where: {
          zoneId: zone.id,
          groupId: group.id,
          assignmentType: 'GROUP',
          agentId: auth.id
        },
        select: { id: true }
      });
      if (!canRead) return res.status(403).json({ success: false, message: 'Forbidden' });

      const active = await prismaAny.zoneAssignment.findFirst({
        where: {
          zoneId: zone.id,
          groupId: group.id,
          assignmentType: 'GROUP',
          agentId: auth.id,
          isActive: true
        },
        select: { id: true }
      });
      canWrite = Boolean(active);
    }

    const assignmentHistory = await prismaAny.zoneAssignment.findMany({
      where: {
        zoneId: zone.id,
        groupId: group.id,
        assignmentType: 'GROUP'
      },
      orderBy: { createdAt: 'asc' },
      include: {
        agent: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });

    const logs = await prismaAny.zoneStreetWorkLog.findMany({
      where: {
        zoneId: zone.id,
        groupId: group.id,
        streetId
      },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });

    res.json({
      success: true,
      data: {
        zoneId: zone.id,
        groupId: group.id,
        groupName: group.name,
        groupIndex: group.groupIndex,
        street: { id: member.street.id, name: member.street.name },
        cap,
        canWrite,
        assignmentHistory: assignmentHistory.map((a: any) => ({
          id: a.id,
          isActive: Boolean(a.isActive),
          note: a.note || null,
          assignedAt: a.createdAt,
          endedAt: a.isActive ? null : a.updatedAt,
          agent: a.agent
        })),
        logs: logs.map((log: any) => ({
          id: log.id,
          entryType: log.entryType,
          title: log.title || null,
          content: log.content,
          metadata: log.metadata || null,
          createdAt: log.createdAt,
          createdBy: log.createdBy
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error loading street workspace' });
  }
});

app.post('/api/agent-zones/street-workspace/logs', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const cap = req.body?.cap != null ? String(req.body.cap).trim() : '';
    const region = req.body?.region != null ? String(req.body.region).trim() : '';
    const province = req.body?.province != null ? String(req.body.province).trim() : '';
    const city = req.body?.city != null ? String(req.body.city).trim() : '';
    const groupIndex = Number(req.body?.groupIndex || 0);
    const streetId = req.body?.streetId != null ? String(req.body.streetId).trim() : '';
    const entryTypeRaw = req.body?.entryType != null ? String(req.body.entryType).toUpperCase() : 'NOTE';
    const entryType = ['NOTE', 'STATUS', 'STATISTICS', 'HANDOVER'].includes(entryTypeRaw) ? entryTypeRaw : 'NOTE';
    const title = req.body?.title != null ? String(req.body.title).trim() : '';
    const content = req.body?.content != null ? String(req.body.content).trim() : '';
    const normalizeWorkspaceMetadata = (raw: unknown) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const base: Record<string, any> = { ...(raw as Record<string, any>) };
      const normalizedAttachments: Array<{ type: 'image'; dataUrl: string; label?: string | null }> = [];
      const rawAttachments = Array.isArray(base.attachments) ? base.attachments : [];
      for (const item of rawAttachments) {
        if (!item || typeof item !== 'object') continue;
        const dataUrl = typeof (item as any).dataUrl === 'string' ? String((item as any).dataUrl).trim() : '';
        if (!dataUrl) continue;
        const label = typeof (item as any).label === 'string' ? String((item as any).label).trim() : '';
        normalizedAttachments.push({ type: 'image', dataUrl, ...(label ? { label } : {}) });
      }
      const legacyPhoto = typeof base.photoDataUrl === 'string' ? String(base.photoDataUrl).trim() : '';
      if (normalizedAttachments.length === 0 && legacyPhoto) {
        normalizedAttachments.push({ type: 'image', dataUrl: legacyPhoto });
      }
      if (normalizedAttachments.length > 0) {
        base.attachments = normalizedAttachments;
        if (!legacyPhoto) base.photoDataUrl = normalizedAttachments[0].dataUrl;
      }
      return Object.keys(base).length > 0 ? base : null;
    };
    const metadata = normalizeWorkspaceMetadata(req.body?.metadata ?? null);
    const attachments = Array.isArray((metadata as any)?.attachments) ? (metadata as any).attachments : [];
    for (const attachment of attachments) {
      const dataUrl = typeof attachment?.dataUrl === 'string' ? String(attachment.dataUrl).trim() : '';
      if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(dataUrl)) {
        return res.status(400).json({ success: false, message: 'Formato immagine non supportato (usa PNG/JPG/WEBP/GIF)' });
      }
      const commaIdx = dataUrl.indexOf(',');
      const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
      const estimatedBytes = Math.floor((base64.length * 3) / 4);
      if (estimatedBytes > 5 * 1024 * 1024) {
        return res.status(413).json({ success: false, message: 'Immagine troppo grande: massimo 5MB' });
      }
    }
    if (!cap || !region || !province || !city || !groupIndex || !streetId || !content) {
      return res.status(400).json({ success: false, message: 'cap, region, province, city, groupIndex, streetId, content are required' });
    }

    const prismaAny = prisma as any;
    const agencyId = isAdminRole(auth.role)
      ? await resolveAgencyIdForAdminAction(auth)
      : auth.agencyId || null;
    if (!agencyId) return res.status(400).json({ success: false, message: 'Agency not found' });

    const zone = await prismaAny.agentZone.findFirst({
      where: { agencyId, region, province, city, zone: zoneLabelFromCap(cap) },
      select: { id: true }
    });
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });

    const group = await prismaAny.zoneStreetGroup.findFirst({
      where: { zoneId: zone.id, groupIndex },
      select: { id: true }
    });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found in zone mapping' });

    const member = await prismaAny.zoneStreetGroupMember.findFirst({ where: { groupId: group.id, streetId }, select: { id: true } });
    if (!member) return res.status(404).json({ success: false, message: 'Street not found in selected group' });

    if (!isAdminRole(auth.role)) {
      const activeAssignment = await prismaAny.zoneAssignment.findFirst({
        where: {
          zoneId: zone.id,
          groupId: group.id,
          assignmentType: 'GROUP',
          agentId: auth.id,
          isActive: true
        },
        select: { id: true }
      });
      if (!activeAssignment) {
        return res.status(403).json({ success: false, message: "Solo l'agente assegnato puo scrivere su questa via" });
      }
    }

    const created = await prismaAny.zoneStreetWorkLog.create({
      data: {
        agencyId,
        zoneId: zone.id,
        groupId: group.id,
        streetId,
        createdById: auth.id,
        entryType,
        title: title || null,
        content,
        metadata
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });

    res.status(201).json({
      success: true,
      data: {
        id: created.id,
        entryType: created.entryType,
        title: created.title,
        content: created.content,
        metadata: normalizeWorkspaceMetadata(created.metadata) || null,
        createdAt: created.createdAt,
        createdBy: created.createdBy
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error creating street workspace log' });
  }
});

app.get('/api/agent-zones/street-market-insights', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const cap = req.query.cap != null ? String(req.query.cap).trim() : '';
    const region = req.query.region != null ? String(req.query.region).trim() : '';
    const province = req.query.province != null ? String(req.query.province).trim() : '';
    const city = req.query.city != null ? String(req.query.city).trim() : '';
    const groupIndex = Number(req.query.groupIndex || 0);
    const streetId = req.query.streetId != null ? String(req.query.streetId).trim() : '';
    const forceRefresh = String(req.query.forceRefresh || '').toLowerCase() === 'true';
    if (!cap || !region || !province || !city || !groupIndex || !streetId) {
      return res.status(400).json({ success: false, message: 'cap, region, province, city, groupIndex, streetId are required' });
    }

    const prismaAny = prisma as any;
    const agencyId = isAdminRole(auth.role)
      ? await resolveAgencyIdForAdminAction(auth)
      : auth.agencyId || null;
    if (!agencyId) return res.status(400).json({ success: false, message: 'Agency not found' });

    const zone = await prismaAny.agentZone.findFirst({
      where: { agencyId, region, province, city, zone: zoneLabelFromCap(cap) },
      select: { id: true }
    });
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });

    const group = await prismaAny.zoneStreetGroup.findFirst({
      where: { zoneId: zone.id, groupIndex },
      select: { id: true }
    });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found in zone mapping' });

    const member = await prismaAny.zoneStreetGroupMember.findFirst({
      where: { groupId: group.id, streetId },
      include: { street: { select: { id: true, name: true } } }
    });
    if (!member || !member.street) return res.status(404).json({ success: false, message: 'Street not found in selected group' });

    if (!isAdminRole(auth.role)) {
      const canRead = await prismaAny.zoneAssignment.findFirst({
        where: { zoneId: zone.id, groupId: group.id, assignmentType: 'GROUP', agentId: auth.id },
        select: { id: true }
      });
      if (!canRead) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const snapshotMaxAgeMs = 1000 * 60 * 60 * 24 * 7;
    let snapshot = await prismaAny.zoneStreetMarketSnapshot.findUnique({
      where: { streetId },
      select: {
        id: true,
        sourceUrl: true,
        marketTitle: true,
        avgPricePerSqm: true,
        avgRangeText: true,
        trendSummary: true,
        trendLongTerm: true,
        cityAverageTitle: true,
        houseSummary: true,
        apartmentSummary: true,
        lat: true,
        lng: true,
        rawPayload: true,
        fetchedAt: true
      }
    });

    const now = Date.now();
    const isFresh =
      snapshot &&
      snapshot.fetchedAt &&
      now - new Date(snapshot.fetchedAt).getTime() < snapshotMaxAgeMs;
    const hasLatLng =
      typeof snapshot?.lat === 'number' &&
      Number.isFinite(snapshot.lat) &&
      typeof snapshot?.lng === 'number' &&
      Number.isFinite(snapshot.lng);
    const hasGeom =
      Array.isArray(snapshot?.rawPayload?.geomCoordinates) &&
      snapshot.rawPayload.geomCoordinates.length > 0;
    const hasMapData = hasLatLng || hasGeom;
    const shouldRefreshSnapshot = forceRefresh || !snapshot || !isFresh || !hasMapData;

    if (shouldRefreshSnapshot) {
      const citySlug = slugifyForUrl(city);
      const streetSlug = slugifyForUrl(member.street.name);
      const sourceUrl = `https://realadvisor.it/it/mercato-immobiliare/${cap}-${citySlug}/${streetSlug}`;
      const scraped = await scrapeStreetMarketSnapshot(sourceUrl);

      snapshot = await prismaAny.zoneStreetMarketSnapshot.upsert({
        where: { streetId },
        create: {
          agencyId,
          zoneId: zone.id,
          streetId,
          sourceUrl: scraped.sourceUrl,
          marketTitle: scraped.marketTitle,
          avgPricePerSqm: scraped.avgPricePerSqm,
          avgRangeText: scraped.avgRangeText,
          trendSummary: scraped.trendSummary,
          trendLongTerm: scraped.trendLongTerm,
          cityAverageTitle: scraped.cityAverageTitle,
          houseSummary: scraped.houseSummary,
          apartmentSummary: scraped.apartmentSummary,
          lat: scraped.lat,
          lng: scraped.lng,
          rawPayload: scraped.rawPayload,
          fetchedAt: new Date()
        },
        update: {
          sourceUrl: scraped.sourceUrl,
          marketTitle: scraped.marketTitle,
          avgPricePerSqm: scraped.avgPricePerSqm,
          avgRangeText: scraped.avgRangeText,
          trendSummary: scraped.trendSummary,
          trendLongTerm: scraped.trendLongTerm,
          cityAverageTitle: scraped.cityAverageTitle,
          houseSummary: scraped.houseSummary,
          apartmentSummary: scraped.apartmentSummary,
          lat: scraped.lat,
          lng: scraped.lng,
          rawPayload: scraped.rawPayload,
          fetchedAt: new Date()
        },
        select: {
          sourceUrl: true,
          marketTitle: true,
          avgPricePerSqm: true,
          avgRangeText: true,
          trendSummary: true,
          trendLongTerm: true,
          cityAverageTitle: true,
          houseSummary: true,
          apartmentSummary: true,
          lat: true,
          lng: true,
          rawPayload: true,
          fetchedAt: true
        }
      });
    }

    res.json({
      success: true,
      data: {
        street: member.street,
        cap,
        sourceUrl: snapshot?.sourceUrl || null,
        marketTitle: snapshot?.marketTitle || null,
        avgPricePerSqm: snapshot?.avgPricePerSqm || null,
        avgRangeText: snapshot?.avgRangeText || null,
        trendSummary: snapshot?.trendSummary || null,
        trendLongTerm: snapshot?.trendLongTerm || null,
        cityAverageTitle: snapshot?.cityAverageTitle || null,
        houseSummary: snapshot?.houseSummary || null,
        apartmentSummary: snapshot?.apartmentSummary || null,
        lat: snapshot?.lat ?? null,
        lng: snapshot?.lng ?? null,
        geomCoordinates: Array.isArray(snapshot?.rawPayload?.geomCoordinates) ? snapshot.rawPayload.geomCoordinates : null,
        fetchedAt: snapshot?.fetchedAt || null
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: String(error?.message || 'Error loading street market insights')
    });
  }
});

app.get('/api/agent-zones/street-listings', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const cap = req.query.cap != null ? String(req.query.cap).trim() : '';
    const region = req.query.region != null ? String(req.query.region).trim() : '';
    const province = req.query.province != null ? String(req.query.province).trim() : '';
    const city = req.query.city != null ? String(req.query.city).trim() : '';
    const groupIndex = Number(req.query.groupIndex || 0);
    const streetId = req.query.streetId != null ? String(req.query.streetId).trim() : '';
    const forceRefresh = String(req.query.forceRefresh || '').toLowerCase() === 'true';
    if (!cap || !region || !province || !city || !groupIndex || !streetId) {
      return res.status(400).json({ success: false, message: 'cap, region, province, city, groupIndex, streetId are required' });
    }

    const prismaAny = prisma as any;
    const scope = await resolveStreetScopeForZoneTask({
      prismaAny,
      auth,
      cap,
      region,
      province,
      city,
      groupIndex,
      streetId
    });
    if (!scope.success) return res.status(scope.status).json({ success: false, message: scope.message });

    const snapshotMaxAgeMs = 1000 * 60 * 60 * 24;
    const nowTs = Date.now();
    const idealistaSourceUrl = buildIdealistaStreetUrl(scope.street.name, scope.city, scope.province);
    const latestSnapshot = await prismaAny.zoneStreetListingSnapshot.findFirst({
      where: { streetId: scope.street.id },
      orderBy: { fetchedAt: 'desc' }
    });

    const isSnapshotFresh =
      latestSnapshot &&
      latestSnapshot.expiresAt &&
      new Date(latestSnapshot.expiresAt).getTime() > nowTs;
    const shouldRefresh = forceRefresh || !isSnapshotFresh;

    let snapshot = latestSnapshot;
    let warningMessage: string | null = latestSnapshot?.warning || null;
    let refreshed = false;

    const refreshStreetListingsSnapshot = async () => {
      const refreshKey = `${scope.street.id}::${cap}::${scope.city}::${scope.province}`;
      const running = zoneStreetListingRefreshLocks.get(refreshKey);
      if (running) return running;

      const task = (async () => {
        let scrapeResult = await scrapeIdealistaStreetWithLock({
          streetId: scope.street.id,
          streetName: scope.street.name,
          city: scope.city,
          province: scope.province,
          sourceUrl: idealistaSourceUrl
        });

        if (Array.isArray(scrapeResult.listings) && scrapeResult.listings.length > 0) {
          scrapeResult = {
            ...scrapeResult,
            listings: await enrichNestoriaListingsWithDetailGeo(scrapeResult.listings)
          };
        }

        const geoFiltered = filterListingsByStreetScope(scrapeResult.listings, {
          streetName: scope.street.name,
          city: scope.city,
          province: scope.province,
          cap
        });
      scrapeResult = {
        ...scrapeResult,
        listings: geoFiltered.listings,
        warning: [
          scrapeResult.warning || null,
          geoFiltered.acceptedSoftCount > 0
            ? `Geo soft-match accepted ${geoFiltered.acceptedSoftCount} listing (city/cap coherent)`
            : null,
          geoFiltered.rejectedCount > 0
            ? `Geo filter removed ${geoFiltered.rejectedCount} listing fuori zona (${geoFiltered.rejectedSummary || 'via/citta/cap mismatch'})`
            : null
        ]
            .filter(Boolean)
            .join(' | ') || null
        };

        if (!Array.isArray(scrapeResult.listings) || scrapeResult.listings.length === 0) {
          const historicalRows = await prismaAny.zoneStreetListing.findMany({
            where: { streetId: scope.street.id },
            orderBy: [{ lastSeenAt: 'desc' }, { updatedAt: 'desc' }],
            take: 80
          });

          if (historicalRows.length > 0) {
            scrapeResult = {
              status: 'PARTIAL',
              warning: `${scrapeResult.warning || 'No precise external listings'} | fallback=historical-street-cache`,
              listings: historicalRows.map((row: any) => ({
                sourceListingId: row.sourceListingId,
                sourceUrl: row.sourceUrl || null,
                listingUrl: row.listingUrl || '',
                title: row.title || null,
                priceText: row.priceText || null,
                surfaceText: row.surfaceText || null,
                roomsText: row.roomsText || null,
                floorText: row.floorText || null,
                description: row.description || null,
                energyClass: row.energyClass || null,
                addressText: row.addressText || null,
                agencyName: row.agencyName || null,
                phoneVisible: row.phoneVisible || null,
                mainImageUrl: row.mainImageUrl || null,
                metadata: row.metadata || { via: 'historical-street-cache' }
              })),
              rawPayload: {
                mode: 'historical-street-cache',
                originalWarning: scrapeResult.warning || null,
                listingCount: historicalRows.length
              }
            };
          } else {
            const groupRows = await prismaAny.zoneStreetListing.findMany({
              where: {
                zoneId: scope.zone.id,
                groupId: scope.group.id
              },
              orderBy: [{ lastSeenAt: 'desc' }, { updatedAt: 'desc' }],
              take: 240
            });
            const groupMatchedRows = (Array.isArray(groupRows) ? groupRows : []).filter((row: any) =>
              isListingInsideStreetScope(row, {
                streetName: scope.street.name,
                city: scope.city,
                province: scope.province,
                cap
              }).ok
            );

            if (groupMatchedRows.length > 0) {
              scrapeResult = {
                status: 'PARTIAL',
                warning: `${scrapeResult.warning || 'No precise external listings'} | fallback=group-street-cache`,
                listings: groupMatchedRows.map((row: any) => ({
                  sourceListingId: row.sourceListingId,
                  sourceUrl: row.sourceUrl || null,
                  listingUrl: row.listingUrl || '',
                  title: row.title || null,
                  priceText: row.priceText || null,
                  surfaceText: row.surfaceText || null,
                  roomsText: row.roomsText || null,
                  floorText: row.floorText || null,
                  description: row.description || null,
                  energyClass: row.energyClass || null,
                  addressText: row.addressText || null,
                  agencyName: row.agencyName || null,
                  phoneVisible: row.phoneVisible || null,
                  mainImageUrl: row.mainImageUrl || null,
                  metadata: row.metadata || { via: 'group-street-cache' }
                })),
                rawPayload: {
                  mode: 'group-street-cache',
                  originalWarning: scrapeResult.warning || null,
                  listingCount: groupMatchedRows.length
                }
              };
            }

            if (!Array.isArray(scrapeResult.listings) || scrapeResult.listings.length === 0) {
            const streetName = String(scope.street.name || '').trim();
            const streetCore = stripStreetPrefix(streetName);
            const addressMatches: any[] = streetName
              ? [{ address: { contains: streetName, mode: 'insensitive' } }]
              : [];
            if (streetCore && streetCore.length >= 4 && normalizeGeoToken(streetCore) !== normalizeGeoToken(streetName)) {
              addressMatches.push({ address: { contains: streetCore, mode: 'insensitive' } });
            }

            const crmProperties = await prismaAny.property.findMany({
              where: {
                agencyId: scope.zone.agencyId,
                city: { equals: scope.city, mode: 'insensitive' },
                province: { equals: scope.province, mode: 'insensitive' },
                zipCode: cap,
                ...(addressMatches.length > 0 ? { OR: addressMatches } : {})
              },
              orderBy: { updatedAt: 'desc' },
              take: 80
            });

              if (crmProperties.length > 0) {
                scrapeResult = {
                  status: 'PARTIAL',
                  warning: `${scrapeResult.warning || 'No precise external listings'} | fallback=crm-properties`,
                  listings: crmProperties.map((p: any) => ({
                    sourceListingId: `crm-${p.id}`,
                    sourceUrl: 'crm://property',
                    listingUrl: `/immobili/${p.id}`,
                    title: p.title || `${p.address} - ${p.city}`,
                    priceText: formatEuroText(p.salePrice ?? p.rentPrice),
                    surfaceText: typeof p.surface === 'number' ? `${Math.round(p.surface)} m2` : null,
                    roomsText: typeof p.rooms === 'number' ? `${p.rooms} locali` : null,
                    floorText: typeof p.floor === 'number' ? `${p.floor} piano` : null,
                    description: p.description || null,
                    energyClass: p.energyClass || null,
                    addressText: p.address || null,
                    agencyName: 'Archivio CRM',
                    phoneVisible: null,
                    mainImageUrl: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
                    metadata: {
                      via: 'crm-fallback',
                      propertyId: p.id
                    }
                  })),
                  rawPayload: {
                    mode: 'crm-fallback',
                    originalWarning: scrapeResult.warning || null,
                    propertyCount: crmProperties.length
                  }
                };
              }
            }
          }
        }

        const savedSnapshot = await prismaAny.$transaction(async (tx: any) => {
          const createdSnapshot = await tx.zoneStreetListingSnapshot.create({
            data: {
              agencyId: scope.zone.agencyId,
              zoneId: scope.zone.id,
              groupId: scope.group.id,
              streetId: scope.street.id,
              sourceUrl: scrapeResult.sourceUrl,
              status: scrapeResult.status,
              warning: scrapeResult.warning || null,
              fetchedAt: new Date(),
              expiresAt: new Date(Date.now() + snapshotMaxAgeMs),
              rawPayload: scrapeResult.rawPayload || null
            }
          });

          const now = new Date();
          const existingRows = await tx.zoneStreetListing.findMany({
            where: { streetId: scope.street.id },
            select: { id: true, sourceListingId: true }
          });
          const existingBySourceId = new Map(
            existingRows.map((row: any) => [String(row.sourceListingId), row.id])
          );
          const seenIds = new Set<string>();

          for (const listing of Array.isArray(scrapeResult.listings) ? scrapeResult.listings : []) {
            const sourceListingId = String(listing?.sourceListingId || '').trim();
            if (!sourceListingId) continue;
            seenIds.add(sourceListingId);

            const data = {
              agencyId: scope.zone.agencyId,
              zoneId: scope.zone.id,
              groupId: scope.group.id,
              streetId: scope.street.id,
              snapshotId: createdSnapshot.id,
              sourceListingId,
              sourceUrl: scrapeResult.sourceUrl,
              listingUrl: listing.listingUrl || '',
              title: listing.title || null,
              priceText: listing.priceText || null,
              surfaceText: listing.surfaceText || null,
              roomsText: listing.roomsText || null,
              floorText: listing.floorText || null,
              description: listing.description || null,
              energyClass: listing.energyClass || null,
              addressText: listing.addressText || null,
              agencyName: listing.agencyName || null,
              phoneVisible: listing.phoneVisible || null,
              mainImageUrl: listing.mainImageUrl || null,
              isActive: true,
              lastSeenAt: now,
              metadata: listing.metadata || null
            };

            const existingId = existingBySourceId.get(sourceListingId);
            if (existingId) {
              await tx.zoneStreetListing.update({
                where: { id: existingId },
                data
              });
            } else {
              await tx.zoneStreetListing.create({
                data: {
                  ...data,
                  firstSeenAt: now
                }
              });
            }
          }

          const canDeactivateStale = scrapeResult.status !== 'FAILED' && seenIds.size > 0;
          if (existingRows.length > 0 && canDeactivateStale) {
            const staleIds = existingRows
              .map((row: any) => String(row.sourceListingId))
              .filter((sourceId: string) => !seenIds.has(sourceId));
            if (staleIds.length > 0) {
              await tx.zoneStreetListing.updateMany({
                where: {
                  streetId: scope.street.id,
                  sourceListingId: { in: staleIds }
                },
                data: {
                  isActive: false
                }
              });
            }
          }

          return createdSnapshot;
        });

        return {
          snapshot: savedSnapshot,
          warning: humanizeStreetListingWarning(scrapeResult.warning)
        };
      })()
        .finally(() => {
          zoneStreetListingRefreshLocks.delete(refreshKey);
        });

      zoneStreetListingRefreshLocks.set(refreshKey, task);
      return task;
    };

    if (shouldRefresh) {
      const activeListingsCount = snapshot
        ? await prismaAny.zoneStreetListing.count({
            where: {
              streetId: scope.street.id,
              isActive: true
            }
          })
        : 0;

      if (!forceRefresh && snapshot && activeListingsCount > 0) {
        // Serve last snapshot immediately; refresh is done in background.
        void refreshStreetListingsSnapshot().catch(() => null);
      } else {
        const refreshedData = await refreshStreetListingsSnapshot();
        snapshot = refreshedData.snapshot;
        warningMessage = refreshedData.warning;
        refreshed = true;
      }
    }

    const rawListings = await prismaAny.zoneStreetListing.findMany({
      where: {
        streetId: scope.street.id,
        isActive: true
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        sourceListingId: true,
        listingUrl: true,
        title: true,
        priceText: true,
        surfaceText: true,
        roomsText: true,
        floorText: true,
        description: true,
        addressText: true,
        agencyName: true,
        mainImageUrl: true,
        listingStatus: true,
        lastSeenAt: true,
        updatedAt: true,
        metadata: true
      }
    });

    const geoValidatedListings = filterListingsByStreetScope(rawListings, {
      streetName: scope.street.name,
      city: scope.city,
      province: scope.province,
      cap
    });
    if (geoValidatedListings.rejectedCount > 0) {
      const geoWarning = `Geo filter removed ${geoValidatedListings.rejectedCount} listing fuori zona (${geoValidatedListings.rejectedSummary || 'via/citta/cap mismatch'})`;
      warningMessage = warningMessage ? `${warningMessage} | ${geoWarning}` : geoWarning;
    }
    if (geoValidatedListings.acceptedSoftCount > 0) {
      const softWarning = `Geo soft-match accepted ${geoValidatedListings.acceptedSoftCount} listing (city/cap coherent)`;
      warningMessage = warningMessage ? `${warningMessage} | ${softWarning}` : softWarning;
    }
    const listings = geoValidatedListings.listings.map((row: any) => ({
      id: row.id,
      sourceListingId: row.sourceListingId,
      listingUrl: row.listingUrl,
      title: row.title,
      priceText: row.priceText,
      surfaceText: row.surfaceText,
      roomsText: row.roomsText,
      floorText: row.floorText,
      agencyName: row.agencyName,
      mainImageUrl: row.mainImageUrl,
      listingStatus: row.listingStatus,
      lastSeenAt: row.lastSeenAt,
      updatedAt: row.updatedAt
    }));

    res.json({
      success: true,
      data: {
        street: scope.street,
        cap,
        sourceUrl: snapshot?.sourceUrl || idealistaSourceUrl,
        refreshed,
        refreshQueued: Boolean(shouldRefresh && !forceRefresh && snapshot && !refreshed),
        snapshot: snapshot
          ? {
              id: snapshot.id,
              status: snapshot.status,
              warning: snapshot.warning || null,
              fetchedAt: snapshot.fetchedAt,
              expiresAt: snapshot.expiresAt
            }
          : null,
        warning: humanizeStreetListingWarning(warningMessage),
        listings
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: String(error?.message || 'Error loading street listings')
    });
  }
});

app.get('/api/agent-zones/street-listings/:listingId', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const listingId = String(req.params.listingId || '').trim();
    if (!listingId) return res.status(400).json({ success: false, message: 'listingId is required' });
    const prismaAny = prisma as any;

    const listing = await prismaAny.zoneStreetListing.findUnique({
      where: { id: listingId },
      include: {
        zone: { select: { id: true, agencyId: true, region: true, province: true, city: true, zone: true } },
        group: { select: { id: true, groupIndex: true, name: true } },
        street: { select: { id: true, name: true } }
      }
    });
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && listing.zone.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    let canWrite = isAdminRole(auth.role);
    if (!isAdminRole(auth.role)) {
      const canRead = await prismaAny.zoneAssignment.findFirst({
        where: {
          zoneId: listing.zoneId,
          groupId: listing.groupId,
          assignmentType: 'GROUP',
          agentId: auth.id
        },
        select: { id: true }
      });
      if (!canRead) return res.status(403).json({ success: false, message: 'Forbidden' });
      const active = await prismaAny.zoneAssignment.findFirst({
        where: {
          zoneId: listing.zoneId,
          groupId: listing.groupId,
          assignmentType: 'GROUP',
          agentId: auth.id,
          isActive: true
        },
        select: { id: true }
      });
      canWrite = Boolean(active);
    }

    const actions = await prismaAny.zoneStreetListingAction.findMany({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });
    const assignmentHistory = await prismaAny.zoneStreetListingAssignmentHistory.findMany({
      where: { listingId },
      orderBy: { assignedAt: 'desc' },
      include: {
        fromAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
        toAgent: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });

    res.json({
      success: true,
      data: {
        canWrite,
        listing: {
          id: listing.id,
          sourceListingId: listing.sourceListingId,
          listingUrl: listing.listingUrl,
          title: listing.title,
          priceText: listing.priceText,
          surfaceText: listing.surfaceText,
          roomsText: listing.roomsText,
          floorText: listing.floorText,
          description: listing.description,
          energyClass: listing.energyClass,
          addressText: listing.addressText,
          agencyName: listing.agencyName,
          phoneVisible: listing.phoneVisible,
          mainImageUrl: listing.mainImageUrl,
          listingStatus: listing.listingStatus,
          lastSeenAt: listing.lastSeenAt,
          updatedAt: listing.updatedAt,
          zone: listing.zone,
          group: listing.group,
          street: listing.street
        },
        actions: actions.map((row: any) => ({
          id: row.id,
          actionType: row.actionType,
          title: row.title || null,
          content: row.content,
          outcome: row.outcome || null,
          nextActionAt: row.nextActionAt || null,
          metadata: row.metadata || null,
          createdAt: row.createdAt,
          createdBy: row.createdBy
        })),
        assignmentHistory: assignmentHistory.map((h: any) => ({
          id: h.id,
          assignedAt: h.assignedAt,
          note: h.note || null,
          fromAgent: h.fromAgent || null,
          toAgent: h.toAgent,
          metadata: h.metadata || null
        }))
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: String(error?.message || 'Error loading listing detail') });
  }
});

app.post('/api/agent-zones/street-listings/:listingId/actions', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const listingId = String(req.params.listingId || '').trim();
    if (!listingId) return res.status(400).json({ success: false, message: 'listingId is required' });

    const actionTypeRaw = req.body?.actionType != null ? String(req.body.actionType).toUpperCase() : 'NOTE';
    const actionType = ['CALL', 'VISIT_SET', 'RECALL', 'NOTE', 'STATUS', 'HANDOVER'].includes(actionTypeRaw)
      ? actionTypeRaw
      : 'NOTE';
    const title = req.body?.title != null ? String(req.body.title).trim() : '';
    const content = req.body?.content != null ? String(req.body.content).trim() : '';
    const outcome = req.body?.outcome != null ? String(req.body.outcome).trim() : '';
    const nextActionAtRaw = req.body?.nextActionAt != null ? String(req.body.nextActionAt).trim() : '';
    const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : null;
    if (!content) return res.status(400).json({ success: false, message: 'content is required' });

    const prismaAny = prisma as any;
    const listing = await prismaAny.zoneStreetListing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        agencyId: true,
        zoneId: true,
        groupId: true,
        streetId: true,
        title: true,
        addressText: true,
        listingUrl: true
      }
    });
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && listing.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (!isAdminRole(auth.role)) {
      const activeAssignment = await prismaAny.zoneAssignment.findFirst({
        where: {
          zoneId: listing.zoneId,
          groupId: listing.groupId,
          assignmentType: 'GROUP',
          agentId: auth.id,
          isActive: true
        },
        select: { id: true }
      });
      if (!activeAssignment) return res.status(403).json({ success: false, message: "Solo l'agente assegnato puo scrivere su questo immobile" });
    }

    const nextActionAt = nextActionAtRaw ? new Date(nextActionAtRaw) : null;
    const validNextActionAt = nextActionAt && !Number.isNaN(nextActionAt.getTime()) ? nextActionAt : null;

    let followUpAssigneeId = auth.id;
    if (isAdminRole(auth.role)) {
      const activeAssignment = await prismaAny.zoneAssignment.findFirst({
        where: {
          zoneId: listing.zoneId,
          groupId: listing.groupId || undefined,
          assignmentType: 'GROUP',
          isActive: true
        },
        orderBy: { updatedAt: 'desc' },
        select: { agentId: true }
      });
      if (activeAssignment?.agentId) {
        followUpAssigneeId = activeAssignment.agentId;
      }
    }

    const txResult = await prisma.$transaction(async (tx) => {
      const createdAction = await (tx as any).zoneStreetListingAction.create({
        data: {
          agencyId: listing.agencyId,
          zoneId: listing.zoneId,
          groupId: listing.groupId,
          streetId: listing.streetId,
          listingId: listing.id,
          createdById: auth.id,
          actionType,
          title: title || null,
          content,
          outcome: outcome || null,
          nextActionAt: validNextActionAt,
          metadata: metadata || null
        },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true } }
        }
      });

      let createdActivity: any = null;
      let createdAppointment: any = null;

      if (validNextActionAt) {
        const appointmentStart = new Date(validNextActionAt);
        const appointmentEnd = new Date(validNextActionAt.getTime() + 30 * 60 * 1000);
        const listingLabel = (listing.title || '').trim() || `Immobile zona ${listing.id}`;
        const actionLabel = (title || '').trim() || (content.length > 80 ? `${content.slice(0, 80)}...` : content);
        const sourceNote = `Azione zona: ${actionType}`;

        createdActivity = await tx.activity.create({
          data: {
            type: 'TASK',
            title: `Task zona · ${listingLabel}`,
            description: [
              `Prossima azione: ${actionLabel}`,
              sourceNote,
              outcome ? `Esito: ${outcome}` : null,
              listing.addressText ? `Indirizzo: ${listing.addressText}` : null,
              listing.listingUrl ? `Link annuncio: ${listing.listingUrl}` : null
            ]
              .filter(Boolean)
              .join('\n'),
            dueDate: validNextActionAt,
            priority: 2,
            tags: ['ZONE_NEXT_ACTION', 'TASK_ZONA'],
            agencyId: listing.agencyId,
            assignedToId: followUpAssigneeId,
            report: JSON.stringify({
              source: 'ZONE_LISTING_ACTION',
              listingId: listing.id,
              listingActionId: createdAction.id
            })
          }
        });

        createdAppointment = await tx.appointment.create({
          data: {
            title: `Azione zona · ${listingLabel}`,
            description: [
              `Prossima azione: ${actionLabel}`,
              sourceNote,
              outcome ? `Esito: ${outcome}` : null
            ]
              .filter(Boolean)
              .join('\n'),
            startTime: appointmentStart,
            endTime: appointmentEnd,
            location: listing.addressText || null,
            status: 'SCHEDULED',
            reminder: true,
            reminderSent: false,
            notes: JSON.stringify({
              source: 'ZONE_LISTING_ACTION',
              listingId: listing.id,
              listingActionId: createdAction.id,
              activityId: createdActivity.id
            }),
            agencyId: listing.agencyId,
            assignedToId: followUpAssigneeId
          }
        });
      }

      return {
        action: createdAction,
        activityId: createdActivity?.id || null,
        appointmentId: createdAppointment?.id || null
      };
    });

    if (txResult.activityId && txResult.appointmentId) {
      await createNotificationRecord({
        agencyId: listing.agencyId,
        recipientId: followUpAssigneeId,
        type: 'ZONE_TASK_ASSIGNED',
        title: 'Nuova prossima azione task zona',
        message: `Hai una prossima azione pianificata per ${txResult.action.title || listing.title || 'immobile zona'}`,
        data: {
          listingId: listing.id,
          listingTitle: listing.title || null,
          listingActionId: txResult.action.id,
          activityId: txResult.activityId,
          appointmentId: txResult.appointmentId,
          nextActionAt: validNextActionAt?.toISOString() || null
        }
      });
    }

    res.status(201).json({
      success: true,
      data: {
        id: txResult.action.id,
        actionType: txResult.action.actionType,
        title: txResult.action.title,
        content: txResult.action.content,
        outcome: txResult.action.outcome,
        nextActionAt: txResult.action.nextActionAt,
        metadata: txResult.action.metadata,
        createdAt: txResult.action.createdAt,
        createdBy: txResult.action.createdBy,
        activityId: txResult.activityId,
        appointmentId: txResult.appointmentId
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: String(error?.message || 'Error creating listing action') });
  }
});

app.patch('/api/agent-zones/street-listings/:listingId/status', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const listingId = String(req.params.listingId || '').trim();
    if (!listingId) return res.status(400).json({ success: false, message: 'listingId is required' });
    const listingStatusRaw = req.body?.listingStatus != null ? String(req.body.listingStatus).toUpperCase() : '';
    const allowed = ['NEW', 'IN_PROGRESS', 'CONTACTED', 'VISIT_BOOKED', 'CLOSED', 'DISMISSED'];
    if (!allowed.includes(listingStatusRaw)) {
      return res.status(400).json({ success: false, message: 'listingStatus is invalid' });
    }

    const prismaAny = prisma as any;
    const listing = await prismaAny.zoneStreetListing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        agencyId: true,
        zoneId: true,
        groupId: true,
        streetId: true,
        title: true,
        listingUrl: true,
        listingStatus: true
      }
    });
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && listing.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (!isAdminRole(auth.role)) {
      const activeAssignment = await prismaAny.zoneAssignment.findFirst({
        where: {
          zoneId: listing.zoneId,
          groupId: listing.groupId,
          assignmentType: 'GROUP',
          agentId: auth.id,
          isActive: true
        },
        select: { id: true }
      });
      if (!activeAssignment) return res.status(403).json({ success: false, message: "Solo l'agente assegnato puo aggiornare lo stato" });
    }

    const updated = await prismaAny.zoneStreetListing.update({
      where: { id: listingId },
      data: { listingStatus: listingStatusRaw, updatedAt: new Date() },
      select: { id: true, listingStatus: true, updatedAt: true }
    });

    try {
      await prismaAny.zoneStreetListingAction.create({
        data: {
          agencyId: listing.agencyId,
          zoneId: listing.zoneId,
          groupId: listing.groupId,
          streetId: listing.streetId,
          listingId: listing.id,
          createdById: auth.id,
          actionType: 'STATUS',
          title: `Cambio stato immobile · ${listing.title || listing.id}`,
          content: `Stato immobile aggiornato da ${listing.listingStatus} a ${listingStatusRaw}.`,
          outcome: listingStatusRaw,
          metadata: {
            kind: 'AGENT_TRACE',
            traceEvent: 'ZONE_LISTING_STATUS_CHANGE',
            oldStatus: listing.listingStatus,
            newStatus: listingStatusRaw,
            listingTitle: listing.title || null,
            listingUrl: listing.listingUrl || null
          }
        }
      });
    } catch (traceError) {
      console.error('Error creating listing status trace action:', traceError);
    }

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: String(error?.message || 'Error updating listing status') });
  }
});

app.post('/api/agent-zones/assign-cap-group', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const prismaAny = prisma as any;
    const agentId = req.body?.agentId != null ? String(req.body.agentId).trim() : '';
    const region = req.body?.region != null ? String(req.body.region).trim() : '';
    const province = req.body?.province != null ? String(req.body.province).trim() : '';
    const city = req.body?.city != null ? String(req.body.city).trim() : '';
    const cap = req.body?.cap != null ? String(req.body.cap).trim() : '';
    const groupIndex = Number(req.body?.groupIndex || 0);
    const note = req.body?.note != null ? String(req.body.note) : undefined;
    if (!agentId || !region || !province || !city || !cap || !groupIndex) {
      return res.status(400).json({ success: false, message: 'agentId, region, province, city, cap, groupIndex are required' });
    }

    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, agencyId: true, role: true, isActive: true, firstName: true, lastName: true }
    });
    if (!agent || !agent.isActive || agent.role !== 'AGENT') {
      return res.status(400).json({ success: false, message: 'Invalid agentId' });
    }

    const capCatalog = loadPescaraCapCatalog();
    const capItem = capCatalog.find((it: any) => String(it?.cap || '') === cap);
    if (!capItem) return res.status(404).json({ success: false, message: 'CAP not found in catalog' });
    const capGroups = Array.isArray(capItem.groups) ? capItem.groups : [];
    const capGroup = capGroups.find((g: any) => Number(g.groupIndex || 0) === groupIndex);
    if (!capGroup) return res.status(404).json({ success: false, message: 'Group not found for selected CAP' });

    const agencyId = await resolveAgencyIdForAdminAction(auth, agentId);
    if (!agencyId) return res.status(400).json({ success: false, message: 'Agency not found' });
    if (agent.agencyId !== agencyId) {
      return res.status(400).json({ success: false, message: 'Agent does not belong to this agency' });
    }

    let zone = await prismaAny.agentZone.findFirst({
      where: {
        agencyId,
        region,
        province,
        city,
        zone: zoneLabelFromCap(cap)
      }
    });

    if (!zone) {
      zone = await prismaAny.agentZone.create({
        data: {
          agencyId,
          agentId,
          region,
          province,
          city,
          zone: zoneLabelFromCap(cap),
          groupSize: Number(capItem.groupSizeSuggested || 20),
          notes: `Zona CAP ${cap}`
        }
      });
    }

    const streetsCount = await prismaAny.zoneStreet.count({ where: { zoneId: zone.id } });
    const groupsCount = await prismaAny.zoneStreetGroup.count({ where: { zoneId: zone.id } });
    const shouldImportCap = streetsCount === 0 || groupsCount === 0 || zone.sourceUrl !== String(capItem.sourceUrl || '');

    if (shouldImportCap) {
      const streets = Array.from(
        new Set(
          (Array.isArray(capItem.streets) ? capItem.streets : [])
            .map((s: any) => sanitizeStreetName(String(s || '')))
            .filter((s: string) => s.length > 2)
        )
      ).sort((a: string, b: string) => a.localeCompare(b, 'it'));
      const effectiveGroupSize = Math.max(1, Math.min(200, Number(capItem.groupSizeSuggested || zone.groupSize || 20)));

      await prismaAny.$transaction(async (tx: any) => {
        await tx.zoneStreetGroupMember.deleteMany({ where: { group: { zoneId: zone.id } } });
        await tx.zoneStreetGroup.deleteMany({ where: { zoneId: zone.id } });
        await tx.zoneAssignment.updateMany({
          where: { zoneId: zone.id, isActive: true },
          data: { isActive: false }
        });
        await tx.zoneStreet.deleteMany({ where: { zoneId: zone.id } });
        await tx.zoneStreet.createMany({
          data: streets.map((name: string, index: number) => ({
            agencyId: zone.agencyId,
            zoneId: zone.id,
            name,
            normalizedName: normalizeStreetName(name),
            orderIndex: index
          }))
        });
        await tx.agentZone.update({
          where: { id: zone.id },
          data: {
            sourceUrl: String(capItem.sourceUrl || ''),
            importStatus: 'SUCCESS',
            lastImportedAt: new Date(),
            groupSize: effectiveGroupSize
          }
        });
      });
      await regenerateZoneGroups(zone, effectiveGroupSize);
    }

    const group = await prismaAny.zoneStreetGroup.findFirst({
      where: { zoneId: zone.id, groupIndex },
      select: { id: true, name: true, groupIndex: true }
    });
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found in zone mapping' });
    }

    const alreadyAssigned = await prismaAny.zoneAssignment.findFirst({
      where: { zoneId: zone.id, groupId: group.id, isActive: true, assignmentType: 'GROUP' },
      include: { agent: { select: { id: true, firstName: true, lastName: true } } }
    });

    let reassignFrom: { agentId: string; agentName: string } | null = null;

    if (alreadyAssigned && alreadyAssigned.agentId === agentId) {
      return res.json({
        success: true,
        message: 'Group already assigned to selected agent',
        data: alreadyAssigned
      });
    }
    const created = await prismaAny.$transaction(async (tx: any) => {
      if (alreadyAssigned && alreadyAssigned.agentId !== agentId) {
        await pruneInactiveGroupAssignments(tx, zone.id, group.id, alreadyAssigned.id);
        reassignFrom = {
          agentId: String(alreadyAssigned.agent.id),
          agentName: `${alreadyAssigned.agent.firstName} ${alreadyAssigned.agent.lastName}`.trim()
        };
        await tx.zoneAssignment.update({
          where: { id: alreadyAssigned.id },
          data: { isActive: false, note: 'Riassegnazione gruppo da admin' }
        });
        await tx.zoneGroupWorkLog.create({
          data: {
            agencyId: zone.agencyId,
            zoneId: zone.id,
            groupId: group.id,
            createdById: auth.id,
            entryType: 'HANDOVER',
            title: 'Passaggio consegne',
            content: `Gruppo riassegnato da ${reassignFrom.agentName} a ${agent.firstName} ${agent.lastName}`.trim(),
            metadata: {
              fromAgentId: reassignFrom.agentId,
              toAgentId: agent.id
            }
          }
        });
      }
      const createdAssignment = await tx.zoneAssignment.create({
        data: {
          agencyId: zone.agencyId,
          zoneId: zone.id,
          agentId,
          assignmentType: 'GROUP',
          groupId: group.id,
          note: note || null
        },
        include: {
          agent: { select: { id: true, firstName: true, lastName: true, email: true } },
          group: { select: { id: true, name: true, groupIndex: true } }
        }
      });
      if (reassignFrom) {
        const activeListings = await tx.zoneStreetListing.findMany({
          where: {
            zoneId: zone.id,
            groupId: group.id,
            isActive: true
          },
          select: { id: true, streetId: true }
        });
        if (activeListings.length > 0) {
          await tx.zoneStreetListingAssignmentHistory.createMany({
            data: activeListings.map((row: any) => ({
              agencyId: zone.agencyId,
              zoneId: zone.id,
              groupId: group.id,
              streetId: row.streetId,
              listingId: row.id,
              fromAgentId: reassignFrom?.agentId || null,
              toAgentId: agentId,
              assignedAt: new Date(),
              note: 'Riassegnazione gruppo con storico',
              metadata: {
                cap,
                groupIndex
              }
            }))
          });
        }
      }
      return createdAssignment;
    });

    await createNotificationRecord({
      agencyId: zone.agencyId,
      recipientId: agentId,
      type: reassignFrom ? 'ZONE_GROUP_REASSIGNED' : 'ZONE_GROUP_ASSIGNED',
      title: reassignFrom ? 'Nuovo gruppo riassegnato' : 'Nuovo gruppo assegnato',
      message: reassignFrom
        ? `Ti e stato riassegnato ${group.name} (${zoneLabelFromCap(cap)}). E disponibile lo storico lavorazioni del precedente agente.`
        : `Ti e stato assegnato ${group.name} (${zoneLabelFromCap(cap)}).`,
      data: {
        zoneId: zone.id,
        assignmentId: created.id,
        cap,
        groupIndex,
        groupName: group.name,
        fromAgentId: reassignFrom?.agentId || null,
        fromAgentName: reassignFrom?.agentName || null
      }
    });

    res.status(201).json({
      success: true,
      data: {
        zoneId: zone.id,
        cap,
        groupIndex,
        handover: reassignFrom,
        assignment: created
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error assigning CAP group' });
  }
});

app.post('/api/agent-zones/:zoneId/groups/regenerate', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const prismaAny = prisma as any;
    const { zoneId } = req.params;
    const groupSize = Number(req.body?.groupSize || 20);
    if (!Number.isFinite(groupSize) || groupSize < 1) {
      return res.status(400).json({ success: false, message: 'Invalid groupSize' });
    }
    const zone = await prismaAny.agentZone.findUnique({ where: { id: zoneId } });
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && zone.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const grouping = await regenerateZoneGroups(zone, groupSize);
    res.json({
      success: true,
      data: {
        groupSize: grouping.groupSize,
        groupCount: grouping.groups.length,
        groups: grouping.groups
      }
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: String(error?.message || 'Error regenerating groups') });
  }
});

app.post('/api/agent-zones/:zoneId/assignments', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const prismaAny = prisma as any;
    const { zoneId } = req.params;
    const assignmentTypeRaw = req.body?.assignmentType != null ? String(req.body.assignmentType).toUpperCase() : '';
    const assignmentType = assignmentTypeRaw === 'GROUP' ? 'GROUP' : assignmentTypeRaw === 'STREET' ? 'STREET' : '';
    const agentId = req.body?.agentId != null ? String(req.body.agentId).trim() : '';
    const groupId = req.body?.groupId != null ? String(req.body.groupId).trim() : '';
    const streetId = req.body?.streetId != null ? String(req.body.streetId).trim() : '';
    const note = req.body?.note != null ? String(req.body.note) : undefined;

    if (!assignmentType || !agentId) {
      return res.status(400).json({ success: false, message: 'assignmentType and agentId are required' });
    }
    if (assignmentType === 'GROUP' && !groupId) {
      return res.status(400).json({ success: false, message: 'groupId is required for GROUP assignment' });
    }
    if (assignmentType === 'STREET' && !streetId) {
      return res.status(400).json({ success: false, message: 'streetId is required for STREET assignment' });
    }

    const zone = await prismaAny.agentZone.findUnique({ where: { id: zoneId } });
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && zone.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const streetCount = await prismaAny.zoneStreet.count({ where: { zoneId } });
    if (streetCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Zone has no streets mapped. Import streets before creating assignments.'
      });
    }

    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, agencyId: true, role: true, isActive: true }
    });
    if (!agent || !agent.isActive || agent.role !== 'AGENT') {
      return res.status(400).json({ success: false, message: 'Invalid agentId' });
    }
    if (agent.agencyId !== zone.agencyId) {
      return res.status(400).json({ success: false, message: 'Agent does not belong to zone agency' });
    }

    let candidateStreetIds: string[] = [];
    if (assignmentType === 'GROUP') {
      const group = await prismaAny.zoneStreetGroup.findUnique({
        where: { id: groupId },
        select: { id: true, zoneId: true }
      });
      if (!group || group.zoneId !== zoneId) {
        return res.status(400).json({ success: false, message: 'Invalid groupId for zone' });
      }
      candidateStreetIds = await collectAssignedStreetIdsForGroup(groupId);
    } else {
      const street = await prismaAny.zoneStreet.findUnique({
        where: { id: streetId },
        select: { id: true, zoneId: true }
      });
      if (!street || street.zoneId !== zoneId) {
        return res.status(400).json({ success: false, message: 'Invalid streetId for zone' });
      }
      candidateStreetIds = [streetId];
    }

    const activeAssignments = await prismaAny.zoneAssignment.findMany({
      where: {
        zoneId,
        isActive: true
      },
      include: {
        group: {
          include: {
            members: { select: { streetId: true } }
          }
        }
      }
    });

    for (const existing of activeAssignments) {
      let coveredStreetIds: string[] = [];
      if (existing.assignmentType === 'STREET' && existing.streetId) {
        coveredStreetIds = [String(existing.streetId)];
      } else if (existing.assignmentType === 'GROUP' && existing.group?.members) {
        coveredStreetIds = existing.group.members.map((m: any) => String(m.streetId));
      }
      const hasOverlap = coveredStreetIds.some((id: string) => candidateStreetIds.includes(id));
      if (hasOverlap && existing.agentId !== agentId) {
        return res.status(409).json({
          success: false,
          message: 'Conflict: one or more streets are already assigned to another agent'
        });
      }
    }

    const created = await prismaAny.zoneAssignment.create({
      data: {
        agencyId: zone.agencyId,
        zoneId,
        agentId,
        assignmentType,
        groupId: assignmentType === 'GROUP' ? groupId : null,
        streetId: assignmentType === 'STREET' ? streetId : null,
        note: note || null
      },
      include: {
        agent: { select: { id: true, firstName: true, lastName: true, email: true } },
        group: { select: { id: true, name: true, groupIndex: true } },
        street: { select: { id: true, name: true } }
      }
    });

    const targetLabel =
      created.assignmentType === 'GROUP'
        ? created.group?.name || 'gruppo'
        : created.street?.name || 'via';

    await createNotificationRecord({
      agencyId: zone.agencyId,
      recipientId: agentId,
      type: 'ZONE_ASSIGNMENT_ASSIGNED',
      title: 'Nuovo task zona assegnato',
      message: `Ti e stato assegnato ${targetLabel} nella zona ${zone.zone}.`,
      data: {
        zoneId: zone.id,
        assignmentId: created.id,
        assignmentType: created.assignmentType,
        groupId: created.group?.id || null,
        groupName: created.group?.name || null,
        streetId: created.street?.id || null,
        streetName: created.street?.name || null
      }
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error creating assignment' });
  }
});

app.get('/api/agent-zones/:zoneId/assignments', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const prismaAny = prisma as any;
    const { zoneId } = req.params;
    const zone = await prismaAny.agentZone.findUnique({ where: { id: zoneId } });
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && zone.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (!isAdminRole(auth.role) && zone.agentId !== auth.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const assignments = await prismaAny.zoneAssignment.findMany({
      where: {
        zoneId,
        isActive: true,
        ...(isAdminRole(auth.role) ? {} : { agentId: auth.id })
      },
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { id: true, firstName: true, lastName: true, email: true } },
        group: {
          select: {
            id: true,
            name: true,
            groupIndex: true,
            members: {
              select: {
                position: true,
                street: {
                  select: { id: true, name: true }
                }
              },
              orderBy: { position: 'asc' }
            }
          }
        },
        street: { select: { id: true, name: true } }
      }
    });
    res.json({ success: true, data: assignments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error loading assignments' });
  }
});

app.delete('/api/agent-zones/:zoneId/assignments/:assignmentId', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const prismaAny = prisma as any;
    const { zoneId, assignmentId } = req.params;

    const zone = await prismaAny.agentZone.findUnique({ where: { id: zoneId } });
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && zone.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const assignment = await prismaAny.zoneAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, zoneId: true, agencyId: true, isActive: true }
    });
    if (!assignment || assignment.zoneId !== zoneId) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }
    if (auth.agencyId && auth.role !== 'SUPER_ADMIN' && assignment.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await prismaAny.zoneAssignment.update({
      where: { id: assignmentId },
      data: { isActive: false }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting assignment' });
  }
});

type GeoLocationRow = {
  region: string;
  province: string;
  city: string;
  zone: string;
};

let cachedGeoLocations: GeoLocationRow[] | null = null;
let cachedPescaraCapCatalog: any[] | null = null;
const zoneStreetListingScrapeLocks = new Map<string, Promise<any>>();
const zoneStreetListingRefreshLocks = new Map<string, Promise<any>>();

async function resolveStreetScopeForZoneTask(params: {
  prismaAny: any;
  auth: any;
  cap: string;
  region: string;
  province: string;
  city: string;
  groupIndex: number;
  streetId: string;
}) {
  const { prismaAny, auth, cap, region, province, city, groupIndex, streetId } = params;
  const agencyId = isAdminRole(auth.role)
    ? await resolveAgencyIdForAdminAction(auth)
    : auth.agencyId || null;
  if (!agencyId) {
    return { success: false, status: 400, message: 'Agency not found' };
  }
  const resolved = await resolveZoneScope({
    prismaAny,
    agencyId,
    identity: {
      zoneKind: 'legacy_cap',
      cap,
      region,
      province,
      city
    }
  });
  const zone = resolved.zone;
  if (!zone) return { success: false, status: 404, message: 'Zone not found' };
  const group = await prismaAny.zoneStreetGroup.findFirst({
    where: { zoneId: zone.id, groupIndex },
    select: { id: true, name: true, groupIndex: true }
  });
  if (!group) return { success: false, status: 404, message: 'Group not found in zone mapping' };
  const member = await prismaAny.zoneStreetGroupMember.findFirst({
    where: { groupId: group.id, streetId },
    include: { street: { select: { id: true, name: true } } }
  });
  if (!member || !member.street) {
    return { success: false, status: 404, message: 'Street not found in selected group' };
  }
  if (!isAdminRole(auth.role)) {
    const canRead = await prismaAny.zoneAssignment.findFirst({
      where: { zoneId: zone.id, groupId: group.id, assignmentType: 'GROUP', agentId: auth.id },
      select: { id: true }
    });
    if (!canRead) return { success: false, status: 403, message: 'Forbidden' };
  }
  return {
    success: true,
    zone,
    group,
    street: member.street,
    cap,
    region,
    province,
    city
  };
}

const loadGeoLocations = () => {
  if (cachedGeoLocations) return cachedGeoLocations;
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const candidates = [
    path.resolve(process.cwd(), 'zone.csv'),
    path.resolve(process.cwd(), 'data', 'zone.csv'),
    path.resolve(process.cwd(), 'packages', 'backend', 'data', 'zone.csv'),
    path.resolve(__dirname, '..', 'data', 'zone.csv'),
    path.resolve(__dirname, '..', '..', '..', 'zone.csv')
  ];
  const csvPath = candidates.find((p) => fs.existsSync(p));
  const rows: GeoLocationRow[] = [];
  if (csvPath) {
    const raw = fs.readFileSync(csvPath, 'utf8');
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cols: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (ch === '"') {
          if (inQuotes && j + 1 < line.length && line[j + 1] === '"') {
            current += '"';
            j++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          cols.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      cols.push(current);
      if (cols.length < 5) continue;
      const region = cols[1]?.trim();
      const province = cols[2]?.trim();
      const city = cols[3]?.trim();
      const zone = cols[4]?.trim();
      if (!region || !province || !city) continue;
      rows.push({ region, province, city, zone });
    }
  }
  if (rows.length === 0) {
    const capCatalog = loadPescaraCapCatalog();
    const seen = new Set<string>();
    for (const item of capCatalog) {
      const region = String(item?.region || '').trim();
      const province = String(item?.province || '').trim();
      const city = String(item?.city || '').trim();
      if (!region || !province || !city) continue;
      const key = `${region}|${province}|${city}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ region, province, city, zone: '' });
    }
  }
  cachedGeoLocations = rows;
  return cachedGeoLocations;
};

const loadPescaraCapCatalog = () => {
  if (cachedPescaraCapCatalog) return cachedPescaraCapCatalog;
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const candidates = [
    path.resolve(process.cwd(), 'data', 'pescara-caps.json'),
    path.resolve(process.cwd(), 'packages', 'backend', 'data', 'pescara-caps.json'),
    path.resolve(__dirname, '..', 'data', 'pescara-caps.json')
  ];
  const jsonPath = candidates.find((p) => fs.existsSync(p));
  if (!jsonPath) {
    cachedPescaraCapCatalog = [];
    return cachedPescaraCapCatalog;
  }
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    cachedPescaraCapCatalog = items;
    return cachedPescaraCapCatalog;
  } catch {
    cachedPescaraCapCatalog = [];
    return cachedPescaraCapCatalog;
  }
};

const slugifyForUrl = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const decodeHtmlText = (value: string) =>
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim();

const idealistaSlug = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeSpace = (value: string) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeGeoToken = (value: string) =>
  normalizeSpace(String(value || ''))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stripStreetPrefix = (value: string) =>
  normalizeGeoToken(value).replace(
    /^(via|viale|piazza|corso|largo|strada|vicolo|salita|lungomare|contrada|traversa)\s+/i,
    ''
  );

const extractFiveDigitCaps = (text: string) => {
  const matches = String(text || '').match(/\b\d{5}\b/g) || [];
  return Array.from(new Set(matches));
};

const STREET_TOKEN_STOPWORDS = new Set([
  'via',
  'viale',
  'piazza',
  'corso',
  'largo',
  'strada',
  'vicolo',
  'salita',
  'lungomare',
  'contrada',
  'traversa',
  'di',
  'del',
  'della',
  'dello',
  'dei',
  'degli',
  'delle',
  'da',
  'la',
  'le',
  'il',
  'lo'
]);

const tokenizeStreet = (streetName: string) =>
  normalizeGeoToken(streetName)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STREET_TOKEN_STOPWORDS.has(token));

const buildListingAddressEvidenceText = (listing: any) => {
  const metadata = listing?.metadata && typeof listing.metadata === 'object' ? listing.metadata : {};
  const sourceVia = String(metadata?.via || '').toLowerCase();
  const listingUrl = String(listing?.listingUrl || '').toLowerCase();
  const isNestoriaDerived =
    sourceVia.includes('nestoria') ||
    listingUrl.includes('nestoria-it-') ||
    (listingUrl.includes('clk.thribee.com') && listingUrl.includes('adid=nestoria-it-'));
  const detailAddressText = String(metadata?.detailAddressText || '').trim();
  if (isNestoriaDerived && !detailAddressText) {
    return '';
  }
  if (detailAddressText) {
    return normalizeGeoToken(detailAddressText);
  }
  return normalizeGeoToken(
    [
      listing?.addressText,
      metadata?.locationText,
      metadata?.subtitle
    ]
      .filter(Boolean)
      .join(' ')
  );
};

const buildListingGeoEvidenceText = (listing: any) => {
  const metadata = listing?.metadata && typeof listing.metadata === 'object' ? listing.metadata : {};
  return normalizeGeoToken(
    [
      listing?.title,
      listing?.description,
      listing?.addressText,
      listing?.agencyName,
      metadata?.keywords,
      metadata?.locationText,
      metadata?.subtitle,
      metadata?.geoText
    ]
      .filter(Boolean)
      .join(' ')
  );
};

const hasProvinceConflictInEvidence = (evidenceText: string, provinceNorm: string, cityMatch: boolean) => {
  if (!provinceNorm) return false;
  return (
    (evidenceText.includes(' padova ') ||
      evidenceText.includes(' milano ') ||
      evidenceText.includes(' roma ') ||
      evidenceText.includes(' teramo ') ||
      evidenceText.includes(' pescara ') ||
      evidenceText.includes(' chieti ')) &&
    !evidenceText.includes(` ${provinceNorm} `) &&
    !cityMatch
  );
};

const isListingInsideStreetScope = (
  listing: any,
  scope: { streetName: string; city: string; province: string; cap: string }
) => {
  const streetNorm = normalizeGeoToken(scope.streetName);
  const streetCore = stripStreetPrefix(scope.streetName);
  const cityNorm = normalizeGeoToken(scope.city);
  const provinceNorm = normalizeGeoToken(scope.province);
  const streetSlug = idealistaSlug(scope.streetName);

  const addressEvidence = buildListingAddressEvidenceText(listing);
  const textualEvidence = buildListingGeoEvidenceText(listing);
  const primaryEvidence = normalizeGeoToken(
    [listing?.title, listing?.addressText]
      .filter(Boolean)
      .join(' ')
  );
  const fullText = normalizeGeoToken(
    [listing?.title, listing?.description, listing?.addressText, listing?.agencyName, listing?.listingUrl]
      .filter(Boolean)
      .join(' ')
  );
  const streetTokens = tokenizeStreet(scope.streetName);
  const metadata = listing?.metadata && typeof listing.metadata === 'object' ? listing.metadata : {};
  const sourceVia = String(metadata?.via || '').toLowerCase();
  const listingUrl = String(listing?.listingUrl || '').toLowerCase();
  const isNestoriaDerived =
    sourceVia.includes('nestoria') ||
    listingUrl.includes('nestoria-it-') ||
    (listingUrl.includes('clk.thribee.com') && listingUrl.includes('adid=nestoria-it-'));
  const detailAddressText = String(metadata?.detailAddressText || '').trim();

  const listedCaps = extractFiveDigitCaps(
    [listing?.addressText, listing?.title, listing?.description, listing?.listingUrl]
      .filter(Boolean)
      .join(' ')
  );
  const hasCapEvidence = listedCaps.length > 0;
  const capMismatch = hasCapEvidence && !listedCaps.includes(scope.cap);

  const strongCityMatch =
    cityNorm.length > 0 && primaryEvidence.includes(cityNorm);

  // City match must be based on street-address evidence (not generic title/description context).
  const cityMatch =
    cityNorm.length > 0 && (addressEvidence.includes(cityNorm) || (hasCapEvidence && !capMismatch));

  const tokenMatches = streetTokens.filter((token) => addressEvidence.includes(token));
  const hasTokenFallbackMatch =
    streetTokens.length >= 2
      ? tokenMatches.length >= 2
      : streetTokens.length === 1
        ? tokenMatches.length === 1
        : false;

  const streetMatch =
    (streetNorm.length > 0 && addressEvidence.includes(streetNorm)) ||
    (streetCore.length > 2 && addressEvidence.includes(streetCore)) ||
    hasTokenFallbackMatch;
  const titleNorm = normalizeGeoToken(String(listing?.title || ''));
  const titleHasStreetPrefix = /(^|\s)(via|viale|piazza|corso|largo|strada|vicolo|salita|lungomare|contrada|traversa)\s/.test(
    titleNorm
  );
  const titleHasTargetStreetToken = streetTokens.some((token) => titleNorm.includes(token));

  const provinceConflict = hasProvinceConflictInEvidence(fullText, provinceNorm, cityMatch);
  const primaryProvinceConflict = hasProvinceConflictInEvidence(primaryEvidence, provinceNorm, strongCityMatch);

  if (isNestoriaDerived && !detailAddressText) {
    return { ok: false, reason: 'Missing validated detail address' };
  }
  if (isNestoriaDerived && titleHasStreetPrefix && !titleHasTargetStreetToken) {
    return { ok: false, reason: 'Title street mismatch' };
  }
  if (capMismatch) return { ok: false, reason: `CAP mismatch (${listedCaps.join(',')})` };
  if (primaryProvinceConflict) return { ok: false, reason: 'Primary listing city/province conflict' };
  if (provinceConflict) return { ok: false, reason: 'Province/city conflict in listing text' };
  if (!streetMatch) return { ok: false, reason: 'Street mismatch (textual evidence)' };
  if (!cityMatch) return { ok: false, reason: 'City mismatch in address evidence' };

  return { ok: true, reason: null as string | null };
};

const isListingInsideStreetScopeSoft = (
  listing: any,
  scope: { streetName: string; city: string; province: string; cap: string }
) => {
  const cityNorm = normalizeGeoToken(scope.city);
  const provinceNorm = normalizeGeoToken(scope.province);
  const citySlug = idealistaSlug(scope.city);
  const evidenceText = buildListingGeoEvidenceText(listing);
  const urlText = String(listing?.listingUrl || '').toLowerCase();
  const listedCaps = extractFiveDigitCaps(
    [listing?.addressText, listing?.title, listing?.description, listing?.listingUrl]
      .filter(Boolean)
      .join(' ')
  );
  const hasCapEvidence = listedCaps.length > 0;
  const capMismatch = hasCapEvidence && !listedCaps.includes(scope.cap);
  const cityMatch =
    (cityNorm.length > 0 && evidenceText.includes(cityNorm)) ||
    (citySlug.length > 0 &&
      (urlText.includes(`-${citySlug}-`) || urlText.includes(`_${citySlug}_`) || urlText.includes(citySlug)));
  const provinceConflict = hasProvinceConflictInEvidence(evidenceText, provinceNorm, cityMatch);
  if (capMismatch) return { ok: false, reason: `CAP mismatch (${listedCaps.join(',')})` };
  if (provinceConflict) return { ok: false, reason: 'Province/city conflict in listing text' };
  if (!cityMatch) return { ok: false, reason: 'City mismatch (soft)' };
  return { ok: true, reason: null as string | null };
};

const filterListingsByStreetScope = (
  listings: any[],
  scope: { streetName: string; city: string; province: string; cap: string }
) => {
  const acceptedStrict: any[] = [];
  const acceptedSoft: any[] = [];
  const rejectedReasons: string[] = [];
  const source = Array.isArray(listings) ? listings : [];
  const strictRejected: any[] = [];
  for (const listing of source) {
    const decision = isListingInsideStreetScope(listing, scope);
    if (decision.ok) acceptedStrict.push(listing);
    else {
      strictRejected.push(listing);
      if (decision.reason) rejectedReasons.push(decision.reason);
    }
  }

  if (STREET_LISTINGS_ALLOW_SOFT_MATCH) {
    for (const listing of strictRejected) {
      const softDecision = isListingInsideStreetScopeSoft(listing, scope);
      if (softDecision.ok) {
        acceptedSoft.push(listing);
      }
    }
  }

  const accepted = STREET_LISTINGS_ALLOW_SOFT_MATCH
    ? [...acceptedStrict, ...acceptedSoft]
    : acceptedStrict;

  return {
    listings: accepted,
    rejectedCount: Math.max(0, source.length - accepted.length),
    rejectedSummary: rejectedReasons.slice(0, 3).join(' | '),
    acceptedStrictCount: acceptedStrict.length,
    acceptedSoftCount: acceptedSoft.length
  };
};

const humanizeStreetListingWarning = (warning: string | null | undefined) => {
  const raw = String(warning || '').trim();
  if (!raw) return null;
  return raw
    .replace(/fallback fetch list failed\s*\(403\)/gi, 'Provider esterno temporaneamente bloccato (403)')
    .replace(/nestoria-fetch:nestoria fetch failed\s*\(404\)/gi, 'Fonte secondaria non disponibile (404)')
    .replace(/no listings found/gi, 'Nessun annuncio trovato dalla fonte esterna')
    .replace(/\s+/g, ' ')
    .trim();
};

const groupStreetGeocodeCache = new Map<string, { lat: number; lng: number; expiresAt: number }>();

const geocodeStreetWithNominatim = async (streetName: string, city: string, province: string) => {
  const key = `${streetName}|${city}|${province}`.toLowerCase();
  const cached = groupStreetGeocodeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { lat: cached.lat, lng: cached.lng };

  const q = encodeURIComponent(`${streetName}, ${city}, ${province}, Italia`);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'CRM-Immobiliare-ZoneMap/1.0'
    }
  });
  if (!res.ok) return null;
  const data = (await res.json()) as any[];
  const first = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!first) return null;
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  groupStreetGeocodeCache.set(key, { lat, lng, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30 });
  return { lat, lng };
};

const buildIdealistaStreetUrl = (streetName: string, city: string, province: string) => {
  const streetSlug = idealistaSlug(streetName);
  const citySlug = idealistaSlug(city);
  const provinceSlug = idealistaSlug(province);
  return `https://www.idealista.it/geo/vendita-case/${streetSlug}-${citySlug}-${provinceSlug}/`;
};

const buildNestoriaStreetUrl = (streetName: string, city: string) => {
  const streetSlug = idealistaSlug(streetName);
  const citySlug = idealistaSlug(city).replace(/-/g, '_');
  return `https://www.nestoria.it/immobiliare/vendita/${streetSlug}_${citySlug}`;
};

const buildNestoriaStreetUrlCandidates = (streetName: string, city: string) => {
  const normalizedStreet = String(streetName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const apostropheCollapsedStreet = normalizedStreet.replace(/([a-z])['’]([a-z])/g, '$1$2');
  const streetSlugVariants = Array.from(
    new Set([
      idealistaSlug(streetName),
      idealistaSlug(apostropheCollapsedStreet)
    ].filter(Boolean))
  );
  const citySlug = idealistaSlug(city).replace(/-/g, '_');

  const fullQuery = `${String(streetName || '').trim()} ${String(city || '').trim()}`.trim();
  const streetCore = stripStreetPrefix(streetName);
  const coreQuery = `${String(streetCore || '').trim()} ${String(city || '').trim()}`.trim();
  const candidates = [
    ...streetSlugVariants.map((streetSlug) => `https://www.nestoria.it/immobiliare/vendita/${streetSlug}_${citySlug}`),
    fullQuery ? `https://www.nestoria.it/immobiliare/vendita?q=${encodeURIComponent(fullQuery)}` : null,
    streetCore && coreQuery ? `https://www.nestoria.it/immobiliare/vendita?q=${encodeURIComponent(coreQuery)}` : null,
    citySlug ? `https://www.nestoria.it/immobiliare/vendita/${citySlug}` : null,
    city ? `https://www.nestoria.it/immobiliare/vendita?q=${encodeURIComponent(String(city).trim())}` : null
  ].filter(Boolean) as string[];
  return Array.from(new Set(candidates));
};

const parseBooleanEnv = (value: string | undefined, fallback: boolean) => {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const SCRAPE_TIMEOUT_MS = Math.max(10_000, Number(process.env.SCRAPE_TIMEOUT_MS || 55_000));
const SCRAPE_RETRIES = Math.max(0, Math.min(3, Number(process.env.SCRAPE_RETRIES || 1)));
const SCRAPE_RETRY_BACKOFF_MS = Math.max(500, Number(process.env.SCRAPE_RETRY_BACKOFF_MS || 1200));
const SCRAPER_ENABLE_NESTORIA_FALLBACK = parseBooleanEnv(process.env.SCRAPER_ENABLE_NESTORIA_FALLBACK, true);
const SCRAPER_ENABLE_IDEALISTA_FALLBACK = parseBooleanEnv(process.env.SCRAPER_ENABLE_IDEALISTA_FALLBACK, true);
const SCRAPER_ALLOW_BROWSER_ON_VERCEL = parseBooleanEnv(process.env.SCRAPER_ALLOW_BROWSER_ON_VERCEL, false);
const STREET_LISTINGS_PRIMARY_SOURCE = String(process.env.STREET_LISTINGS_PRIMARY_SOURCE || 'nestoria')
  .trim()
  .toLowerCase();
// Keep strict mode globally enabled: soft-match reintroduces off-street listings.
const STREET_LISTINGS_ALLOW_SOFT_MATCH = false;
const STREET_LISTINGS_RESOLVE_NESTORIA_DETAIL = parseBooleanEnv(process.env.STREET_LISTINGS_RESOLVE_NESTORIA_DETAIL, true);
const STREET_LISTINGS_DETAIL_RESOLVE_MAX = Math.max(1, Math.min(40, Number(process.env.STREET_LISTINGS_DETAIL_RESOLVE_MAX || 20)));
const STREET_LISTINGS_DETAIL_RESOLVE_CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.STREET_LISTINGS_DETAIL_RESOLVE_CONCURRENCY || 4)));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeScrapeErrorCode = (error: any): string => {
  const message = String(error?.message || '').toLowerCase();
  if (!message) return 'SCRAPE_ERROR';
  if (message.includes('timeout')) return 'SCRAPE_TIMEOUT';
  if (message.includes('captcha') || message.includes('anti-bot') || message.includes('challenge')) return 'SCRAPE_BLOCKED';
  if (message.includes('403') || message.includes('forbidden')) return 'SCRAPE_BLOCKED';
  if (message.includes('no listings found')) return 'SCRAPE_EMPTY';
  if (message.includes('net::') || message.includes('econn') || message.includes('network')) return 'SCRAPE_NETWORK';
  return 'SCRAPE_ERROR';
};

const compactScrapeErrorMessage = (errorOrMessage: any): string => {
  const raw = String(errorOrMessage?.message || errorOrMessage || '')
    .replace(/\r/g, ' ')
    .replace(/\n+/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return 'Unknown scrape error';
  const noBanner = raw.split('â•”')[0].trim() || raw;
  if (noBanner.length <= 280) return noBanner;
  return `${noBanner.slice(0, 280)}...`;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`SCRAPE_TIMEOUT: exceeded ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const runScrapeWithRetry = async <T>(label: string, fn: () => Promise<T>) => {
  let lastError: any = null;
  for (let attempt = 0; attempt <= SCRAPE_RETRIES; attempt += 1) {
    try {
      return await withTimeout(fn(), SCRAPE_TIMEOUT_MS);
    } catch (error: any) {
      lastError = error;
      if (attempt >= SCRAPE_RETRIES) break;
      await sleep(SCRAPE_RETRY_BACKOFF_MS * (attempt + 1));
    }
  }
  const code = normalizeScrapeErrorCode(lastError);
  const message = compactScrapeErrorMessage(lastError || `${label} failed`);
  throw new Error(`${code}: ${message}`);
};

const nestoriaDetailCache = new Map<string, { detailGeoText: string | null; detailAddressText: string | null; expiresAt: number }>();

const buildNestoriaDetailCandidateUrl = (listing: any) => {
  const rawUrl = String(listing?.listingUrl || '').trim();
  const sourceId = String(listing?.sourceListingId || '').trim();
  const candidates = [rawUrl];
  try {
    if (rawUrl) {
      const parsed = new URL(rawUrl);
      const detailPageUrl = parsed.searchParams.get('detailPageUrl');
      if (detailPageUrl) candidates.push(decodeURIComponent(detailPageUrl));
      const adId = parsed.searchParams.get('adId');
      if (adId && /^nestoria-IT-\d+$/i.test(adId)) {
        candidates.push(`https://www.nestoria.it/adclickdetail/${adId}`);
      }
    }
  } catch {
    // keep resilient on invalid URLs
  }
  if (/^\d{8,}$/.test(sourceId)) {
    candidates.push(`https://www.nestoria.it/adclickdetail/nestoria-IT-${sourceId}`);
  }
  return candidates.find((u) => /^https:\/\/www\.nestoria\.it\/adclickdetail\//i.test(String(u || ''))) || null;
};

const fetchNestoriaDetailGeoText = async (detailUrl: string) => {
  const cacheKey = detailUrl.toLowerCase();
  const cached = nestoriaDetailCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      detailGeoText: cached.detailGeoText,
      detailAddressText: cached.detailAddressText
    };
  }

  const res = await withTimeout(
    fetch(detailUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      }
    }),
    12_000
  );
  if (!res.ok) throw new Error(`nestoria detail fetch failed (${res.status})`);
  const html = await res.text();
  const titleRaw = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const titleText = decodeHtmlText(normalizeSpace(titleRaw));
  const listingAddressSegment =
    (titleText.match(/in vendita(?:[^|]{0,120})\sin\s([^|]{4,180})/i) || [])[1] ||
    (titleText.match(/in vendita a ([^|]{4,180})/i) || [])[1] ||
    '';
  const bodyText = decodeHtmlText(
    normalizeSpace(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    )
  );
  const bodySnippet = bodyText.slice(0, 1400);
  const detailGeoText = normalizeSpace([listingAddressSegment, titleText, bodySnippet].filter(Boolean).join(' ')) || null;
  const detailAddressText = normalizeSpace(listingAddressSegment || '') || null;
  nestoriaDetailCache.set(cacheKey, {
    detailGeoText,
    detailAddressText,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24
  });
  return {
    detailGeoText,
    detailAddressText
  };
};

const enrichNestoriaListingsWithDetailGeo = async (listings: any[]) => {
  const source = Array.isArray(listings) ? listings : [];
  if (!STREET_LISTINGS_RESOLVE_NESTORIA_DETAIL || source.length === 0) return source;
  const targetListings = source
    .map((listing) => ({ listing, detailUrl: buildNestoriaDetailCandidateUrl(listing) }))
    .filter((row) => Boolean(row.detailUrl))
    .slice(0, STREET_LISTINGS_DETAIL_RESOLVE_MAX);
  if (targetListings.length === 0) return source;

  let cursor = 0;
  const workers = Array.from({ length: Math.min(STREET_LISTINGS_DETAIL_RESOLVE_CONCURRENCY, targetListings.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= targetListings.length) break;
      const row = targetListings[index];
      try {
        const detailMeta = await fetchNestoriaDetailGeoText(String(row.detailUrl));
        row.listing.metadata = {
          ...(row.listing.metadata && typeof row.listing.metadata === 'object' ? row.listing.metadata : {}),
          detailGeoText: detailMeta?.detailGeoText || null,
          detailAddressText: detailMeta?.detailAddressText || null
        };
      } catch {
        // keep scraping resilient if detail page is blocked/unavailable
      }
    }
  });
  await Promise.all(workers);
  return source;
};

const scrapeIdealistaStreetWithLock = async (params: {
  streetId: string;
  streetName: string;
  city: string;
  province: string;
  sourceUrl: string;
}) => {
  const { streetId } = params;
  const existing = zoneStreetListingScrapeLocks.get(streetId);
  if (existing) return existing;
  const promise = (async () => {
    try {
      return await scrapeIdealistaStreetListings(params);
    } finally {
      zoneStreetListingScrapeLocks.delete(streetId);
    }
  })();
  zoneStreetListingScrapeLocks.set(streetId, promise);
  return promise;
};

const scrapeIdealistaStreetListings = async (params: {
  streetId: string;
  streetName: string;
  city: string;
  province: string;
  sourceUrl: string;
}) => {
  const { streetName, city, sourceUrl } = params;
  const maxPages = Math.max(1, Math.min(6, Number(process.env.IDEALISTA_MAX_PAGES_PER_STREET || 3)));
  const preferredMode = String(process.env.IDEALISTA_SCRAPER_MODE || 'fetch').toLowerCase();
  const browserRuntimeEnabled = preferredMode !== 'fetch' && (!IS_VERCEL_RUNTIME || SCRAPER_ALLOW_BROWSER_ON_VERCEL);
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];
  let totalPagesVisited = 0;

  const nestoriaUrls = buildNestoriaStreetUrlCandidates(streetName, city);
  const primaryNestoriaUrl = nestoriaUrls[0] || buildNestoriaStreetUrl(streetName, city);

  const tryNestoriaFetch = async () => {
    for (const nestoriaUrl of nestoriaUrls) {
      const data = await runScrapeWithRetry('nestoria-fetch', () =>
        scrapeNestoriaWithFetchFallback({
          sourceUrl: nestoriaUrl,
          maxPages
        })
      );
      totalPagesVisited += Number(data?.pagesVisited || 0);
      if (Array.isArray(data.listings) && data.listings.length > 0) {
        return {
          sourceUrl: nestoriaUrl,
          status: data.warning ? 'PARTIAL' : 'SUCCESS',
          warning: data.warning || null,
          listings: data.listings,
          rawPayload: {
            mode: 'nestoria-fetch-primary',
            startedAt,
            endedAt: new Date().toISOString(),
            pagesVisited: totalPagesVisited,
            listingCount: data.listings.length
          }
        };
      }
      if (data.warning) warnings.push(`nestoria-fetch:${data.warning}`);
    }
    return null;
  };

  const tryNestoriaBrowser = async () => {
    if (!browserRuntimeEnabled) return null;
    const data = await runScrapeWithRetry('nestoria-browser', () =>
      scrapeNestoriaWithBrowser({
        sourceUrl: primaryNestoriaUrl,
        maxPages
      })
    );
    totalPagesVisited += Number(data?.pagesVisited || 0);
    if (Array.isArray(data.listings) && data.listings.length > 0) {
      return {
        sourceUrl: primaryNestoriaUrl,
        status: data.warning ? 'PARTIAL' : 'SUCCESS',
        warning: data.warning || null,
        listings: data.listings,
        rawPayload: {
          mode: 'nestoria-browser-primary',
          startedAt,
          endedAt: new Date().toISOString(),
          pagesVisited: totalPagesVisited,
          listingCount: data.listings.length
        }
      };
    }
    if (data.warning) warnings.push(`nestoria-browser:${data.warning}`);
    return null;
  };

  const tryIdealistaFetch = async () => {
    const data = await runScrapeWithRetry('idealista-fetch', () =>
      scrapeIdealistaWithFetchFallback({
        sourceUrl,
        maxPages
      })
    );
    totalPagesVisited += Number(data?.pagesVisited || 0);
    if (Array.isArray(data.listings) && data.listings.length > 0) {
      return {
        sourceUrl,
        status: data.warning ? 'PARTIAL' : 'SUCCESS',
        warning: data.warning || null,
        listings: data.listings,
        rawPayload: {
          mode: 'idealista-fetch-fallback',
          startedAt,
          endedAt: new Date().toISOString(),
          pagesVisited: totalPagesVisited,
          listingCount: data.listings.length
        }
      };
    }
    if (data.warning) warnings.push(`idealista-fetch:${data.warning}`);
    return null;
  };

  const tryIdealistaBrowser = async () => {
    if (!browserRuntimeEnabled) return null;
    const data = await runScrapeWithRetry('idealista-browser', () =>
      scrapeIdealistaWithBrowser({
        sourceUrl,
        maxPages
      })
    );
    totalPagesVisited += Number(data?.pagesVisited || 0);
    if (Array.isArray(data.listings) && data.listings.length > 0) {
      return {
        sourceUrl,
        status: data.warning ? 'PARTIAL' : 'SUCCESS',
        warning: data.warning || null,
        listings: data.listings,
        rawPayload: {
          mode: 'idealista-browser-fallback',
          startedAt,
          endedAt: new Date().toISOString(),
          pagesVisited: totalPagesVisited,
          listingCount: data.listings.length
        }
      };
    }
    if (data.warning) warnings.push(`idealista-browser:${data.warning}`);
    return null;
  };

  const tryNestoriaFirst = STREET_LISTINGS_PRIMARY_SOURCE !== 'idealista';

  try {
    if (tryNestoriaFirst) {
      const fromNestoriaFetch = await tryNestoriaFetch();
      if (fromNestoriaFetch) return fromNestoriaFetch;
      const fromNestoriaBrowser = await tryNestoriaBrowser();
      if (fromNestoriaBrowser) return fromNestoriaBrowser;
    }

    if (SCRAPER_ENABLE_IDEALISTA_FALLBACK) {
      const fromIdealistaFetch = await tryIdealistaFetch();
      if (fromIdealistaFetch) return fromIdealistaFetch;
      const fromIdealistaBrowser = await tryIdealistaBrowser();
      if (fromIdealistaBrowser) return fromIdealistaBrowser;
    }

    if (!tryNestoriaFirst && SCRAPER_ENABLE_NESTORIA_FALLBACK) {
      const fromNestoriaFetch = await tryNestoriaFetch();
      if (fromNestoriaFetch) return fromNestoriaFetch;
      const fromNestoriaBrowser = await tryNestoriaBrowser();
      if (fromNestoriaBrowser) return fromNestoriaBrowser;
    }
  } catch (error: any) {
    warnings.push(compactScrapeErrorMessage(error));
  }

  const mergedWarning = warnings.filter(Boolean).slice(0, 4).join(' | ') || null;
  return {
    sourceUrl: tryNestoriaFirst ? primaryNestoriaUrl : sourceUrl,
    status: 'FAILED',
    warning: mergedWarning || 'All listing sources failed',
    listings: [],
    rawPayload: {
      mode: 'all-sources-failed',
      startedAt,
      endedAt: new Date().toISOString(),
      pagesVisited: totalPagesVisited,
      listingCount: 0
    }
  };
};

const scrapeNestoriaWithBrowser = async (params: {
  sourceUrl: string;
  maxPages: number;
}) => {
  const playwright = await import('playwright');
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox']
  });
  const listingsMap = new Map<string, any>();
  let pagesVisited = 0;
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      locale: 'it-IT',
      viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();
    await page.goto(params.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(1200);
    pagesVisited += 1;

    const cards = await page.evaluate(() => {
      const extract = (text: string, pattern: RegExp) => {
        const m = pattern.exec(text);
        return m ? m[0] : null;
      };
      return Array.from(document.querySelectorAll('.listing_list')).map((node, idx) => {
        const title = (node.querySelector('.listing__title__text')?.textContent || '').replace(/\s+/g, ' ').trim() || null;
        const keywords = (node.querySelector('.listing__keywords')?.textContent || '').replace(/\s+/g, ' ').trim() || '';
        const priceText =
          (node.querySelector('.listing__price')?.textContent || '').replace(/\s+/g, ' ').trim() ||
          extract(keywords, /[0-9\.\s]+â‚¬(?:\/mÂ²)?/i) ||
          null;
        const surfaceText = extract(keywords, /[0-9]+(?:[\.,][0-9]+)?\s*mÂ²/i);
        const roomsText = extract(keywords, /[0-9]+\s+Locali?/i);
        const floorText = extract(keywords, /[0-9]+\s+Piano/i);
        const badge = node.querySelector('[data-id]') as HTMLElement | null;
        const dataId = badge?.getAttribute('data-id') || null;
        const img = node.querySelector('img') as HTMLImageElement | null;
        const image =
          img?.getAttribute('src') ||
          img?.getAttribute('data-src') ||
          img?.getAttribute('data-original') ||
          (img?.getAttribute('srcset') || '').split(',')[0]?.trim().split(' ')[0] ||
          null;
        const link = (node.querySelector('a.results__link, a.trackedAd') as HTMLAnchorElement | null)?.getAttribute('href') || null;
        return {
          sourceListingId: dataId || `nestoria-${idx + 1}-${Date.now()}`,
          title,
          priceText,
          surfaceText,
          roomsText,
          floorText,
          keywords: keywords || null,
          mainImageUrl: image,
          link
        };
      });
    });

    for (const card of cards) {
      if (!card?.sourceListingId) continue;
      listingsMap.set(String(card.sourceListingId), {
        sourceListingId: String(card.sourceListingId),
        listingUrl:
          card.link && card.link !== '#'
            ? card.link.startsWith('http')
              ? card.link
              : `https://www.nestoria.it${card.link}`
            : `${params.sourceUrl}#${card.sourceListingId}`,
        title: card.title || null,
        priceText: card.priceText || null,
        roomsText: card.roomsText || null,
        surfaceText: card.surfaceText || null,
        floorText: card.floorText || null,
        description: card.keywords || null,
        agencyName: 'Nestoria',
        mainImageUrl: card.mainImageUrl || null,
        sourceUrl: params.sourceUrl,
        metadata: { via: 'nestoria-list' }
      });
    }

    return {
      pagesVisited,
      warning: null,
      listings: Array.from(listingsMap.values()).slice(0, 80)
    };
  } finally {
    await browser.close();
  }
};

const scrapeIdealistaWithBrowser = async (params: {
  sourceUrl: string;
  maxPages: number;
}) => {
  const playwright = await import('playwright');
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox']
  });
  const warnings: string[] = [];
  const listingsMap = new Map<string, any>();
  let pagesVisited = 0;
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      locale: 'it-IT',
      viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    let nextUrl: string | null = params.sourceUrl;
    for (let i = 0; i < params.maxPages && nextUrl; i += 1) {
      pagesVisited += 1;
      await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(600);
      const deviceCheck = await page.locator('text=Verifica del dispositivo').count();
      if (deviceCheck > 0) {
        warnings.push('Idealista anti-bot challenge detected');
        break;
      }

      await page.locator('button:has-text("Continua senza accettare")').first().click({ timeout: 1200 }).catch(() => {});

      const cards = await page.evaluate(() => {
        const parseMeta = (raw: string) => {
          const compact = (raw || '').replace(/\s+/g, ' ').trim();
          const out: { roomsText: string | null; surfaceText: string | null; floorText: string | null } = {
            roomsText: null,
            surfaceText: null,
            floorText: null
          };
          const rooms = compact.match(/([0-9]+)\s+locali?/i);
          const surface = compact.match(/([0-9]+)\s*m2/i);
          const floor = compact.match(/([0-9Âº]+(?:\s*piano)?[^,]*)/i);
          out.roomsText = rooms ? rooms[0] : null;
          out.surfaceText = surface ? surface[0] : null;
          out.floorText = floor ? floor[0] : null;
          return out;
        };

        return Array.from(document.querySelectorAll('article')).map((article) => {
          const linkEl = article.querySelector('a[href*="/immobile/"]') as HTMLAnchorElement | null;
          const href = linkEl?.getAttribute('href') || '';
          const sourceListingIdMatch = href.match(/\/immobile\/(\d+)/);
          const sourceListingId = sourceListingIdMatch ? sourceListingIdMatch[1] : null;
          const titleCandidate =
            (article.querySelector('h2')?.textContent || '').trim() ||
            (article.querySelector('[class*="item-link"]')?.textContent || '').trim();
          const priceCandidate = Array.from(article.querySelectorAll('span,div,strong'))
            .map((el) => (el.textContent || '').trim())
            .find((txt) => /^[0-9\.\s]+â‚¬/.test(txt) || /â‚¬/.test(txt)) || null;
          const img = article.querySelector('img') as HTMLImageElement | null;
          const imageUrl =
            img?.getAttribute('src') ||
            img?.getAttribute('data-src') ||
            img?.getAttribute('data-lazy') ||
            (img?.getAttribute('srcset') || '').split(',')[0]?.trim().split(' ')[0] ||
            null;
          const agencyName =
            (article.querySelector('a[href*="/pro/"] img') as HTMLImageElement | null)?.alt ||
            (article.querySelector('a[href*="/pro/"]')?.textContent || '').trim() ||
            null;
          const snippet =
            (article.querySelector('p')?.textContent || '').replace(/\s+/g, ' ').trim() ||
            null;
          const metaText = article.textContent || '';
          const parsedMeta = parseMeta(metaText);

          return {
            sourceListingId,
            href,
            title: titleCandidate || null,
            priceText: priceCandidate,
            snippet,
            agencyName,
            mainImageUrl: imageUrl,
            roomsText: parsedMeta.roomsText,
            surfaceText: parsedMeta.surfaceText,
            floorText: parsedMeta.floorText
          };
        });
      });

      for (const card of cards) {
        if (!card?.sourceListingId) continue;
        const listingUrl = String(card.href || '').startsWith('http')
          ? String(card.href)
          : `https://www.idealista.it${String(card.href || '')}`;
        listingsMap.set(String(card.sourceListingId), {
          sourceListingId: String(card.sourceListingId),
          listingUrl,
          title: card.title || null,
          priceText: card.priceText || null,
          roomsText: card.roomsText || null,
          surfaceText: card.surfaceText || null,
          floorText: card.floorText || null,
          description: card.snippet || null,
          agencyName: card.agencyName || null,
          mainImageUrl: card.mainImageUrl || null,
          sourceUrl: params.sourceUrl,
          metadata: { via: 'list' }
        });
      }

      const nextHref = await page.evaluate(() => {
        const link = document.querySelector('a[rel="next"], a.next, a[href*="/pagina-"]') as HTMLAnchorElement | null;
        return link?.getAttribute('href') || null;
      });
      nextUrl = nextHref
        ? nextHref.startsWith('http')
          ? nextHref
          : `https://www.idealista.it${nextHref}`
        : null;
    }

    const listingValues = Array.from(listingsMap.values()).slice(0, 80);
    for (const listing of listingValues) {
      try {
        const detailPage = await context.newPage();
        await detailPage.goto(listing.listingUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await detailPage.waitForTimeout(300);
        await detailPage.locator('button:has-text("Continua senza accettare")').first().click({ timeout: 800 }).catch(() => {});
        const detail = await detailPage.evaluate(() => {
          const textByHeading = (heading: string) => {
            const headings = Array.from(document.querySelectorAll('h2,h3'));
            const target = headings.find((h) => (h.textContent || '').toLowerCase().includes(heading.toLowerCase()));
            if (!target) return null;
            const box = target.parentElement;
            return (box?.textContent || '').replace(/\s+/g, ' ').trim();
          };
          const extractPrice = () => {
            const strong = Array.from(document.querySelectorAll('strong,span,div'))
              .map((n) => (n.textContent || '').trim())
              .find((t) => /^[0-9\.\s]+â‚¬/.test(t));
            return strong || null;
          };
          const addressText = Array.from(document.querySelectorAll('li'))
            .map((n) => (n.textContent || '').trim())
            .filter((x) => x.length > 0)
            .slice(0, 6)
            .join(' - ') || null;
          const descBox = Array.from(document.querySelectorAll('h2'))
            .find((h) => (h.textContent || '').toLowerCase().includes('descrizione'));
          const descText = (descBox?.parentElement?.textContent || '').replace(/\s+/g, ' ').trim() || null;
          const charBox = textByHeading('Caratteristiche specifiche');
          const agencyName =
            (document.querySelector('a[href*="/pro/"] img') as HTMLImageElement | null)?.alt ||
            (document.querySelector('a[href*="/pro/"]')?.textContent || '').trim() ||
            null;
          const phoneVisible = Array.from(document.querySelectorAll('button,span,a'))
            .map((el) => (el.textContent || '').trim())
            .find((txt) => /\+?\d[\d\s]{6,}/.test(txt)) || null;
          const mainImageUrl = (document.querySelector('main img') as HTMLImageElement | null)?.src || null;
          const pageTitle = (document.querySelector('h1')?.textContent || '').trim() || null;
          return {
            title: pageTitle,
            priceText: extractPrice(),
            description: descText,
            addressText,
            agencyName,
            phoneVisible,
            mainImageUrl,
            characteristics: charBox
          };
        });
        await detailPage.close();
        listing.title = detail.title || listing.title;
        listing.priceText = detail.priceText || listing.priceText;
        listing.description = detail.description || listing.description;
        listing.addressText = detail.addressText || listing.addressText || null;
        listing.agencyName = detail.agencyName || listing.agencyName;
        listing.phoneVisible = detail.phoneVisible || null;
        listing.mainImageUrl = detail.mainImageUrl || listing.mainImageUrl;
        listing.energyClass = /Classe energetica[^,]*/i.exec(detail.characteristics || '')?.[0] || null;
        listing.metadata = {
          ...(listing.metadata || {}),
          characteristics: detail.characteristics || null
        };
      } catch (err: any) {
        warnings.push(`Detail scrape failed for ${listing.sourceListingId}: ${String(err?.message || err)}`);
      }
    }

    return {
      pagesVisited,
      warning: warnings.length > 0 ? warnings.slice(0, 3).join(' | ') : null,
      listings: listingValues
    };
  } finally {
    await browser.close();
  }
};

const scrapeNestoriaWithFetchFallback = async (params: { sourceUrl: string; maxPages: number }) => {
  const listingsMap = new Map<string, any>();
  const warnings: string[] = [];
  let pagesVisited = 0;
  let currentUrl: string | null = params.sourceUrl;

  const extractByRegex = (input: string, regex: RegExp, group = 1) => {
    const m = regex.exec(input);
    return m && m[group] ? decodeHtmlText(normalizeSpace(m[group])) : null;
  };

  const upsertListing = (raw: any, metaVia: string) => {
    const sourceListingId = String(raw?.sourceListingId || '').trim();
    if (!sourceListingId) return;
    const listingUrl = String(raw?.listingUrl || '').trim() || `${params.sourceUrl}#${sourceListingId}`;
    const existing = listingsMap.get(sourceListingId);
    const merged = {
      sourceListingId,
      listingUrl,
      sourceUrl: params.sourceUrl,
      title: raw?.title || existing?.title || null,
      priceText: raw?.priceText || existing?.priceText || null,
      roomsText: raw?.roomsText || existing?.roomsText || null,
      surfaceText: raw?.surfaceText || existing?.surfaceText || null,
      floorText: raw?.floorText || existing?.floorText || null,
      description: raw?.description || existing?.description || null,
      agencyName: raw?.agencyName || existing?.agencyName || 'Nestoria',
      mainImageUrl: raw?.mainImageUrl || existing?.mainImageUrl || null,
      metadata: {
        ...(existing?.metadata || {}),
        ...(raw?.metadata || {}),
        via: metaVia
      }
    };
    listingsMap.set(sourceListingId, merged);
  };

  const parseNestoriaHtmlBlocks = (html: string) => {
    const blockRegexes = [
      /<li[^>]*class="[^"]*listing_list[^"]*"[\s\S]*?(?=<li[^>]*class="[^"]*listing_list[^"]*"|<\/ul>|<\/ol>|$)/gim,
      /<article[^>]*class="[^"]*listing[^"]*"[\s\S]*?<\/article>/gim
    ];
    for (const blockRegex of blockRegexes) {
      let item: RegExpExecArray | null = null;
      while ((item = blockRegex.exec(html)) !== null) {
        const block = item[0];
        const blockPlainText = decodeHtmlText(normalizeSpace(block));
        const sourceListingId =
          extractByRegex(block, /data-id="([^"]+)"/i) ||
          extractByRegex(block, /listing[_-](\d{6,})/i) ||
          extractByRegex(block, /href="[^"]*\/(?:annuncio|immobile)\/(\d{6,})/i) ||
          `nestoria-${pagesVisited}-${blockRegex.lastIndex}`;
        const dataHref = extractByRegex(block, /data-href="([^"]+)"/i);
        const href =
          extractByRegex(block, /href="([^"]+)"/i) ||
          extractByRegex(block, /data-url="([^"]+)"/i);
        const listingPath = dataHref || href || null;
        const listingUrl = listingPath
          ? listingPath.startsWith('http')
            ? listingPath
            : `https://www.nestoria.it${listingPath}`
          : `${params.sourceUrl}#${sourceListingId}`;
        const title =
          extractByRegex(block, /class="listing__title__text"[^>]*>([\s\S]*?)<\/(?:div|span|h2)>/i) ||
          extractByRegex(block, /class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|h2|a)>/i);
        const priceText =
          extractByRegex(block, /class="result__details__price[^"]*"[^>]*>\s*<span>([\s\S]*?)<\/span>/i) ||
          extractByRegex(block, /([0-9\.\s]+(?:€|eur))/i);
        const keywords = extractByRegex(block, /class="listing__keywords"[^>]*>([\s\S]*?)<\/div>/i);
        const description =
          extractByRegex(block, /class="listing__description"[^>]*>([\s\S]*?)<\/div>/i) ||
          extractByRegex(block, /class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/(?:div|p)>/i);
        const locationText =
          extractByRegex(block, /class="[^"]*(?:location|address|subtitle)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|p)>/i) ||
          extractByRegex(block, /<h2[^>]*>[\s\S]*?<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i) ||
          null;
        const agencyName =
          extractByRegex(block, /<span class="text--muted">da<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i) ||
          extractByRegex(block, /class="[^"]*agency[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|a)>/i);
        const imageUrl =
          extractByRegex(block, /data-lazy="([^"]+)"/i) ||
          extractByRegex(block, /src="(https:\/\/imgs\.nestimg\.com[^"]+)"/i) ||
          extractByRegex(block, /src="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
        const normalizedKeywords = decodeHtmlText(normalizeSpace(String(keywords || '')));
        const keywordLocationText = normalizedKeywords
          ? normalizeSpace(String(normalizedKeywords).split('·')[0] || '')
          : '';
        const surfaceText = normalizedKeywords ? extractByRegex(normalizedKeywords, /([0-9]+(?:[\.,][0-9]+)?\s*m2)/i) : null;
        const roomsText = normalizedKeywords ? extractByRegex(normalizedKeywords, /([0-9]+\s+Locali?)/i) : null;
        const floorText = normalizedKeywords ? extractByRegex(normalizedKeywords, /([0-9]+\s+Piano)/i) : null;

        upsertListing(
          {
            sourceListingId,
            listingUrl,
            title,
            priceText,
            roomsText,
            surfaceText,
            floorText,
            description,
            agencyName: agencyName || 'Nestoria',
            mainImageUrl: imageUrl,
            metadata: {
              keywords: normalizedKeywords || null,
              locationText:
                keywordLocationText ||
                (locationText ? decodeHtmlText(normalizeSpace(locationText)) : null),
              geoText: decodeHtmlText(
                normalizeSpace(
                  `${title || ''} ${normalizedKeywords || ''} ${locationText || ''} ${blockPlainText || ''}`
                )
              )
            }
          },
          'nestoria-fetch-html'
        );
      }
    }
  };

  const parseNestoriaJsonLd = (html: string) => {
    const scriptRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gim;
    let scriptMatch: RegExpExecArray | null = null;
    while ((scriptMatch = scriptRegex.exec(html)) !== null) {
      const raw = scriptMatch[1];
      if (!raw || !raw.includes('ListItem')) continue;
      try {
        const parsed = JSON.parse(raw);
        const candidates = Array.isArray(parsed) ? parsed : [parsed];
        for (const obj of candidates) {
          const itemListElement = Array.isArray(obj?.itemListElement) ? obj.itemListElement : [];
          for (const el of itemListElement) {
            const item = el?.item || {};
            const url = String(item?.url || '').trim();
            if (!url) continue;
            const idFromUrl =
              (url.match(/\/(?:annuncio|immobile)\/(\d{6,})/i) || [])[1] ||
              (url.match(/listing[_-](\d{6,})/i) || [])[1] ||
              '';
            const sourceListingId = idFromUrl || `nestoria-jsonld-${pagesVisited}-${Math.random().toString(36).slice(2, 9)}`;
            upsertListing(
              {
                sourceListingId,
                listingUrl: url,
                title: String(item?.name || '').trim() || null,
                description: String(item?.description || '').trim() || null,
                mainImageUrl: String(item?.image || '').trim() || null
              },
              'nestoria-fetch-jsonld'
            );
          }
        }
      } catch {
        // keep scraping resilient on malformed JSON-LD
      }
    }
  };

  for (let i = 0; i < params.maxPages && currentUrl; i += 1) {
    pagesVisited += 1;
    const response = await fetch(currentUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    if (!response.ok) {
      warnings.push(`nestoria fetch failed (${response.status})`);
      break;
    }
    const html = await response.text();
    parseNestoriaHtmlBlocks(html);
    parseNestoriaJsonLd(html);

    const targetPage = String(i + 2);
    const nextPagePatterns = [
      new RegExp(`class="pagination__link"[^>]*href="([^"]+)"[^>]*data-page="${targetPage}"`, 'i'),
      /<a[^>]*rel="next"[^>]*href="([^"]+)"/i,
      /<a[^>]*href="([^"]+)"[^>]*>\s*(?:Next|Successivo|›|»)\s*<\/a>/i
    ];
    let nextHref: string | null = null;
    for (const pattern of nextPagePatterns) {
      const m = html.match(pattern);
      if (m?.[1]) {
        nextHref = m[1];
        break;
      }
    }
    currentUrl = nextHref
      ? nextHref.startsWith('http')
        ? nextHref
        : `https://www.nestoria.it${nextHref}`
      : null;
  }

  return {
    pagesVisited,
    warning: warnings.length > 0 ? warnings.join(' | ') : null,
    listings: Array.from(listingsMap.values()).slice(0, 80)
  };
};

const scrapeIdealistaWithFetchFallback = async (params: { sourceUrl: string; maxPages: number }) => {
  const listingsMap = new Map<string, any>();
  const warnings: string[] = [];
  let pagesVisited = 0;
  let currentUrl: string | null = params.sourceUrl;

  for (let i = 0; i < params.maxPages && currentUrl; i += 1) {
    pagesVisited += 1;
    const response = await fetch(currentUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!response.ok) {
      warnings.push(`Fallback fetch list failed (${response.status})`);
      break;
    }
    const html = await response.text();
    const cardRegex = /href=\"(\/immobile\/(\d+)\/)\"[\s\S]{0,450}?(\d[\d\.\s]*â‚¬)/gim;
    let match: RegExpExecArray | null = null;
    while ((match = cardRegex.exec(html)) !== null) {
      const href = match[1];
      const sourceListingId = match[2];
      const priceText = normalizeSpace(match[3] || '');
      if (!sourceListingId) continue;
      listingsMap.set(sourceListingId, {
        sourceListingId,
        listingUrl: `https://www.idealista.it${href}`,
        sourceUrl: params.sourceUrl,
        priceText: priceText || null,
        title: null,
        roomsText: null,
        surfaceText: null,
        floorText: null,
        description: null,
        agencyName: null,
        mainImageUrl: null,
        metadata: { via: 'fetch' }
      });
    }
    const nextMatch = html.match(/href=\"([^\"]*\/pagina-\d+[^\"]*)\"[^>]*>\s*(?:Successivo|Next|â€º)/i);
    currentUrl = nextMatch?.[1]
      ? nextMatch[1].startsWith('http')
        ? nextMatch[1]
        : `https://www.idealista.it${nextMatch[1]}`
      : null;
  }

  return {
    pagesVisited,
    warning: warnings.length > 0 ? warnings.join(' | ') : null,
    listings: Array.from(listingsMap.values())
  };
};

const extractRegexGroup = (input: string, regex: RegExp, groupIndex = 1): string | null => {
  const match = regex.exec(input);
  if (!match || !match[groupIndex]) return null;
  return decodeHtmlText(match[groupIndex]);
};

const extractJsonArrayFrom = (input: string, marker: string): any[] | null => {
  const markerIndex = input.indexOf(marker);
  if (markerIndex < 0) return null;
  const arrayStart = input.indexOf('[', markerIndex);
  if (arrayStart < 0) return null;
  let depth = 0;
  for (let i = arrayStart; i < input.length; i++) {
    const ch = input[i];
    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) {
        const raw = input.slice(arrayStart, i + 1);
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
};

const parseStreetSourceUrlParts = (sourceUrl: string) => {
  try {
    const u = new URL(sourceUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    const marketIdx = parts.findIndex((p) => p === 'mercato-immobiliare');
    if (marketIdx < 0 || parts.length < marketIdx + 3) return null;
    const capCity = parts[marketIdx + 1] || '';
    const streetSlug = parts[marketIdx + 2] || '';
    const capMatch = capCity.match(/^(\d{5})-(.+)$/);
    if (!capMatch) return null;
    const cap = capMatch[1];
    const citySlug = capMatch[2];
    const city = citySlug
      .split('-')
      .filter(Boolean)
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
      .join(' ');
    const street = streetSlug
      .split('-')
      .filter(Boolean)
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
      .join(' ');
    return { cap, city, street };
  } catch {
    return null;
  }
};

const formatEuroText = (value: number | null | undefined): string | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(value);
};

const geocodeStreetLatLng = async (sourceUrl: string): Promise<{ lat: number; lng: number } | null> => {
  const parsed = parseStreetSourceUrlParts(sourceUrl);
  if (!parsed) return null;
  const query = `${parsed.street}, ${parsed.cap} ${parsed.city}, Italia`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'user-agent': 'CosmoCasaCRM/1.0 (street-geocoder)',
      accept: 'application/json'
    }
  });
  if (!response.ok) return null;
  const payload = await response.json();
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const item = payload[0];
  const lat = Number(item?.lat);
  const lng = Number(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const scrapeStreetMarketSnapshot = async (sourceUrl: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!response.ok) {
      throw new Error(`Upstream response ${response.status}`);
    }
    const html = await response.text();

    const marketTitle = extractRegexGroup(html, /<h1[^>]*>([^<]*Mercato immobiliare[^<]*)<\/h1>/i);
    const avgPricePerSqm = extractRegexGroup(
      html,
      /Il prezzo medio degli immobili[^<]*<strong>([^<]+)<\/strong>/i
    );
    const avgRangeText = extractRegexGroup(
      html,
      /<span class="text-xs text-gray-600">Via<\/span><\/div><div[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i
    );
    const trendSummary = extractRegexGroup(
      html,
      /<h2[^>]*>Andamento dei prezzi immobiliari[\s\S]*?<p>([\s\S]*?)<\/p>/i
    );
    const trendLongTerm = extractRegexGroup(
      html,
      /Andamento dei prezzi immobiliari[\s\S]*?<p>[\s\S]*?<\/p><p>([\s\S]*?)<\/p>/i
    );
    const cityAverageTitle = extractRegexGroup(html, /<h2[^>]*>(Prezzi medi a[^<]*)<\/h2>/i);
    const houseSummary = extractRegexGroup(
      html,
      /<h3[^>]*>Prezzi delle case<\/h3><div[^>]*>([\s\S]*?)<\/div>/i
    );
    const apartmentSummary = extractRegexGroup(
      html,
      /<h3[^>]*>Prezzi degli appartamenti<\/h3><div[^>]*>([\s\S]*?)<\/div>/i
    );
    const latText = extractRegexGroup(html, /"lat":([0-9\.\-]+)/i);
    const lngText = extractRegexGroup(html, /"lng":([0-9\.\-]+)/i);
    const geomCoordinates = extractJsonArrayFrom(html, '"coordinates":');
    let lat = latText != null ? Number(latText) : null;
    let lng = lngText != null ? Number(lngText) : null;
    if ((!Number.isFinite(lat as number) || !Number.isFinite(lng as number)) && (!geomCoordinates || geomCoordinates.length === 0)) {
      const geocoded = await geocodeStreetLatLng(sourceUrl);
      if (geocoded) {
        lat = geocoded.lat;
        lng = geocoded.lng;
      }
    }

    return {
      sourceUrl,
      marketTitle,
      avgPricePerSqm,
      avgRangeText,
      trendSummary,
      trendLongTerm,
      cityAverageTitle,
      houseSummary,
      apartmentSummary,
      lat: Number.isFinite(lat as number) ? lat : null,
      lng: Number.isFinite(lng as number) ? lng : null,
      rawPayload: { extractedAt: new Date().toISOString(), geomCoordinates: geomCoordinates || null }
    };
  } finally {
    clearTimeout(timeout);
  }
};

app.get('/api/geo/locations', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    // Shared catalog used by both admin and agent zone workflows.
    const rows = loadGeoLocations();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error loading geo locations' });
  }
});

app.get('/api/geo/pescara-caps', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const items = loadPescaraCapCatalog();
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error loading CAP catalog' });
  }
});

app.get('/api/agents/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (auth.role === 'AGENT' && auth.id !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const agent = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        agencyId: true
      }
    });

    if (agent) {
      res.json({
        ...agent,
        name: `${agent.firstName} ${agent.lastName}`
      });
    } else {
      res.status(404).json({ message: 'Agent not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching agent' });
  }
});

app.post('/api/agents', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    let { agencyId, name, ...data } = req.body;

    if (auth.agencyId && auth.role !== 'SUPER_ADMIN') {
      agencyId = auth.agencyId;
    } else if (!agencyId) {
      const agency = await prisma.agency.findFirst();
      agencyId = agency?.id;
    }

    // Split name if provided and firstName/lastName not provided
    if (name && (!data.firstName || !data.lastName)) {
      const parts = name.split(' ');
      data.firstName = parts[0];
      data.lastName = parts.slice(1).join(' ');
    }

    // Map roles to match Prisma Enum
    const roleMapping: Record<string, string> = {
      'MANAGER': 'AGENCY_ADMIN',
      'TEAM_LEADER': 'AGENCY_ADMIN',
      'SENIOR_AGENT': 'AGENT',
      'ADMIN': 'AGENCY_ADMIN'
    };

    if (data.role && roleMapping[data.role]) {
      data.role = roleMapping[data.role];
    }

    const hasCustomPassword = data.password && String(data.password).trim() !== '';
    if (hasCustomPassword) {
      data.password = await bcrypt.hash(String(data.password), 10);
    } else {
      data.password = await bcrypt.hash('password123', 10);
    }
    data.mustChangePassword = true;

    // Clean up fields that might not exist in User model (temporary fix)
    delete data.commission;
    delete data.specialization;
    delete data.notes;

    const newAgent = await prisma.user.create({
      data: {
        ...data,
        agencyId
      }
    });

    res.status(201).json({
      success: true,
      data: newAgent,
      message: 'Agent created successfully'
    });
  } catch (error: any) {
    console.error('Error creating agent:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target) ? error.meta?.target.join(',') : error.meta?.target;
        if (typeof target === 'string' && target.includes('email')) {
          return res.status(400).json({
            success: false,
            message: 'Email giÃ  in uso'
          });
        }
        return res.status(400).json({
          success: false,
          message: 'Violazione di un vincolo di unicitÃ '
        });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Errore nella creazione agente',
      error: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
});

app.put('/api/agents/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const { id } = req.params;
    const { name, password, ...rawData } = req.body ?? {};
    const data: any = { ...rawData };

    if (name && (!data.firstName || !data.lastName)) {
      const parts = String(name).trim().split(/\s+/).filter(Boolean);
      if (parts.length > 0) {
        data.firstName = parts[0];
        data.lastName = parts.slice(1).join(' ') || data.lastName || '';
      }
    }

    const roleMapping: Record<string, string> = {
      MANAGER: 'AGENCY_ADMIN',
      TEAM_LEADER: 'AGENCY_ADMIN',
      SENIOR_AGENT: 'AGENT',
      ADMIN: 'AGENCY_ADMIN'
    };

    if (data.role && roleMapping[data.role]) {
      data.role = roleMapping[data.role];
    }

    delete data.commission;
    delete data.specialization;
    delete data.notes;

    if (password && String(password).trim() !== '') {
      data.password = await bcrypt.hash(String(password), 10);
      data.mustChangePassword = true;
    } else {
      delete data.password;
    }

    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, agencyId: true, role: true }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    if (existing.role === 'SUPER_ADMIN' && auth.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (auth.role === 'AGENCY_ADMIN' && auth.agencyId && existing.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        agencyId: true
      }
    });

    res.json({
      success: true,
      data: { ...updated, name: `${updated.firstName} ${updated.lastName}` },
      message: 'Agent updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating agent:', error);
    if (error?.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    res.status(500).json({ success: false, message: 'Error updating agent' });
  }
});

app.delete('/api/agents/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const { id } = req.params;

    const agent = await prisma.user.findUnique({
      where: { id },
      select: { id: true, isActive: true, role: true, agencyId: true }
    });

    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    if (agent.role === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (auth.role === 'AGENCY_ADMIN' && auth.agencyId && agent.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (auth.id === id) {
      return res.status(400).json({ success: false, message: 'Non puoi eliminare il tuo stesso utente' });
    }

    const [
      propertiesCount,
      appointmentsCount,
      activitiesCount,
      contactsAssignedCount,
      requestsAssignedCount,
      campaignsCreatedCount
    ] = await Promise.all([
      prisma.property.count({ where: { ownerId: id } }),
      prisma.appointment.count({ where: { assignedToId: id } }),
      prisma.activity.count({ where: { assignedToId: id } }),
      prisma.contact.count({ where: { assignedToId: id } }),
      prisma.request.count({ where: { assignedToId: id } }),
      prisma.campaign.count({ where: { createdById: id } })
    ]);

    const blocking = {
      properties: propertiesCount,
      appointments: appointmentsCount,
      activities: activitiesCount,
      contactsAssigned: contactsAssignedCount,
      requestsAssigned: requestsAssignedCount,
      campaignsCreated: campaignsCreatedCount
    };

    await prisma.$transaction([
      prisma.property.updateMany({ where: { ownerId: id }, data: { ownerId: auth.id } }),
      prisma.appointment.updateMany({ where: { assignedToId: id }, data: { assignedToId: auth.id } }),
      prisma.activity.updateMany({ where: { assignedToId: id }, data: { assignedToId: auth.id } }),
      prisma.contact.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } }),
      prisma.request.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } }),
      prisma.campaign.updateMany({ where: { createdById: id }, data: { createdById: auth.id } }),
      prisma.user.delete({ where: { id } })
    ]);

    res.json({
      success: true,
      message: 'Agent deleted successfully',
      blocking
    });
  } catch (error: any) {
    console.error('Error deleting agent:', error);
    if (error?.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    res.status(500).json({
      success: false,
      message: 'Error deleting agent',
      error: error?.message ? String(error.message) : undefined,
      code: error?.code
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: 'connected'
  });
});

app.post('/internal/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!INTERNAL_JWT_SECRET) {
    res.status(500).json({ success: false, message: 'Internal authentication not configured' });
    return;
  }

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email e password sono obbligatori' });
    return;
  }

  try {
    const user = await prisma.internalUser.findUnique({
      where: { email }
    });

    if (!user) {
      res.status(401).json({ success: false, message: 'Credenziali non valide' });
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordValid) {
      res.status(401).json({ success: false, message: 'Credenziali non valide' });
      return;
    }

    if (!user.mfaSecret) {
      const secret = speakeasy.generateSecret({
        length: 32,
        name: `CRM Super-dashboard (${user.email})`
      });

      const activationToken = jwt.sign(
        {
          sub: user.id,
          type: 'mfa-activate',
          secret: secret.base32
        },
        INTERNAL_JWT_SECRET,
        { expiresIn: '10m' }
      );

      res.json({
        success: true,
        message: 'Configurazione MFA richiesta',
        data: {
          requiresMfaSetup: true,
          activationToken,
          otpauthUrl: secret.otpauth_url,
          secret: secret.base32
        }
      });
      return;
    }

    if (user.mfaSecret === INTERNAL_MFA_DISABLED_SENTINEL) {
      const token = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          type: 'internal'
        },
        INTERNAL_JWT_SECRET,
        { expiresIn: '1h' }
      );

      try {
        await writeAuditLog(
          'INTERNAL_LOGIN',
          'InternalUser',
          user.id,
          user.id,
          req.ip || null,
          user.email,
          req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
            ? req.headers['user-agent']
            : null,
          null
        );
      } catch (logError) {
        console.error('Audit log error (INTERNAL_LOGIN without MFA):', logError);
      }

      res.json({
        success: true,
        message: 'Login effettuato con successo',
        data: {
          user: {
            id: user.id,
            email: user.email,
            role: user.role
          },
          token
        }
      });
      return;
    }

    const mfaToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        type: 'mfa'
      },
      INTERNAL_JWT_SECRET,
      { expiresIn: '5m' }
    );

    res.json({
      success: true,
      message: 'Inserisci il codice MFA',
      data: {
        mfaToken
      }
    });
  } catch (error) {
    console.error('Internal login error:', error);
    res.status(500).json({ success: false, message: 'Errore interno del server' });
  }
});

app.post('/internal/auth/mfa/verify', async (req, res) => {
  const { mfaToken, code } = req.body || {};

  if (!INTERNAL_JWT_SECRET) {
    res.status(500).json({ success: false, message: 'Internal authentication not configured' });
    return;
  }

  if (!mfaToken || !code) {
    res.status(400).json({ success: false, message: 'Token MFA e codice sono obbligatori' });
    return;
  }

  try {
    let payload: any;

    try {
      payload = jwt.verify(mfaToken, INTERNAL_JWT_SECRET);
    } catch {
      res.status(401).json({ success: false, message: 'Sessione MFA non valida o scaduta' });
      return;
    }

    if (!payload || payload.type !== 'mfa' || !payload.sub) {
      res.status(401).json({ success: false, message: 'Sessione MFA non valida' });
      return;
    }

    const user = await prisma.internalUser.findUnique({
      where: { id: payload.sub as string }
    });

    if (!user || !user.mfaSecret || user.mfaSecret === INTERNAL_MFA_DISABLED_SENTINEL) {
      res.status(401).json({ success: false, message: 'Utente non valido per MFA' });
      return;
    }

    const isValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: String(code),
      window: INTERNAL_MFA_WINDOW
    });

    if (!isValid) {
      res.status(401).json({ success: false, message: 'Codice MFA non valido' });
      return;
    }

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        type: 'internal'
      },
      INTERNAL_JWT_SECRET,
      { expiresIn: '1h' }
    );

    try {
      await writeAuditLog(
        'INTERNAL_LOGIN',
        'InternalUser',
        user.id,
        user.id,
        req.ip || null,
        user.email,
        req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : null,
        null
      );
    } catch (logError) {
      console.error('Audit log error (INTERNAL_LOGIN via MFA):', logError);
    }

    res.json({
      success: true,
      message: 'Login effettuato con successo',
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        },
        token
      }
    });
  } catch (error) {
    console.error('Internal MFA verify error:', error);
    res.status(500).json({ success: false, message: 'Errore interno del server' });
  }
});

app.post('/internal/auth/mfa/activate/start', requireInternalAuth, async (req, res) => {
  if (!INTERNAL_JWT_SECRET) {
    res.status(500).json({ success: false, message: 'Internal authentication not configured' });
    return;
  }

  const internalUser = (req as any).internalUser;
  const userId = internalUser?.id as string | undefined;
  const email = internalUser?.email as string | undefined;

  if (!userId || !email) {
    res.status(500).json({ success: false, message: 'Errore interno del server' });
    return;
  }

  try {
    const secret = speakeasy.generateSecret({
      length: 32,
      name: `CRM Super-dashboard (${email})`
    });

    const activationToken = jwt.sign(
      {
        sub: userId,
        type: 'mfa-activate',
        secret: secret.base32
      },
      INTERNAL_JWT_SECRET,
      { expiresIn: '10m' }
    );

    res.json({
      success: true,
      data: {
        activationToken,
        otpauthUrl: secret.otpauth_url,
        secret: secret.base32
      }
    });
  } catch (error) {
    console.error('Internal MFA activate start error:', error);
    res.status(500).json({ success: false, message: 'Errore interno del server' });
  }
});

app.post('/internal/auth/mfa/activate/verify', async (req, res) => {
  const { activationToken, code } = req.body || {};

  if (!INTERNAL_JWT_SECRET) {
    res.status(500).json({ success: false, message: 'Internal authentication not configured' });
    return;
  }

  if (!activationToken || !code) {
    res.status(400).json({ success: false, message: 'Token attivazione MFA e codice sono obbligatori' });
    return;
  }

  try {
    let payload: any;

    try {
      payload = jwt.verify(activationToken, INTERNAL_JWT_SECRET);
    } catch {
      res.status(401).json({ success: false, message: 'Sessione attivazione MFA non valida o scaduta' });
      return;
    }

    if (!payload || payload.type !== 'mfa-activate' || !payload.sub || !payload.secret) {
      res.status(401).json({ success: false, message: 'Sessione attivazione MFA non valida' });
      return;
    }

    const isValid = speakeasy.totp.verify({
      secret: String(payload.secret),
      encoding: 'base32',
      token: String(code),
      window: INTERNAL_MFA_WINDOW
    });

    if (!isValid) {
      res.status(401).json({ success: false, message: 'Codice MFA non valido' });
      return;
    }

    const user = await prisma.internalUser.update({
      where: { id: payload.sub as string },
      data: {
        mfaSecret: String(payload.secret)
      }
    });

    try {
      await writeAuditLog(
        'INTERNAL_MFA_ACTIVATED',
        'InternalUser',
        user.id,
        user.id,
        req.ip || null,
        user.email,
        req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : null,
        null
      );
    } catch (logError) {
      console.error('Audit log error (INTERNAL_MFA_ACTIVATED):', logError);
    }

    res.json({
      success: true,
      message: 'MFA attivata con successo',
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Internal MFA activate verify error:', error);
    res.status(500).json({ success: false, message: 'Errore interno del server' });
  }
});

app.post('/internal/auth/mfa/deactivate', requireInternalAuth, async (req, res) => {
  const { code, password } = req.body || {};

  if (!INTERNAL_JWT_SECRET) {
    res.status(500).json({ success: false, message: 'Internal authentication not configured' });
    return;
  }

  if (!password || !code) {
    res.status(400).json({ success: false, message: 'Password e codice MFA sono obbligatori' });
    return;
  }

  try {
    const internalUser = (req as any).internalUser;
    const userId = internalUser?.id as string | undefined;

    if (!userId) {
      res.status(500).json({ success: false, message: 'Errore interno del server' });
      return;
    }

    const user = await prisma.internalUser.findUnique({
      where: { id: userId }
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'Utente non trovato' });
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordValid) {
      res.status(401).json({ success: false, message: 'Password non valida' });
      return;
    }

    if (!user.mfaSecret || user.mfaSecret === INTERNAL_MFA_DISABLED_SENTINEL) {
      res.status(400).json({ success: false, message: 'MFA giÃ  disattivata' });
      return;
    }

    const isValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: String(code),
      window: INTERNAL_MFA_WINDOW
    });

    if (!isValid) {
      res.status(401).json({ success: false, message: 'Codice MFA non valido' });
      return;
    }

    await prisma.internalUser.update({
      where: { id: user.id },
      data: {
        mfaSecret: INTERNAL_MFA_DISABLED_SENTINEL
      }
    });

    try {
      await writeAuditLog(
        'INTERNAL_MFA_DEACTIVATED',
        'InternalUser',
        user.id,
        user.id,
        req.ip || null,
        user.email,
        req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : null,
        null
      );
    } catch (logError) {
      console.error('Audit log error (INTERNAL_MFA_DEACTIVATED):', logError);
    }

    res.json({
      success: true,
      message: 'MFA disattivata con successo'
    });
  } catch (error) {
    console.error('Internal MFA deactivate error:', error);
    res.status(500).json({ success: false, message: 'Errore interno del server' });
  }
});

app.post('/internal/auth/mfa/reset', requireInternalAuth, async (req, res) => {
  const { targetUserId, adminPassword, reason } = req.body || {};

  if (!INTERNAL_JWT_SECRET) {
    res.status(500).json({ success: false, message: 'Internal authentication not configured' });
    return;
  }

  if (!targetUserId || !adminPassword) {
    res
      .status(400)
      .json({ success: false, message: 'targetUserId e adminPassword sono obbligatori' });
    return;
  }

  try {
    const internalUser = (req as any).internalUser;
    const adminId = internalUser?.id as string | undefined;

    if (!adminId) {
      res.status(500).json({ success: false, message: 'Errore interno del server' });
      return;
    }

    const role = internalUser?.role as string | undefined;
    if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
      res
        .status(403)
        .json({ success: false, message: 'Permessi insufficienti per resettare MFA' });
      return;
    }

    const admin = await prisma.internalUser.findUnique({
      where: { id: adminId }
    });

    if (!admin) {
      res.status(500).json({ success: false, message: 'Utente interno non trovato' });
      return;
    }

    const passwordValid = await bcrypt.compare(adminPassword, admin.passwordHash);

    if (!passwordValid) {
      res.status(401).json({ success: false, message: 'Password amministratore non valida' });
      return;
    }

    const targetId = String(targetUserId);

    const target = await prisma.internalUser.findUnique({
      where: { id: targetId }
    });

    if (!target) {
      res.status(404).json({ success: false, message: 'Utente di destinazione non trovato' });
      return;
    }

    await prisma.internalUser.update({
      where: { id: target.id },
      data: {
        mfaSecret: INTERNAL_MFA_DISABLED_SENTINEL
      }
    });

    try {
      await writeAuditLog(
        'INTERNAL_MFA_RESET',
        'InternalUser',
        target.id,
        admin.id,
        req.ip || null,
        admin.email,
        req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : null,
        {
          targetUserId: target.id,
          reason: reason != null ? String(reason) : null
        }
      );
    } catch (logError) {
      console.error('Audit log error (INTERNAL_MFA_RESET):', logError);
    }

    res.json({
      success: true,
      message: 'MFA resettata con successo per l\'utente di destinazione'
    });
  } catch (error) {
    console.error('Internal MFA reset error:', error);
    res.status(500).json({ success: false, message: 'Errore interno del server' });
  }
});

app.post('/internal/auth/logout', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;

  try {
    await writeAuditLog(
      'INTERNAL_LOGOUT',
      'InternalUser',
      internalUser?.id ?? '',
      internalUser?.id ?? null,
      req.ip || null,
      internalUser?.email ?? null,
      req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null,
      null
    );
  } catch (logError) {
    console.error('Audit log error (INTERNAL_LOGOUT):', logError);
  }

  res.json({
    success: true,
    message: 'Logout effettuato con successo'
  });
});

function requireInternalAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!INTERNAL_JWT_SECRET) {
    res.status(500).json({ success: false, message: 'Internal authentication not configured' });
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Token mancante o non valido' });
    return;
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, INTERNAL_JWT_SECRET) as any;
    if (!payload || payload.type !== 'internal') {
      res.status(401).json({ success: false, message: 'Token non valido per API interne' });
      return;
    }

    (req as any).internalUser = {
      id: payload.sub as string,
      email: payload.email as string,
      role: payload.role as string
    };

    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token non valido o scaduto' });
  }
}

app.get('/internal/global-portals', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per visualizzare i portali globali' });
    return;
  }

  try {
    const registryPortals: PortalRegistryItem[] = PORTAL_REGISTRY.filter(p => p.implemented);
    const secrets = await prisma.globalPortalSecret.findMany();
    const secretsByPortalId = new Map<string, { data: string }>();
    for (const s of secrets) {
      secretsByPortalId.set(s.portalId, { data: s.data });
    }

    const result = [];
    for (const portal of registryPortals) {
      const secretRow = secretsByPortalId.get(portal.id) || null;
      let credentials: GlobalPortalCredentials | null = null;
      if (secretRow) {
        credentials = await getGlobalPortalCredentials(portal.id);
      }
      result.push({
        id: portal.id,
        label: portal.label,
        kind: portal.kind,
        modeLabel: portal.modeLabel,
        implemented: portal.implemented,
        feedPath: portal.feedPath ?? null,
        requirements: portal.requirements,
        credentials: sanitizeGlobalCredentialsForResponse(credentials)
      });
    }

    res.json({
      success: true,
      data: {
        portals: result
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Errore nel caricamento dei portali globali',
      error: error?.message ? String(error.message) : undefined
    });
  }
});

app.patch('/internal/global-portals/:portalId', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per aggiornare i portali globali' });
    return;
  }

  const portalId = String(req.params.portalId || '').trim();
  if (!portalId) {
    res.status(400).json({ success: false, message: 'portalId mancante' });
    return;
  }

  const portal = PORTAL_REGISTRY.find(p => p.id === portalId);
  if (!portal) {
    res.status(404).json({ success: false, message: 'Portale non trovato' });
    return;
  }

  const body = req.body || {};

  const username = body.username != null ? String(body.username).trim() : undefined;
  const password = body.password != null ? String(body.password) : undefined;
  const apiKey = body.apiKey != null ? String(body.apiKey) : undefined;
  const endpoint = body.endpoint != null ? String(body.endpoint).trim() : undefined;

  try {
    const existing = await getGlobalPortalCredentials(portalId);
    const next: GlobalPortalCredentials = {
      username: username !== undefined ? (username === '' ? null : username) : existing?.username ?? null,
      password: password !== undefined ? (password === '' ? null : password) : existing?.password ?? null,
      apiKey: apiKey !== undefined ? (apiKey === '' ? null : apiKey) : existing?.apiKey ?? null,
      endpoint: endpoint !== undefined ? (endpoint === '' ? null : endpoint) : existing?.endpoint ?? null
    };

    const allNull =
      !next.username &&
      !next.password &&
      !next.apiKey &&
      !next.endpoint;

    if (allNull) {
      await setGlobalPortalCredentials(portalId, null);
    } else {
      await setGlobalPortalCredentials(portalId, next);
    }

    await writePortalLog({
      portalId,
      operation: 'GLOBAL_PORTAL_CREDENTIALS_UPDATE',
      status: 'SUCCESS',
      message: `Credenziali globali aggiornate da utente interno ${internalUser?.id || ''}`
    });

    res.json({
      success: true,
      data: {
        portalId,
        credentials: sanitizeGlobalCredentialsForResponse(allNull ? null : next)
      }
    });
  } catch (error: any) {
    await writePortalLog({
      portalId,
      operation: 'GLOBAL_PORTAL_CREDENTIALS_UPDATE',
      status: 'ERROR',
      message: error?.message ? String(error.message) : 'Errore aggiornamento credenziali globali'
    });
    res.status(500).json({
      success: false,
      message: 'Errore durante l\'aggiornamento delle credenziali globali',
      error: error?.message ? String(error.message) : undefined
    });
  }
});

app.post('/internal/global-portals/:portalId/test', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per testare i portali globali' });
    return;
  }

  const portalId = String(req.params.portalId || '').trim();
  if (!portalId) {
    res.status(400).json({ success: false, message: 'portalId mancante' });
    return;
  }

  const portal = PORTAL_REGISTRY.find(p => p.id === portalId);
  if (!portal) {
    res.status(404).json({ success: false, message: 'Portale non trovato' });
    return;
  }

  const body = req.body || {};

  try {
    const stored = await getGlobalPortalCredentials(portalId);
    const effective: GlobalPortalCredentials = {
      username: body.username != null ? String(body.username).trim() : stored?.username ?? null,
      password: body.password != null ? String(body.password) : stored?.password ?? null,
      apiKey: body.apiKey != null ? String(body.apiKey) : stored?.apiKey ?? null,
      endpoint: body.endpoint != null ? String(body.endpoint).trim() : stored?.endpoint ?? null
    };

    const hasAuth =
      (effective.username && effective.password) ||
      effective.apiKey;

    if (!effective.endpoint || !hasAuth) {
      res.status(400).json({
        success: false,
        message: 'Parametri mancanti per il test connessione'
      });
      return;
    }

    await writePortalLog({
      portalId,
      operation: 'GLOBAL_PORTAL_TEST',
      status: 'SUCCESS',
      message: 'Test connessione simulato su portale globale'
    });

    res.json({
      success: true,
      data: {
        ok: true,
        message: 'Test connessione eseguito (validazione locale parametri, senza chiamate esterne)'
      }
    });
  } catch (error: any) {
    await writePortalLog({
      portalId,
      operation: 'GLOBAL_PORTAL_TEST',
      status: 'ERROR',
      message: error?.message ? String(error.message) : 'Errore test connessione portale globale'
    });
    res.status(500).json({
      success: false,
      message: 'Errore durante il test connessione',
      error: error?.message ? String(error.message) : undefined
    });
  }
});

app.post('/internal/agencies', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per creare agenzie' });
    return;
  }

  const name = req.body?.name != null ? String(req.body.name).trim() : '';
  const email = req.body?.email != null ? String(req.body.email).trim() : '';
  const status = req.body?.status != null ? String(req.body.status).trim() : '';
  const planCode = req.body?.planCode != null ? String(req.body.planCode).trim() : '';

  if (!name || !email) {
    res.status(400).json({ success: false, message: 'Nome ed email sono obbligatori' });
    return;
  }

  const agencyStatus: AgencyStatus =
    status && Object.prototype.hasOwnProperty.call(AgencyStatus, status) ? (status as AgencyStatus) : AgencyStatus.PENDING_PROVISIONING;

  const slugBase = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  const slug = slugBase || `agency-${Date.now()}`;

  try {
    const result = await prisma.$transaction(async tx => {
      const agency = await tx.agency.create({
        data: {
          name,
          email,
          slug,
          status: agencyStatus
        }
      });

      let subscription: any = null;

      if (planCode) {
        subscription = await tx.subscription.create({
          data: {
            agencyId: agency.id,
            planCode,
            status: 'ACTIVE' as any
          }
        });
      }

      return { agency, subscription };
    });

    try {
      await writeAuditLog(
        'INTERNAL_AGENCY_CREATED',
        'Agency',
        result.agency.id,
        internalUser?.id ?? null,
        req.ip || null,
        internalUser?.email ?? null,
        req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : null,
        {
          agencyId: result.agency.id,
          subscriptionId: result.subscription?.id ?? null,
          planCode: result.subscription?.planCode ?? null
        }
      );
    } catch (logError) {
      console.error('Audit log error (INTERNAL_AGENCY_CREATED):', logError);
    }

    res.status(201).json({
      success: true,
      data: {
        agency: result.agency,
        subscription: result.subscription
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'Errore creazione agenzia' });
  }
});

app.get('/internal/agencies', requireInternalAuth, async (req, res) => {
  const status = req.query.status != null ? String(req.query.status) : '';
  const plan = req.query.plan != null ? String(req.query.plan) : '';

  const where: Prisma.AgencyWhereInput = {};

  if (status && Object.prototype.hasOwnProperty.call(AgencyStatus, status)) {
    where.status = status as AgencyStatus;
  }

  if (plan) {
    where.subscriptions = {
      some: {
        planCode: plan
      }
    };
  }

  try {
    const agencies = await prisma.agency.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        instances: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    const data = agencies.map(a => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      status: a.status,
      onboardingStatus: a.onboardingStatus,
      createdAt: a.createdAt,
      currentPlanCode: a.subscriptions[0]?.planCode ?? null,
      instance: a.instances[0]
        ? {
            id: a.instances[0].id,
            status: a.instances[0].status,
            slug: a.instances[0].slug,
            baseUrl: a.instances[0].baseUrl
          }
        : null
    }));

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'Errore caricamento agenzie' });
  }
});

app.get('/internal/agencies/:id', requireInternalAuth, async (req, res) => {
  const id = req.params.id;

  try {
    const agency = await prisma.agency.findUnique({
      where: { id },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' }
        },
        instances: {
          orderBy: { createdAt: 'desc' }
        },
        tickets: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            type: true,
            status: true,
            subject: true,
            createdAt: true
          }
        },
        portalActivationRequests: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            agency: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true
              }
            },
            assignedTo: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (!agency) {
      res.status(404).json({ success: false, message: 'Agenzia non trovata' });
      return;
    }

    res.json({ success: true, data: agency });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'Errore caricamento agenzia' });
  }
});

app.post('/internal/agencies/:id/retry-provisioning', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per riprovare il provisioning' });
    return;
  }

  const id = req.params.id;

  try {
    const agency = await prisma.agency.findUnique({
      where: { id },
      include: {
        instances: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!agency) {
      res.status(404).json({ success: false, message: 'Agenzia non trovata' });
      return;
    }

    const updated = await prisma.agency.update({
      where: { id: agency.id },
      data: {
        status: AgencyStatus.PENDING_PROVISIONING
      }
    });

    try {
      await writeAuditLog(
        'INTERNAL_AGENCY_RETRY_PROVISIONING',
        'Agency',
        updated.id,
        internalUser?.id ?? null,
        req.ip || null,
        internalUser?.email ?? null,
        req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        {
          previousStatus: agency.status,
          newStatus: updated.status
        } as any
      );
    } catch (logError) {
      console.error('Audit log error (INTERNAL_AGENCY_RETRY_PROVISIONING):', logError);
    }

    processPendingProvisioningAgencies().catch(error => {
      console.error('Error triggering provisioning after retry:', error?.message || error);
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message ? String(error.message) : 'Errore durante il retry del provisioning'
    });
  }
});

app.post('/internal/agencies/:id/reset-onboarding', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per resettare lâ€™onboarding' });
    return;
  }

  const id = req.params.id;

  try {
    const agency = await prisma.agency.findUnique({
      where: { id },
      select: {
        id: true,
        onboardingStatus: true,
        onboardingStep: true
      }
    });

    if (!agency) {
      res.status(404).json({ success: false, message: 'Agenzia non trovata' });
      return;
    }

    const updated = await prisma.agency.update({
      where: { id },
      data: {
        onboardingStatus: OnboardingStatus.PENDING,
        onboardingStep: null
      }
    });

    try {
      await writeAuditLog(
        'INTERNAL_AGENCY_RESET_ONBOARDING',
        'Agency',
        updated.id,
        internalUser?.id ?? null,
        req.ip || null,
        internalUser?.email ?? null,
        req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        {
          previousOnboardingStatus: agency.onboardingStatus,
          previousOnboardingStep: agency.onboardingStep,
          newOnboardingStatus: updated.onboardingStatus,
          newOnboardingStep: updated.onboardingStep
        } as any
      );
    } catch (logError) {
      console.error('Audit log error (INTERNAL_AGENCY_RESET_ONBOARDING):', logError);
    }

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message ? String(error.message) : 'Errore durante il reset dellâ€™onboarding'
    });
  }
});

app.patch('/internal/agencies/:id', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per modificare agenzie' });
    return;
  }

  const id = req.params.id;
  const data: Prisma.AgencyUpdateInput = {};

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
    const name = req.body?.name != null ? String(req.body.name).trim() : '';
    if (!name) {
      res.status(400).json({ success: false, message: 'Il nome non puÃ² essere vuoto' });
      return;
    }
    data.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
    const status = req.body?.status != null ? String(req.body.status).trim() : '';
    if (status && Object.prototype.hasOwnProperty.call(AgencyStatus, status)) {
      data.status = status as AgencyStatus;
    }
  }

  try {
    const agency = await prisma.agency.update({
      where: { id },
      data
    });

    try {
      await writeAuditLog(
        'INTERNAL_AGENCY_UPDATED',
        'Agency',
        agency.id,
        internalUser?.id ?? null,
        req.ip || null,
        internalUser?.email ?? null,
        req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : null,
        req.body || null
      );
    } catch (logError) {
      console.error('Audit log error (INTERNAL_AGENCY_UPDATED):', logError);
    }

    res.json({ success: true, data: agency });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'Errore aggiornamento agenzia' });
  }
});

app.get('/internal/instances', requireInternalAuth, async (req, res) => {
  const status = req.query.status != null ? String(req.query.status) : '';
  const agencyId = req.query.agencyId != null ? String(req.query.agencyId) : '';

  const where: Prisma.InstanceWhereInput = {};

  if (status && Object.prototype.hasOwnProperty.call(InstanceStatus, status)) {
    where.status = status as InstanceStatus;
  }

  if (agencyId) {
    where.agencyId = agencyId;
  }

  try {
    const instances = await prisma.instance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        agency: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    res.json({ success: true, data: instances });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'Errore caricamento istanze' });
  }
});

app.get('/internal/instances/:id', requireInternalAuth, async (req, res) => {
  const id = req.params.id;

  try {
    const instance = await prisma.instance.findUnique({
      where: { id },
      include: {
        agency: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    if (!instance) {
      res.status(404).json({ success: false, message: 'Istanza non trovata' });
      return;
    }

    res.json({ success: true, data: instance });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'Errore caricamento istanza' });
  }
});

app.get('/internal/subscriptions', requireInternalAuth, async (req, res) => {
  const agencyId = req.query.agencyId != null ? String(req.query.agencyId) : '';
  const status = req.query.status != null ? String(req.query.status) : '';
  const planCode = req.query.planCode != null ? String(req.query.planCode) : '';

  const where: Prisma.SubscriptionWhereInput = {};

  if (agencyId) {
    where.agencyId = agencyId;
  }

  if (status && Object.prototype.hasOwnProperty.call(SubscriptionStatus, status)) {
    where.status = status as SubscriptionStatus;
  }

  if (planCode) {
    where.planCode = planCode;
  }

  try {
    const subscriptions = await prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        agency: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    res.json({ success: true, data: subscriptions });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'Errore caricamento abbonamenti' });
  }
});

app.get('/internal/subscriptions/:id', requireInternalAuth, async (req, res) => {
  const id = req.params.id;

  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: {
        agency: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    if (!subscription) {
      res.status(404).json({ success: false, message: 'Abbonamento non trovato' });
      return;
    }

    res.json({ success: true, data: subscription });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'Errore caricamento abbonamento' });
  }
});

app.patch('/internal/subscriptions/:id', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'BILLING') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per modificare abbonamenti' });
    return;
  }

  const id = req.params.id;
  const body = req.body || {};
  const data: Prisma.SubscriptionUpdateInput = {};

  if (Object.prototype.hasOwnProperty.call(body, 'planCode')) {
    const planCode = body.planCode != null ? String(body.planCode).trim() : '';
    if (!planCode) {
      res.status(400).json({ success: false, message: 'Il piano non puÃ² essere vuoto' });
      return;
    }
    data.planCode = planCode;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = body.status != null ? String(body.status).trim() : '';
    if (status && Object.prototype.hasOwnProperty.call(SubscriptionStatus, status)) {
      data.status = status as SubscriptionStatus;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'currentPeriodEnd')) {
    const raw = body.currentPeriodEnd;
    if (raw == null || raw === '') {
      data.currentPeriodEnd = null;
    } else {
      const date = new Date(String(raw));
      if (isNaN(date.getTime())) {
        res.status(400).json({ success: false, message: 'Data rinnovo non valida' });
        return;
      }
      data.currentPeriodEnd = date;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'stripeCustomerId')) {
    const value = body.stripeCustomerId;
    const normalized = value == null || value === '' ? null : String(value).trim();
    data.stripeCustomerId = normalized;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'stripeSubscriptionId')) {
    const value = body.stripeSubscriptionId;
    const normalized = value == null || value === '' ? null : String(value).trim();
    data.stripeSubscriptionId = normalized;
  }

  try {
    const subscription = await prisma.subscription.update({
      where: { id },
      data
    });

    try {
      await writeAuditLog(
        'INTERNAL_SUBSCRIPTION_UPDATED',
        'Subscription',
        subscription.id,
        internalUser?.id ?? null,
        req.ip || null,
        internalUser?.email ?? null,
        req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : null,
        req.body || null
      );
    } catch (logError) {
      console.error('Audit log error (INTERNAL_SUBSCRIPTION_UPDATED):', logError);
    }

    res.json({ success: true, data: subscription });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Abbonamento non trovato' });
      return;
    }
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'Errore aggiornamento abbonamento' });
  }
});

app.post('/internal/users/:id/reset-password', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per resettare password utenti interni' });
    return;
  }

  const targetId = String(req.params.id || '').trim();
  if (!targetId) {
    res.status(400).json({ success: false, message: 'ID utente mancante' });
    return;
  }

  const body = req.body || {};
  const newPassword = body.newPassword != null ? String(body.newPassword) : '';
  const adminPassword = body.adminPassword != null ? String(body.adminPassword) : '';

  if (!newPassword || newPassword.length < 8) {
    res.status(400).json({ success: false, message: 'La nuova password deve avere almeno 8 caratteri' });
    return;
  }

  if (!adminPassword) {
    res.status(400).json({ success: false, message: 'Password amministratore obbligatoria' });
    return;
  }

  try {
    const admin = await prisma.internalUser.findUnique({
      where: { id: internalUser.id }
    });

    if (!admin) {
      res.status(500).json({ success: false, message: 'Utente interno non trovato' });
      return;
    }

    const passwordValid = await bcrypt.compare(adminPassword, admin.passwordHash);

    if (!passwordValid) {
      res.status(401).json({ success: false, message: 'Password amministratore non valida' });
      return;
    }

    const target = await prisma.internalUser.findUnique({
      where: { id: targetId }
    });

    if (!target) {
      res.status(404).json({ success: false, message: 'Utente interno non trovato' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.internalUser.update({
      where: { id: target.id },
      data: {
        passwordHash
      }
    });

    try {
      await writeAuditLog(
        'INTERNAL_USER_PASSWORD_RESET',
        'InternalUser',
        target.id,
        admin.id,
        req.ip || null,
        admin.email,
        req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : null,
        {
          targetUserId: target.id
        }
      );
    } catch (logError) {
      console.error('Audit log error (INTERNAL_USER_PASSWORD_RESET):', logError);
    }

    res.json({
      success: true,
      message: 'Password utente interno resettata con successo'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message ? String(error.message) : 'Errore reset password utente interno'
    });
  }
});

app.patch('/internal/users/:id/role', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per modificare ruoli utenti interni' });
    return;
  }

  const targetId = String(req.params.id || '').trim();
  if (!targetId) {
    res.status(400).json({ success: false, message: 'ID utente mancante' });
    return;
  }

  const body = req.body || {};
  const rawRole = body.role != null ? String(body.role).trim().toUpperCase() : '';

  if (!rawRole) {
    res.status(400).json({ success: false, message: 'Ruolo obbligatorio' });
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(InternalUserRole, rawRole)) {
    res.status(400).json({ success: false, message: 'Ruolo interno non valido' });
    return;
  }

  if (rawRole === 'OWNER' && role !== 'OWNER') {
    res.status(403).json({ success: false, message: 'Solo OWNER puÃ² assegnare il ruolo OWNER' });
    return;
  }

  try {
    const target = await prisma.internalUser.findUnique({
      where: { id: targetId }
    });

    if (!target) {
      res.status(404).json({ success: false, message: 'Utente interno non trovato' });
      return;
    }

    const oldRole = target.role;

    const updated = await prisma.internalUser.update({
      where: { id: target.id },
      data: {
        role: rawRole as InternalUserRole
      }
    });

    try {
      await writeAuditLog(
        'INTERNAL_USER_ROLE_CHANGED',
        'InternalUser',
        updated.id,
        internalUser.id,
        req.ip || null,
        internalUser.email,
        req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : null,
        {
          targetUserId: updated.id,
          oldRole,
          newRole: updated.role
        }
      );
    } catch (logError) {
      console.error('Audit log error (INTERNAL_USER_ROLE_CHANGED):', logError);
    }

    res.json({
      success: true,
      message: 'Ruolo utente interno aggiornato con successo',
      data: {
        id: updated.id,
        email: updated.email,
        role: updated.role
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message ? String(error.message) : 'Errore aggiornamento ruolo utente interno'
    });
  }
});

app.get('/internal/audit-logs', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per visualizzare gli audit log' });
    return;
  }

  const action = req.query.action != null ? String(req.query.action).trim() : '';
  const entity = req.query.entity != null ? String(req.query.entity).trim() : '';
  const entityId = req.query.entityId != null ? String(req.query.entityId).trim() : '';
  const userId = req.query.userId != null ? String(req.query.userId).trim() : '';
  const from = req.query.from != null ? String(req.query.from).trim() : '';
  const to = req.query.to != null ? String(req.query.to).trim() : '';
  const page = req.query.page != null ? Number(req.query.page) : 1;
  const limit = req.query.limit != null ? Number(req.query.limit) : 50;

  const where: Prisma.AuditLogWhereInput = {};

  if (action) {
    where.action = {
      contains: action,
      mode: 'insensitive'
    };
  }

  if (entity) {
    where.entity = {
      contains: entity,
      mode: 'insensitive'
    };
  }

  if (entityId) {
    where.entityId = {
      contains: entityId,
      mode: 'insensitive'
    };
  }

  if (userId) {
    where.userId = userId;
  }

  if (from || to) {
    where.createdAt = {};
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        where.createdAt.gte = fromDate;
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) {
        where.createdAt.lte = toDate;
      }
    }
  }

  const pageNumber = Number.isFinite(page) && page > 0 ? page : 1;
  const limitNumber = Number.isFinite(limit) && limit > 0 && limit <= 200 ? limit : 50;
  const skip = (pageNumber - 1) * limitNumber;

  try {
    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNumber
      })
    ]);

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          total,
          page: pageNumber,
          limit: limitNumber,
          pages: Math.ceil(total / limitNumber)
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message ? String(error.message) : 'Errore caricamento audit log'
    });
  }
});

app.post('/internal/portal-activation-requests', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per creare richieste di attivazione portale' });
    return;
  }

  const body = req.body || {};
  const agencyId = body.agencyId != null ? String(body.agencyId).trim() : '';
  const portalId = body.portalId != null ? String(body.portalId).trim() : '';
  const notes = body.notes != null ? String(body.notes) : undefined;

  if (!agencyId) {
    res.status(400).json({ success: false, message: 'agencyId mancante' });
    return;
  }

  if (!portalId) {
    res.status(400).json({ success: false, message: 'portalId mancante' });
    return;
  }

  const portal = PORTAL_REGISTRY.find((p) => p.id === portalId);
  if (!portal) {
    res.status(404).json({ success: false, message: 'Portale non trovato' });
    return;
  }

  try {
    const agency = await prisma.agency.findUnique({
      where: { id: agencyId },
      select: { id: true }
    });

    if (!agency) {
      res.status(404).json({ success: false, message: 'Agenzia non trovata' });
      return;
    }

    const existing = await prisma.portalActivationRequest.findFirst({
      where: {
        agencyId,
        portalId,
        status: {
          in: [PortalActivationStatus.OPEN, PortalActivationStatus.IN_PROGRESS]
        }
      }
    });

    if (existing) {
      res.status(400).json({ success: false, message: 'Esiste giÃ  una richiesta di attivazione aperta per questo portale' });
      return;
    }

    const created = await createPortalActivationRequest({
      agency: {
        connect: {
          id: agencyId
        }
      },
      portalId,
      status: PortalActivationStatus.OPEN,
      notes: notes ?? null
    });

    await writeAuditLog(
      'REQUEST_PORTAL_ACTIVATION',
      'PortalActivationRequest',
      created.id,
      internalUser?.id ?? null,
      req.ip || null,
      internalUser?.email ?? null,
      req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null,
      {
        portalId,
        agencyId
      }
    );

    res.status(201).json({
      success: true,
      data: created
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message ? String(error.message) : 'Errore creazione richiesta di attivazione portale'
    });
  }
});

app.get('/internal/portal-activation-requests', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per visualizzare le richieste di attivazione portale' });
    return;
  }

  const agencyId = req.query.agencyId != null ? String(req.query.agencyId) : '';
  const portalId = req.query.portalId != null ? String(req.query.portalId) : '';
  const rawStatus = req.query.status != null ? String(req.query.status).trim().toUpperCase() : '';
  const page = req.query.page != null ? Number(req.query.page) : 1;
  const limit = req.query.limit != null ? Number(req.query.limit) : 50;

  const where: Prisma.PortalActivationRequestWhereInput = {};

  if (agencyId) {
    where.agencyId = agencyId;
  }

  if (portalId) {
    where.portalId = portalId;
  }

  if (rawStatus) {
    if (Object.prototype.hasOwnProperty.call(PortalActivationStatus, rawStatus)) {
      where.status = rawStatus as PortalActivationStatus;
    } else {
      res.status(400).json({ success: false, message: 'Stato non valido' });
      return;
    }
  }

  const pageNumber = Number.isFinite(page) && page > 0 ? page : 1;
  const limitNumber = Number.isFinite(limit) && limit > 0 && limit <= 200 ? limit : 50;
  const skip = (pageNumber - 1) * limitNumber;

  try {
    const [total, items] = await Promise.all([
      prisma.portalActivationRequest.count({ where }),
      prisma.portalActivationRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNumber,
        include: {
          agency: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true
            }
          },
          assignedTo: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          total,
          page: pageNumber,
          limit: limitNumber,
          pages: Math.ceil(total / limitNumber)
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message ? String(error.message) : 'Errore caricamento richieste di attivazione portale'
    });
  }
});

app.get('/internal/portal-activation-requests/:id', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per visualizzare la richiesta di attivazione portale' });
    return;
  }

  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ success: false, message: 'ID richiesta mancante' });
    return;
  }

  try {
    const requestRow = await prisma.portalActivationRequest.findUnique({
      where: { id },
      include: {
        agency: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true
          }
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    if (!requestRow) {
      res.status(404).json({ success: false, message: 'Richiesta di attivazione non trovata' });
      return;
    }

    res.json({
      success: true,
      data: requestRow
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message ? String(error.message) : 'Errore caricamento richiesta di attivazione portale'
    });
  }
});

app.patch('/internal/portal-activation-requests/:id', requireInternalAuth, async (req, res) => {
  const internalUser = (req as any).internalUser;
  const role = internalUser?.role as string | undefined;

  if (role !== 'OWNER' && role !== 'OPS_ADMIN') {
    res.status(403).json({ success: false, message: 'Permessi insufficienti per aggiornare la richiesta di attivazione portale' });
    return;
  }

  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ success: false, message: 'ID richiesta mancante' });
    return;
  }

  const body = req.body || {};
  const data: Prisma.PortalActivationRequestUpdateInput = {};

  if (Object.prototype.hasOwnProperty.call(body, 'assignedToId')) {
    const assignedToIdRaw = body.assignedToId;
    const assignedToId =
      assignedToIdRaw == null || assignedToIdRaw === '' ? null : String(assignedToIdRaw).trim();
    data.assignedTo = assignedToId
      ? {
          connect: {
            id: assignedToId
          }
        }
      : {
          disconnect: true
        };
  }

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const raw = body.status != null ? String(body.status).trim().toUpperCase() : '';
    if (raw) {
      if (Object.prototype.hasOwnProperty.call(PortalActivationStatus, raw)) {
        data.status = raw as PortalActivationStatus;
      } else {
        res.status(400).json({ success: false, message: 'Stato non valido' });
        return;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    const notesRaw = body.notes;
    data.notes = notesRaw == null ? null : String(notesRaw);
  }

  try {
    const updated = await updatePortalActivationRequest(id, data);

    if (updated.status === PortalActivationStatus.COMPLETED) {
      const credentialsRaw = body.portalCredentials;
      if (credentialsRaw && typeof credentialsRaw === 'object') {
        const value: Record<string, string> = {};
        for (const [k, v] of Object.entries(credentialsRaw)) {
          if (!k) continue;
          if (v == null) continue;
          value[String(k)] = String(v);
        }
        if (Object.keys(value).length > 0) {
          await saveSecret(`portal/${updated.portalId}/agency/${updated.agencyId}`, value);
        }
      }

      try {
        await upsertPortalConfig({
          portalId: updated.portalId,
          agencyId: updated.agencyId,
          type: PortalConfigType.PER_AGENZIA,
          status: PortalConfigStatus.ACTIVE,
          active: true
        });
      } catch (configError: any) {
        console.error('Errore aggiornamento PortalConfig dopo completamento richiesta portale:', configError);
      }

      try {
        const internalToken = createInternalJwtToken('SYSTEM');
        const instance = await prisma.instance.findFirst({
          where: { agencyId: updated.agencyId, status: InstanceStatus.READY },
          orderBy: { createdAt: 'desc' }
        });
        const instanceBaseUrl = instance?.baseUrl ? normalizeBaseUrl(instance.baseUrl) : null;
        if (internalToken && instanceBaseUrl) {
          const url = new URL(
            `/internal/portals/${encodeURIComponent(updated.portalId)}/activate`,
            instanceBaseUrl
          );
          await fetch(url.toString(), {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${internalToken}`,
              Accept: 'application/json'
            }
          } as any);
        }
      } catch (instanceError: any) {
        console.error(
          'Errore chiamata endpoint interno istanza per attivazione portale:',
          instanceError?.message || instanceError
        );
      }
    }

    await writeAuditLog(
      'UPDATE_PORTAL_ACTIVATION',
      'PortalActivationRequest',
      updated.id,
      internalUser?.id ?? null,
      req.ip || null,
      internalUser?.email ?? null,
      req.headers['user-agent'] && typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null,
      {
        status: updated.status,
        agencyId: updated.agencyId,
        portalId: updated.portalId
      }
    );

    res.json({
      success: true,
      data: updated
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Richiesta di attivazione non trovata' });
      return;
    }
    res.status(500).json({
      success: false,
      message: error?.message ? String(error.message) : 'Errore aggiornamento richiesta di attivazione portale'
    });
  }
});

app.post('/internal/portals/:portalId/activate', async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Token mancante o non valido' });
    return;
  }

  if (!INTERNAL_JWT_SECRET) {
    res.status(500).json({ success: false, message: 'Internal authentication not configured' });
    return;
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, INTERNAL_JWT_SECRET) as any;
    if (!payload || payload.type !== 'internal') {
      res.status(401).json({ success: false, message: 'Token non valido per API interne' });
      return;
    }
  } catch {
    res.status(401).json({ success: false, message: 'Token non valido o scaduto' });
    return;
  }

  const portalId = String(req.params.portalId || '').trim();
  if (!portalId) {
    res.status(400).json({ success: false, message: 'portalId mancante' });
    return;
  }

  try {
    const agency = await prisma.agency.findFirst({ select: { id: true } });
    if (!agency) {
      res.status(404).json({ success: false, message: 'Agency non trovata' });
      return;
    }

    const updated = await upsertPortalConfig({
      portalId,
      agencyId: agency.id,
      type: PortalConfigType.PER_AGENZIA,
      status: PortalConfigStatus.ACTIVE,
      active: true
    });

    res.json({
      success: true,
      data: updated
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message ? String(error.message) : 'Errore attivazione portale interno'
    });
  }
});

// Auth endpoints
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { agency: true }
    });

    if (user && (await bcrypt.compare(password, user.password))) {
      const token = jwt.sign(
        { role: user.role, agencyId: user.agencyId ?? null },
        getJwtSecret(),
        { subject: user.id, expiresIn: '7d' }
      );

      const refreshToken = jwt.sign(
        { type: 'refresh' },
        getRefreshJwtSecret(),
        { subject: user.id, expiresIn: '30d' }
      );

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            avatar: user.avatar,
            mustChangePassword: user.mustChangePassword,
            agency: {
              id: user.agency.id,
              name: user.agency.name,
              logo: user.agency.logo
            }
          },
          token,
          refreshToken
        }
      });
    } else {
      // Fallback for hardcoded demo login if DB login fails (optional, but good for transition)
      if (email === 'demo@crm.it' && password === 'password123') {
         // ... existing fallback code or just fail
         res.status(401).json({ success: false, message: 'Invalid credentials (Use: admin@agenziademo.it / demo123)' });
      } else {
        res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const tokenFromBody = req.body?.refreshToken != null ? String(req.body.refreshToken).trim() : '';
    const tokenFromBearer = getBearerToken(req);
    const refreshToken = tokenFromBody || tokenFromBearer || '';
    if (!refreshToken) return res.status(401).json({ success: false, message: 'Unauthorized' });

    let decoded: any = null;
    try {
      decoded = jwt.verify(refreshToken, getRefreshJwtSecret()) as any;
    } catch {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (decoded?.type !== 'refresh') {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = decoded?.sub != null ? String(decoded.sub).trim() : '';
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { agency: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const token = jwt.sign(
      { role: user.role, agencyId: user.agencyId ?? null },
      getJwtSecret(),
      { subject: user.id, expiresIn: '7d' }
    );

    const nextRefreshToken = jwt.sign(
      { type: 'refresh' },
      getRefreshJwtSecret(),
      { subject: user.id, expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Token refreshed',
      data: { token, refreshToken: nextRefreshToken }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message ? String(error.message) : 'Refresh failed' });
  }
});

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const currentPassword = req.body?.currentPassword != null ? String(req.body.currentPassword) : '';
    const newPassword = req.body?.newPassword != null ? String(req.body.newPassword) : '';

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Password attuale e nuova password sono obbligatorie' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'La nuova password deve avere almeno 6 caratteri' });
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.id }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utente non trovato' });
    }

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      return res.status(400).json({ success: false, message: 'Password attuale non corretta' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        mustChangePassword: false
      }
    });

    res.json({ success: true, message: 'Password aggiornata con successo' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Errore durante il cambio password' });
  }
});

// Properties endpoints
const PROPERTY_PENDING_APPROVAL_TAG = '[PENDING_APPROVAL]';

const hasPendingApprovalTag = (notes: string | null | undefined) =>
  typeof notes === 'string' && notes.includes(PROPERTY_PENDING_APPROVAL_TAG);

const appendPendingApprovalTag = (
  notes: string | null | undefined,
  submittedById: string
) => {
  const baseNotes = typeof notes === 'string' ? notes.trim() : '';
  if (hasPendingApprovalTag(baseNotes)) return baseNotes;
  const marker = `${PROPERTY_PENDING_APPROVAL_TAG}[by:${submittedById}][at:${new Date().toISOString()}]`;
  return baseNotes ? `${baseNotes}\n${marker}` : marker;
};

const clearPendingApprovalTag = (notes: string | null | undefined) => {
  if (typeof notes !== 'string') return '';
  return notes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.includes(PROPERTY_PENDING_APPROVAL_TAG))
    .join('\n');
};

const sanitizePublicationReviewPayload = (value: any) => {
  if (!value || typeof value !== 'object') return null;
  const hiddenFields = Array.isArray(value.hiddenFields)
    ? value.hiddenFields.filter((item: any) => typeof item === 'string' && item.trim())
    : [];
  const adminNote = typeof value.adminNote === 'string' ? value.adminNote.trim() : '';
  const reviewedAt = typeof value.reviewedAt === 'string' && value.reviewedAt.trim() ? value.reviewedAt.trim() : undefined;
  const reviewedByRole = typeof value.reviewedByRole === 'string' && value.reviewedByRole.trim()
    ? value.reviewedByRole.trim()
    : undefined;
  return {
    hiddenFields,
    adminNote,
    ...(reviewedAt ? { reviewedAt } : {}),
    ...(reviewedByRole ? { reviewedByRole } : {})
  };
};

const enforcePropertyPublicationControlsByRole = (
  role: string | null | undefined,
  nextOneClickData: any,
  previousOneClickData?: any
) => {
  const current = nextOneClickData && typeof nextOneClickData === 'object' ? { ...nextOneClickData } : {};
  const previous = previousOneClickData && typeof previousOneClickData === 'object' ? previousOneClickData : {};
  const adminRole = isAdminRole(role);

  if (adminRole) {
    const nextReview = sanitizePublicationReviewPayload(current.publicationReview);
    if (nextReview) {
      current.publicationReview = nextReview;
    } else {
      delete current.publicationReview;
    }
    return current;
  }

  if (Array.isArray(previous?.selectedPortalCodes)) {
    current.selectedPortalCodes = previous.selectedPortalCodes;
  } else if (!Array.isArray(current.selectedPortalCodes) || current.selectedPortalCodes.length === 0) {
    current.selectedPortalCodes = [20];
  }

  const previousReview = sanitizePublicationReviewPayload(previous?.publicationReview);
  if (previousReview) {
    current.publicationReview = previousReview;
  } else {
    delete current.publicationReview;
  }

  return current;
};

const geocodeStreetCache = new Map<string, { expiresAt: number; data: any[] }>();

app.get('/api/geocoding/streets/autocomplete', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const street = String(req.query?.q || '').trim();
    const full = String(req.query?.full || '').trim();
    const city = String(req.query?.city || '').trim();
    const province = String(req.query?.province || '').trim();
    const zipCode = String(req.query?.zipCode || '').trim();
    const number = String(req.query?.number || '').trim();
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(30, Math.trunc(limitRaw))) : 20;

    if (street.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const norm = (value: string) =>
      String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const cacheKey = `${street}|${full}|${number}|${city}|${province}|${zipCode}|${limit}`.toLowerCase();
    const cached = geocodeStreetCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ success: true, data: cached.data });
    }

    const queryCandidates = Array.from(
      new Set(
        [
          [street, number, city, province, zipCode, 'Italia'].filter(Boolean).join(', '),
          full ? [full, 'Italia'].filter(Boolean).join(', ') : '',
          [street, city, province, zipCode, 'Italia'].filter(Boolean).join(', '),
          [street, number, city, 'Italia'].filter(Boolean).join(', '),
          [street, number, 'Italia'].filter(Boolean).join(', '),
          [street, 'Italia'].filter(Boolean).join(', ')
        ].map((v) => v.trim()).filter(Boolean)
      )
    ).slice(0, 5);

    const collected: any[] = [];
    for (const candidate of queryCandidates) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=it&limit=50&dedupe=0&q=${encodeURIComponent(candidate)}`;
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'CosmoCasaCRM/1.0 (geocoding autocomplete)',
            'Accept-Language': 'it-IT,it;q=0.9'
          }
        });
        clearTimeout(timeout);
        if (!response.ok) continue;
        const raw = await response.json().catch(() => []);
        const items = Array.isArray(raw) ? raw : [];
        collected.push(...items);
      } catch {
        clearTimeout(timeout);
      }
      if (collected.length >= 120) break;
    }

    // Photon sempre interrogato (non solo come fallback): ha copertura strade
    // molto migliore per l'autocomplete, cosi' si riducono le vie mancanti.
    {
      for (const candidate of queryCandidates.slice(0, 3)) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        try {
          const url = `https://photon.komoot.io/api/?limit=30&lang=it&q=${encodeURIComponent(candidate)}`;
          const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'CosmoCasaCRM/1.0 (geocoding autocomplete fallback)' }
          });
          clearTimeout(timeout);
          if (!response.ok) continue;
          const raw = await response.json().catch(() => null);
          const features = Array.isArray(raw?.features) ? raw.features : [];
          collected.push(...features.map((feature: any) => {
            const p = feature?.properties || {};
            const coords = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
            return {
              display_name: [
                p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ''}` : p.name,
                p.postcode,
                p.city,
                p.county || p.state,
                p.country
              ].filter(Boolean).join(', '),
              lat: coords.length >= 2 ? coords[1] : undefined,
              lon: coords.length >= 2 ? coords[0] : undefined,
              importance: 0.5,
              address: {
                road: p.street || p.name || '',
                house_number: p.housenumber || '',
                city: p.city || p.town || p.village || '',
                county: p.county || '',
                state: p.state || '',
                postcode: p.postcode || ''
              }
            };
          }));
        } catch {
          clearTimeout(timeout);
        }
        if (collected.length >= 200) break;
      }
    }

    if (collected.length === 0) {
      geocodeStreetCache.set(cacheKey, {
        data: [],
        expiresAt: Date.now() + 1000 * 60 * 10
      });
      return res.json({ success: true, data: [] });
    }

    const mapped = collected.map((item: any) => {
      const address = item?.address || {};
      const road =
        address.road ||
        address.pedestrian ||
        address.path ||
        address.footway ||
        address.cycleway ||
        address.residential ||
        '';
      const cityName =
        address.city ||
        address.town ||
        address.village ||
        address.hamlet ||
        address.municipality ||
        '';
      const provinceName =
        address.county ||
        address.state_district ||
        address.state ||
        '';

      const row = {
        label: item?.display_name || [road, cityName].filter(Boolean).join(', '),
        road: String(road || '').trim(),
        houseNumber: String(address.house_number || '').trim(),
        city: String(cityName || '').trim(),
        postcode: String(address.postcode || '').trim(),
        province: String(provinceName || '').trim(),
        provinceCode: String(address.state_code || '').trim().toUpperCase(),
        latitude: Number(item?.lat),
        longitude: Number(item?.lon),
        importance: Number(item?.importance || 0)
      };

      const roadNorm = norm(row.road);
      const streetNorm = norm(street);
      const cityNorm = norm(row.city);
      const reqCityNorm = norm(city);
      const labelNorm = norm(String(row.label || ''));
      const provNorm = norm(row.provinceCode || row.province);
      const reqProvNorm = norm(province);
      const zipNorm = String(row.postcode || '').trim();
      const reqZipNorm = String(zipCode || '').trim();
      const houseNorm = norm(row.houseNumber);
      const reqHouseNorm = norm(number);

      // Scarta per città solo se il risultato HA una città diversa da quella
      // richiesta. Le vie senza città risolta vengono mantenute (la città verra'
      // riempita con quella richiesta) per non perdere strade valide.
      if (reqCityNorm && cityNorm && cityNorm !== reqCityNorm && !labelNorm.includes(reqCityNorm)) {
        return null;
      }
      if (reqZipNorm && zipNorm && zipNorm !== reqZipNorm) {
        return null;
      }

      let score = 0;
      if (roadNorm === streetNorm) score += 100;
      else if (roadNorm.startsWith(streetNorm)) score += 70;
      else if (roadNorm.includes(streetNorm)) score += 40;
      if (reqCityNorm && cityNorm === reqCityNorm) score += 25;
      if (reqProvNorm && provNorm.includes(reqProvNorm)) score += 18;
      if (reqZipNorm && zipNorm === reqZipNorm) score += 14;
      if (reqHouseNorm && houseNorm === reqHouseNorm) score += 22;
      else if (reqHouseNorm && houseNorm) score += 6;
      if (row.houseNumber) score += 2;
      if (Number.isFinite(row.importance)) score += Math.max(0, Math.min(10, row.importance * 10));

      if (full && labelNorm.includes(norm(full))) score += 20;

      // Città mancante: usa quella richiesta (la via resta valida e selezionabile).
      if (!row.city && city) row.city = city;
      return { ...row, score };
    }).filter((item: any) => item && item.road);

    const unique = new Map<string, any>();
    for (const item of mapped) {
      const key = [
        norm(item.road),
        norm(item.houseNumber || ''),
        norm(item.city),
        String(item.postcode || '').trim(),
        norm(item.provinceCode || item.province || '')
      ].join('|');
      const existing = unique.get(key);
      if (!existing || Number(item.score || 0) > Number(existing.score || 0)) {
        unique.set(key, item);
      }
    }

    const normalized = Array.from(unique.values())
      .sort((a: any, b: any) => Number(b.score || 0) - Number(a.score || 0))
      .slice(0, limit)
      .map((item: any) => ({
        label: item.label,
        road: item.road,
        houseNumber: item.houseNumber || '',
        city: item.city,
        postcode: item.postcode || '',
        province: item.province || '',
        provinceCode: item.provinceCode || '',
        latitude: item.latitude,
        longitude: item.longitude
      }));

    geocodeStreetCache.set(cacheKey, {
      data: normalized,
      expiresAt: Date.now() + 1000 * 60 * 20
    });

    return res.json({ success: true, data: normalized });
  } catch (error) {
    console.error('Street autocomplete error:', error);
    return res.status(500).json({ success: false, message: 'Street autocomplete failed' });
  }
});

app.get('/api/agents/:id/performance-report', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const agentId = String(req.params.id || '').trim();
    if (!agentId) return res.status(400).json({ success: false, message: 'agentId is required' });

    const now = new Date();
    const yearRaw = Number(req.query.year);
    const monthRaw = Number(req.query.month);
    const dayRaw = Number(req.query.day);
    const year = Number.isFinite(yearRaw) && yearRaw >= 2000 ? Math.trunc(yearRaw) : now.getFullYear();
    const month = Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? Math.trunc(monthRaw) : now.getMonth() + 1;
    const day = Number.isFinite(dayRaw) && dayRaw >= 1 && dayRaw <= 31 ? Math.trunc(dayRaw) : null;

    const periodStart = day
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, 1, 0, 0, 0, 0);
    const periodEnd = day
      ? new Date(year, month - 1, day + 1, 0, 0, 0, 0)
      : new Date(year, month, 1, 0, 0, 0, 0);

    const yearStart = new Date(year, 0, 1, 0, 0, 0, 0);
    const yearEnd = new Date(year + 1, 0, 1, 0, 0, 0, 0);
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month, 1, 0, 0, 0, 0);

    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, agencyId: true, firstName: true, lastName: true, email: true, role: true, isActive: true }
    });
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
    if (auth.agencyId && agent.agencyId !== auth.agencyId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const activityWhereAgency: any = { assignedToId: agentId };
    if (auth.agencyId) activityWhereAgency.agencyId = auth.agencyId;
    const appointmentWhereAgency: any = { assignedToId: agentId };
    if (auth.agencyId) appointmentWhereAgency.agencyId = auth.agencyId;
    const zoneWhereAgency: any = { createdById: agentId };
    if (auth.agencyId) zoneWhereAgency.agencyId = auth.agencyId;
    const propertyWhereAgency: any = { ownerId: agentId };
    if (auth.agencyId) propertyWhereAgency.agencyId = auth.agencyId;

    const [
      activitiesPeriod,
      activitiesAllOpen,
      appointmentsPeriod,
      groupLogsPeriod,
      streetLogsPeriod,
      listingActionsPeriod,
      activitiesYearCompleted,
      appointmentsYear,
      groupLogsYear,
      streetLogsYear,
      listingActionsYear,
      activitiesMonthCompleted,
      appointmentsMonth,
      groupLogsMonth,
      streetLogsMonth,
      listingActionsMonth,
      propertiesPeriod,
      propertiesYear,
      propertiesMonth
    ] = await Promise.all([
      prisma.activity.findMany({
        where: {
          ...activityWhereAgency,
          OR: [
            { createdAt: { gte: periodStart, lt: periodEnd } },
            { completedAt: { gte: periodStart, lt: periodEnd } }
          ]
        },
        select: {
          id: true,
          title: true,
          type: true,
          completed: true,
          dueDate: true,
          completedAt: true,
          createdAt: true,
          report: true
        }
      }),
      prisma.activity.findMany({
        where: {
          ...activityWhereAgency,
          completed: false
        },
        select: { id: true, dueDate: true }
      }),
      prisma.appointment.findMany({
        where: {
          ...appointmentWhereAgency,
          OR: [
            { startTime: { gte: periodStart, lt: periodEnd } },
            { endTime: { gte: periodStart, lt: periodEnd } }
          ]
        },
        select: { id: true, title: true, status: true, startTime: true, endTime: true, createdAt: true }
      }),
      (prisma as any).zoneGroupWorkLog.findMany({
        where: {
          ...zoneWhereAgency,
          createdAt: { gte: periodStart, lt: periodEnd }
        },
        select: { id: true, title: true, entryType: true, content: true, metadata: true, createdAt: true }
      }),
      (prisma as any).zoneStreetWorkLog.findMany({
        where: {
          ...zoneWhereAgency,
          createdAt: { gte: periodStart, lt: periodEnd }
        },
        select: { id: true, title: true, entryType: true, content: true, metadata: true, createdAt: true }
      }),
      (prisma as any).zoneStreetListingAction.findMany({
        where: {
          ...zoneWhereAgency,
          createdAt: { gte: periodStart, lt: periodEnd }
        },
        select: { id: true, title: true, actionType: true, content: true, outcome: true, metadata: true, createdAt: true }
      }),
      prisma.activity.findMany({
        where: {
          ...activityWhereAgency,
          completed: true,
          completedAt: { gte: yearStart, lt: yearEnd }
        },
        select: { completedAt: true }
      }),
      prisma.appointment.findMany({
        where: {
          ...appointmentWhereAgency,
          startTime: { gte: yearStart, lt: yearEnd }
        },
        select: { startTime: true }
      }),
      (prisma as any).zoneGroupWorkLog.findMany({
        where: {
          ...zoneWhereAgency,
          createdAt: { gte: yearStart, lt: yearEnd }
        },
        select: { createdAt: true }
      }),
      (prisma as any).zoneStreetWorkLog.findMany({
        where: {
          ...zoneWhereAgency,
          createdAt: { gte: yearStart, lt: yearEnd }
        },
        select: { createdAt: true }
      }),
      (prisma as any).zoneStreetListingAction.findMany({
        where: {
          ...zoneWhereAgency,
          createdAt: { gte: yearStart, lt: yearEnd }
        },
        select: { createdAt: true }
      }),
      prisma.activity.findMany({
        where: {
          ...activityWhereAgency,
          completed: true,
          completedAt: { gte: monthStart, lt: monthEnd }
        },
        select: { completedAt: true }
      }),
      prisma.appointment.findMany({
        where: {
          ...appointmentWhereAgency,
          startTime: { gte: monthStart, lt: monthEnd }
        },
        select: { startTime: true }
      }),
      (prisma as any).zoneGroupWorkLog.findMany({
        where: {
          ...zoneWhereAgency,
          createdAt: { gte: monthStart, lt: monthEnd }
        },
        select: { createdAt: true }
      }),
      (prisma as any).zoneStreetWorkLog.findMany({
        where: {
          ...zoneWhereAgency,
          createdAt: { gte: monthStart, lt: monthEnd }
        },
        select: { createdAt: true }
      }),
      (prisma as any).zoneStreetListingAction.findMany({
        where: {
          ...zoneWhereAgency,
          createdAt: { gte: monthStart, lt: monthEnd }
        },
        select: { createdAt: true }
      }),
      prisma.property.findMany({
        where: {
          ...propertyWhereAgency,
          createdAt: { gte: periodStart, lt: periodEnd }
        },
        select: { id: true, title: true, createdAt: true }
      }),
      prisma.property.findMany({
        where: {
          ...propertyWhereAgency,
          createdAt: { gte: yearStart, lt: yearEnd }
        },
        select: { createdAt: true }
      }),
      prisma.property.findMany({
        where: {
          ...propertyWhereAgency,
          createdAt: { gte: monthStart, lt: monthEnd }
        },
        select: { createdAt: true }
      })
    ]);

    const completedActivitiesPeriod = activitiesPeriod.filter((a) => a.completed);
    const withDueDatePeriod = completedActivitiesPeriod.filter((a) => a.dueDate && a.completedAt);
    const onTimeCount = withDueDatePeriod.filter(
      (a) => a.completedAt && a.dueDate && a.completedAt.getTime() <= a.dueDate.getTime()
    ).length;
    const lateCount = withDueDatePeriod.length - onTimeCount;
    const openTaskCount = activitiesAllOpen.length;
    const openOverdueCount = activitiesAllOpen.filter((a) => a.dueDate && a.dueDate.getTime() < now.getTime()).length;
    const appointmentsCompletedCount = appointmentsPeriod.filter((a) => a.status === 'COMPLETED').length;
    const appointmentsUpcomingCount = appointmentsPeriod.filter((a) => a.startTime.getTime() > now.getTime()).length;

    const yearlyMonthly = Array.from({ length: 12 }, (_, i) => {
      const monthIdx = i + 1;
      const activityCompleted = activitiesYearCompleted.filter((a) => (a.completedAt ? a.completedAt.getMonth() + 1 : 0) === monthIdx).length;
      const appointmentsCount = appointmentsYear.filter((a) => a.startTime.getMonth() + 1 === monthIdx).length;
      const zoneCount =
        groupLogsYear.filter((r) => r.createdAt.getMonth() + 1 === monthIdx).length +
        streetLogsYear.filter((r) => r.createdAt.getMonth() + 1 === monthIdx).length +
        listingActionsYear.filter((r) => r.createdAt.getMonth() + 1 === monthIdx).length;
      const propertiesAcquired = propertiesYear.filter((r) => r.createdAt.getMonth() + 1 === monthIdx).length;
      return {
        month: monthIdx,
        label: new Date(year, i, 1).toLocaleString('it-IT', { month: 'short' }),
        activitiesCompleted: activityCompleted,
        appointments: appointmentsCount,
        zoneInteractions: zoneCount,
        propertiesAcquired
      };
    });

    const daysInMonth = new Date(year, month, 0).getDate();
    const daily = Array.from({ length: daysInMonth }, (_, i) => {
      const dayNum = i + 1;
      const activitiesCompleted = activitiesMonthCompleted.filter((a) => (a.completedAt ? a.completedAt.getDate() : 0) === dayNum).length;
      const appointmentsCount = appointmentsMonth.filter((a) => a.startTime.getDate() === dayNum).length;
      const zoneCount =
        groupLogsMonth.filter((r) => r.createdAt.getDate() === dayNum).length +
        streetLogsMonth.filter((r) => r.createdAt.getDate() === dayNum).length +
        listingActionsMonth.filter((r) => r.createdAt.getDate() === dayNum).length;
      const propertiesAcquired = propertiesMonth.filter((r) => r.createdAt.getDate() === dayNum).length;
      return { day: dayNum, activitiesCompleted, appointments: appointmentsCount, zoneInteractions: zoneCount, propertiesAcquired };
    });

    const timeline = [
      ...activitiesPeriod.map((a) => ({
        id: `activity-${a.id}`,
        at: (a.completedAt || a.createdAt).toISOString(),
        category: 'ACTIVITY',
        title: a.title,
        detail: a.completed ? `Attività completata (${a.type})` : `Attività creata (${a.type})`
      })),
      ...appointmentsPeriod.map((a) => ({
        id: `appointment-${a.id}`,
        at: a.startTime.toISOString(),
        category: 'APPOINTMENT',
        title: a.title,
        detail: `Appuntamento (${a.status})`
      })),
      ...groupLogsPeriod.map((l: any) => ({
        id: `zone-group-${l.id}`,
        at: l.createdAt.toISOString(),
        category: 'ZONE_GROUP',
        title: l.title || `Zona gruppo ${l.entryType}`,
        detail: String(l?.content || '').trim() || 'Uso strumento task zona (gruppo)'
      })),
      ...streetLogsPeriod.map((l: any) => ({
        id: `zone-street-${l.id}`,
        at: l.createdAt.toISOString(),
        category: 'ZONE_STREET',
        title: l.title || `Zona via ${l.entryType}`,
        detail: String(l?.content || '').trim() || 'Esplorazione/attività su via del gruppo'
      })),
      ...listingActionsPeriod.map((l: any) => ({
        id: `zone-listing-${l.id}`,
        at: l.createdAt.toISOString(),
        category: 'ZONE_LISTING',
        title: l.title || `Azione immobile zona (${l.actionType})`,
        detail:
          String(l?.metadata?.traceEvent || '') === 'ZONE_LISTING_SOURCE_OPEN'
            ? String(l?.content || '').trim() || 'Apertura annuncio sorgente'
            : String(l?.metadata?.traceEvent || '') === 'ZONE_LISTING_OPEN'
              ? String(l?.content || '').trim() || 'Apertura scheda immobile'
              : String(l?.metadata?.traceEvent || '') === 'ZONE_LISTING_STATUS_CHANGE'
                ? `Stato immobile aggiornato: ${String(l?.metadata?.oldStatus || '-')} -> ${String(l?.metadata?.newStatus || l?.outcome || '-')}`
                : String(l?.content || '').trim() || 'Uso strumento task zona (immobile)'
      })),
      ...propertiesPeriod.map((p) => ({
        id: `property-acquired-${p.id}`,
        at: p.createdAt.toISOString(),
        category: 'PROPERTY_ACQUIRED',
        title: p.title || 'Immobile acquisito',
        detail: 'Nuovo immobile acquisito dall’agente'
      }))
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 300);

    return res.json({
      success: true,
      data: {
        agent: {
          id: agent.id,
          name: `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || agent.email,
          email: agent.email,
          role: agent.role,
          isActive: agent.isActive
        },
        filters: { year, month, day },
        summary: {
          activitiesCreated: activitiesPeriod.length,
          activitiesCompleted: completedActivitiesPeriod.length,
          tasksOnTime: onTimeCount,
          tasksLate: lateCount,
          tasksOnTimeRate: withDueDatePeriod.length > 0 ? Math.round((onTimeCount / withDueDatePeriod.length) * 100) : 0,
          openTasks: openTaskCount,
          openOverdueTasks: openOverdueCount,
          appointmentsTotal: appointmentsPeriod.length,
          appointmentsCompleted: appointmentsCompletedCount,
          appointmentsUpcoming: appointmentsUpcomingCount,
          zoneGroupLogs: groupLogsPeriod.length,
          zoneStreetLogs: streetLogsPeriod.length,
          zoneListingActions: listingActionsPeriod.length,
          totalZoneInteractions: groupLogsPeriod.length + streetLogsPeriod.length + listingActionsPeriod.length,
          propertiesAcquired: propertiesPeriod.length
        },
        charts: {
          yearlyMonthly,
          daily
        },
        timeline
      }
    });
  } catch (error: any) {
    console.error('Error fetching agent performance report:', error);
    return res.status(500).json({ success: false, message: 'Error fetching agent performance report' });
  }
});

app.get('/api/properties', async (req, res) => {
  const { page = 1, limit = 10, search, type, status, city, assignedToId } = req.query;

  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const where: any = {};

    if (auth.agencyId) {
      where.agencyId = auth.agencyId;
    }

    if (auth.role === 'AGENT') {
      where.ownerId = auth.id;
    } else if (assignedToId) {
      where.ownerId = assignedToId.toString();
    }

    if (search) {
      const searchTerm = search.toString().toLowerCase();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { city: { contains: searchTerm, mode: 'insensitive' } },
        { address: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }

    if (type) where.type = type;
    if (status) where.status = status;
    if (city) where.city = { contains: city.toString(), mode: 'insensitive' };

    const [total, properties] = await Promise.all([
      prisma.property.count({ where }),
      prisma.property.findMany({
        where,
        select: {
          id: true, giListingId: true, immoTypologyId: true, immoListingId: true,
          immoSyncStatus: true, immoLastSyncAt: true, immoLastError: true, immoLastRequestId: true,
          apimoPropertyId: true, apimoPushStatus: true, apimoLastPushAt: true, apimoLastPushError: true,
          title: true, description: true, type: true, contractType: true, status: true,
          address: true, city: true, province: true, zipCode: true, giComuneIstat: true,
          latitude: true, longitude: true,
          rooms: true, bedrooms: true, bathrooms: true, surface: true,
          garden: true, terrace: true, balcony: true, parking: true, floor: true, totalFloors: true,
          elevator: true, furnished: true,
          salePrice: true, rentPrice: true, advertisingSalePrice: true, advertisingRentPrice: true, expenses: true,
          energyClass: true,
          ownerFirstName: true, ownerLastName: true, ownerBirthDate: true, ownerBirthPlace: true,
          ownerFiscalCode: true, ownerAddress: true, ownerCity: true, ownerZipCode: true,
          ownerEmail: true, ownerPhone: true,
          buildingConstructionYear: true, buildingRenovationYear: true, buildingFloorsTotal: true,
          buildingElevator: true, buildingConcierge: true, buildingGardenShared: true,
          buildingHeatingType: true, buildingCondition: true,
          images: true, virtualTour: true, floorPlan: true, portalTargets: true,
          // oneClickData escluso: campo JSON pesante (100-500KB/immobile), non serve nella lista
          reference: true, notes: true, isPublished: true, publishedAt: true,
          createdAt: true, updatedAt: true, agencyId: true, ownerId: true,
        },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      })
    ]);

    // Difensivo: non inviare MAI immagini base64 inline (data:...) nella lista.
    // Pesano ~1.25MB l'una e gonfiano la risposta a decine di MB. Le immagini
    // su MinIO (URL /api/.../images/...) restano, cosi' le miniature funzionano.
    const lightProperties = properties.map((p: any) => ({
      ...p,
      images: Array.isArray(p.images)
        ? p.images.filter((img: any) => typeof img === 'string' && !img.startsWith('data:'))
        : p.images,
    }));

    res.json({
      success: true,
      data: lightProperties,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ success: false, message: 'Error fetching properties' });
  }
});

app.get('/api/properties/non-compliant', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const where: any = {};
    if (auth.agencyId) where.agencyId = auth.agencyId;

    const properties = await prisma.property.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        reference: true,
        title: true,
        contractType: true,
        city: true,
        ownerFirstName: true,
        ownerLastName: true,
        ownerEmail: true,
        ownerPhone: true,
        images: true,
        oneClickData: true,
        isPublished: true,
        updatedAt: true
      }
    });

    const MIN_PROPERTY_IMAGES = 7;
    const readFlag = (value: any) => String(value || '').trim().toUpperCase() === 'S';

    const rows = properties
      .map((property) => {
        const oneClickData = (property.oneClickData && typeof property.oneClickData === 'object')
          ? (property.oneClickData as any)
          : {};
        const missing: string[] = [];
        const images = Array.isArray(property.images) ? property.images.filter((img: any) => typeof img === 'string' && img.trim()) : [];

        if (!String(property.title || '').trim()) missing.push('title');
        if (!String(property.ownerFirstName || '').trim()) missing.push('ownerFirstName');
        if (!String(property.ownerLastName || '').trim()) missing.push('ownerLastName');
        if (!String(property.ownerEmail || '').trim()) missing.push('ownerEmail');
        if (!String(property.ownerPhone || '').trim()) missing.push('ownerPhone');
        if (images.length < MIN_PROPERTY_IMAGES) missing.push(`images(min:${MIN_PROPERTY_IMAGES})`);
        if (!readFlag(oneClickData?.doc_planimetria)) missing.push('doc_planimetria');
        if (!readFlag(oneClickData?.doc_visura)) missing.push('doc_visura');
        if (String(property.contractType || '').trim().toUpperCase() === 'RENT' && !String(oneClickData?.contratto_affitto || '').trim()) {
          missing.push('contratto_affitto');
        }

        return {
          id: property.id,
          reference: property.reference || null,
          title: property.title || null,
          contractType: property.contractType || null,
          city: property.city || null,
          isPublished: Boolean(property.isPublished),
          updatedAt: property.updatedAt,
          missing
        };
      })
      .filter((row) => row.missing.length > 0);

    return res.json({
      success: true,
      data: rows,
      summary: {
        totalNonCompliant: rows.length,
        publishedNonCompliant: rows.filter((row) => row.isPublished).length
      }
    });
  } catch (error) {
    console.error('Error fetching non-compliant properties:', error);
    return res.status(500).json({ success: false, message: 'Error fetching non-compliant properties' });
  }
});

app.get('/api/properties/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            isActive: true
          }
        }
      }
    });

    if (property) {
      if (auth.agencyId && property.agencyId !== auth.agencyId) {
        return res.status(404).json({ success: false, message: 'Property not found' });
      }
      if (auth.role === 'AGENT' && property.ownerId !== auth.id) {
        return res.status(404).json({ success: false, message: 'Property not found' });
      }
      const ownerFullName = [property.owner?.firstName, property.owner?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
      const agentName = ownerFullName || property.owner?.email || '';
      const serialized = {
        ...property,
        agentId: property.owner?.id || property.ownerId || null,
        agentName: agentName || null
      } as any;
      delete serialized.owner;
      res.json({ success: true, data: serialized });
    } else {
      res.status(404).json({ success: false, message: 'Property not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching property' });
  }
});

const firstDefinedValue = (...values: any[]) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const parseNumberOrUndefined = (value: any): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseIntOrUndefined = (value: any): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseBooleanOrUndefined = (value: any): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 't', 'yes', 'y', 'si', 's'].includes(normalized)) return true;
  if (['0', 'false', 'f', 'no', 'n'].includes(normalized)) return false;
  return undefined;
};

const parseYesNoFlag = (value: any): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toUpperCase();
  if (normalized === 'S' || normalized === 'Y') return true;
  if (normalized === 'N') return false;
  return parseBooleanOrUndefined(value);
};

const normalizeContractTypeValue = (rawContractType: any, oneClickAnnouncementType?: any): 'SALE' | 'RENT' | 'BOTH' => {
  const normalized = String(rawContractType || '').trim().toUpperCase();
  if (normalized === 'SALE' || normalized === 'RENT' || normalized === 'BOTH') return normalized;
  const oneClickType = Number(oneClickAnnouncementType);
  if (oneClickType === 2) return 'RENT';
  return 'SALE';
};

const normalizePropertyStatusValue = (rawStatus: any): 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'RENTED' | 'WITHDRAWN' => {
  const normalized = String(rawStatus || '').trim().toUpperCase();
  if (normalized === 'AVAILABLE' || normalized === 'RESERVED' || normalized === 'SOLD' || normalized === 'RENTED' || normalized === 'WITHDRAWN') {
    return normalized;
  }
  return 'AVAILABLE';
};

const resolveRequestContractForMatching = (request: any): 'SALE' | 'RENT' | null => {
  const rawContract = String(request?.contractType || '').trim().toUpperCase();
  if (rawContract === 'SALE' || rawContract === 'RENT') return rawContract as 'SALE' | 'RENT';

  const rawGoal = String(request?.requestGoal || request?.goal || '').trim().toUpperCase();
  if (['SALE', 'VENDITA', 'BUY', 'ACQUISTO'].includes(rawGoal)) return 'SALE';
  if (['RENT', 'AFFITTO', 'LOCAZIONE', 'VACATION'].includes(rawGoal)) return 'RENT';

  const notes = String(request?.notes || '');
  const goalMatch = notes.match(/\[CRM_REQ_GOAL=([^\]]+)\]/i);
  const notesGoal = String(goalMatch?.[1] || '').trim().toUpperCase();
  if (['SALE', 'VENDITA', 'BUY', 'ACQUISTO'].includes(notesGoal)) return 'SALE';
  if (['RENT', 'AFFITTO', 'LOCAZIONE', 'VACATION'].includes(notesGoal)) return 'RENT';

  const contactType = String(request?.contact?.type || '').trim().toUpperCase();
  if (contactType === 'TENANT') return 'RENT';
  if (contactType === 'BUYER') return 'SALE';
  return null;
};

const buildCriteriaFromRequest = (request: any) => ({
  contractType: resolveRequestContractForMatching(request),
  type: request?.type || null,
  minPrice: request?.minPrice ?? null,
  maxPrice: request?.maxPrice ?? null,
  minSurface: request?.minSurface ?? null,
  maxSurface: request?.maxSurface ?? null,
  minRooms: request?.minRooms ?? null,
  maxRooms: request?.maxRooms ?? null,
  minBathrooms: request?.minBathrooms ?? null,
  maxBathrooms: request?.maxBathrooms ?? null,
  minFloor: request?.minFloor ?? null,
  maxFloor: request?.maxFloor ?? null,
  cities: Array.isArray(request?.cities) ? request.cities : [],
  provinces: Array.isArray(request?.provinces) ? request.provinces : [],
  elevator: request?.elevator ?? null,
  parking: request?.parking ?? null,
  garden: request?.garden ?? null,
  terrace: request?.terrace ?? null,
  furnished: request?.furnished ?? null,
  apartmentSubtype: request?.apartmentSubtype ?? null,
  priorities: undefined
});

const buildCriteriaFromManualPayload = (criteria: any) => {
  const saleTypeRaw = String(criteria?.saleType || '').trim().toUpperCase();
  const normalizedContractType =
    saleTypeRaw === 'VENDITA' ? 'SALE' :
    saleTypeRaw === 'AFFITTO' ? 'RENT' :
    (criteria?.contractType || null);
  const cityTokens = String(criteria?.city || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const provinceTokens = String(criteria?.province || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    contractType: normalizedContractType,
    type: criteria?.propertyType || criteria?.type || null,
    minPrice: parseNumberOrUndefined(criteria?.minPrice),
    maxPrice: parseNumberOrUndefined(criteria?.maxPrice),
    minSurface: parseNumberOrUndefined(criteria?.minSurface),
    maxSurface: parseNumberOrUndefined(criteria?.maxSurface),
    minRooms: parseIntOrUndefined(criteria?.minRooms),
    maxRooms: parseIntOrUndefined(criteria?.maxRooms),
    minBathrooms: parseIntOrUndefined(criteria?.minBathrooms),
    maxBathrooms: parseIntOrUndefined(criteria?.maxBathrooms),
    minFloor: parseIntOrUndefined(criteria?.minFloor ?? criteria?.floor),
    maxFloor: parseIntOrUndefined(criteria?.maxFloor),
    cities: cityTokens,
    provinces: provinceTokens,
    elevator: parseBooleanOrUndefined(criteria?.hasElevator ?? criteria?.elevator),
    parking: parseBooleanOrUndefined(criteria?.hasParking ?? criteria?.parking),
    garden: parseBooleanOrUndefined(criteria?.hasGarden ?? criteria?.garden),
    terrace: parseBooleanOrUndefined(criteria?.hasTerrace ?? criteria?.terrace),
    furnished: parseBooleanOrUndefined(criteria?.furnished),
    apartmentSubtype: criteria?.apartmentSubtype || null,
    priorities: criteria?.priorities && typeof criteria.priorities === 'object' ? criteria.priorities : undefined
  };
};

const rankMatches = (rows: Array<any>) =>
  rows
    .filter((row) => Number(row?.score || 0) > 0)
    .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));

async function recomputeMatchesForRequest(requestId: string, agencyId: string) {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { contact: { select: { id: true, type: true } } }
  });
  if (!request || request.agencyId !== agencyId) return { upserted: 0 };
  if (!['BUYER', 'TENANT'].includes(String(request.contact?.type || '')) || String(request.status || '').toUpperCase() !== 'ACTIVE') {
    return { upserted: 0 };
  }

  const properties = await prisma.property.findMany({
    where: {
      agencyId,
      status: 'AVAILABLE'
    },
    select: {
      id: true,
      title: true,
      type: true,
      contractType: true,
      city: true,
      province: true,
      salePrice: true,
      rentPrice: true,
      surface: true,
      rooms: true,
      bedrooms: true,
      bathrooms: true,
      floor: true,
      elevator: true,
      parking: true,
      garden: true,
      terrace: true,
      furnished: true,
      updatedAt: true
    }
  });

  const criteria = buildCriteriaFromRequest(request);
  let upserted = 0;
  for (const property of properties) {
    const computed = computePropertyRequestMatch(property as any, criteria, MATCHING_WEIGHTS);
    if (!computed.hardFiltersPassed || computed.score <= 0) continue;
    upserted += 1;
  }
  return { upserted };
}

async function recomputeMatchesForProperty(propertyId: string, agencyId: string) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      title: true,
      type: true,
      contractType: true,
      city: true,
      province: true,
      salePrice: true,
      rentPrice: true,
      surface: true,
      rooms: true,
      bedrooms: true,
      bathrooms: true,
      floor: true,
      elevator: true,
      parking: true,
      garden: true,
      terrace: true,
      furnished: true,
      updatedAt: true,
      agencyId: true,
      status: true
    }
  });
  if (!property || property.agencyId !== agencyId || property.status !== 'AVAILABLE') return { upserted: 0 };

  const requests = await prisma.request.findMany({
    where: {
      agencyId,
      status: 'ACTIVE',
      contact: {
        type: { in: ['BUYER', 'TENANT'] }
      }
    },
    select: {
      id: true,
      type: true,
      contractType: true,
      minPrice: true,
      maxPrice: true,
      minSurface: true,
      maxSurface: true,
      minRooms: true,
      maxRooms: true,
      minBathrooms: true,
      maxBathrooms: true,
      minFloor: true,
      maxFloor: true,
      cities: true,
      provinces: true,
      elevator: true,
      parking: true,
      garden: true,
      terrace: true,
      furnished: true,
      apartmentSubtype: true
    }
  });

  let upserted = 0;
  for (const request of requests) {
    const criteria = buildCriteriaFromRequest(request);
    const computed = computePropertyRequestMatch(property as any, criteria, MATCHING_WEIGHTS);
    if (!computed.hardFiltersPassed || computed.score <= 0) continue;
    upserted += 1;
  }
  return { upserted };
}

async function recomputeMatchesForAgency(agencyId: string) {
  const requests = await prisma.request.findMany({
    where: {
      agencyId,
      status: 'ACTIVE',
      contact: {
        type: { in: ['BUYER', 'TENANT'] }
      }
    },
    select: { id: true }
  });

  let total = 0;
  for (const request of requests) {
    const result = await recomputeMatchesForRequest(request.id, agencyId);
    total += Number(result?.upserted || 0);
  }
  return { upserted: total, requests: requests.length };
}

async function getMatchesForRequest(requestId: string, agencyId: string, minScore = 0, limit = 100) {
  const request = await prisma.request.findFirst({
    where: {
      id: requestId,
      agencyId,
      status: 'ACTIVE',
      contact: { type: { in: ['BUYER', 'TENANT'] } }
    },
    include: { contact: true }
  });
  if (!request) return [];

  const properties = await prisma.property.findMany({
    where: {
      agencyId,
      status: 'AVAILABLE'
    },
    select: {
      id: true,
      title: true,
      type: true,
      contractType: true,
      city: true,
      province: true,
      salePrice: true,
      rentPrice: true,
      surface: true,
      rooms: true,
      bedrooms: true,
      bathrooms: true,
      floor: true,
      elevator: true,
      parking: true,
      garden: true,
      terrace: true,
      furnished: true,
      address: true,
      zipCode: true,
      reference: true,
      images: true
    }
  });

  const criteria = buildCriteriaFromRequest(request);
  const rows = properties
    .map((property) => {
      const computed = computePropertyRequestMatch(property as any, criteria, MATCHING_WEIGHTS);
      return {
        id: `rt-${request.id}-${property.id}`,
        score: computed.score,
        reasonsJson: computed.reasons,
        gapsJson: computed.gaps,
        property,
        request,
        feedbacks: []
      };
    })
    .filter((row) => Number(row.score || 0) >= minScore);

  return rankMatches(rows).slice(0, limit);
}

async function getMatchesForProperty(propertyId: string, agencyId: string, minScore = 0, limit = 100) {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      agencyId,
      status: 'AVAILABLE'
    },
    select: {
      id: true,
      title: true,
      type: true,
      contractType: true,
      city: true,
      province: true,
      salePrice: true,
      rentPrice: true,
      surface: true,
      rooms: true,
      bedrooms: true,
      bathrooms: true,
      floor: true,
      elevator: true,
      parking: true,
      garden: true,
      terrace: true,
      furnished: true,
      address: true,
      zipCode: true,
      reference: true,
      images: true
    }
  });
  if (!property) return [];

  const requests = await prisma.request.findMany({
    where: {
      agencyId,
      status: 'ACTIVE',
      contact: {
        type: { in: ['BUYER', 'TENANT'] }
      }
    },
    include: {
      contact: true
    }
  });

  const rows = requests
    .map((request) => {
      const criteria = buildCriteriaFromRequest(request);
      const computed = computePropertyRequestMatch(property as any, criteria, MATCHING_WEIGHTS);
      return {
        id: `rt-${property.id}-${request.id}`,
        score: computed.score,
        reasonsJson: computed.reasons,
        gapsJson: computed.gaps,
        property,
        request,
        feedbacks: []
      };
    })
    .filter((row) => Number(row.score || 0) >= minScore);

  return rankMatches(rows).slice(0, limit);
}

const toMatchLabel = (score: number): 'ALTO' | 'MEDIO' | 'BASSO' => {
  if (score >= 80) return 'ALTO';
  if (score >= 60) return 'MEDIO';
  return 'BASSO';
};

const mapMatchForRequestResponse = (row: any) => {
  const computed =
    row?.property && row?.request
      ? computePropertyRequestMatch(row.property as any, buildCriteriaFromRequest(row.request), MATCHING_WEIGHTS)
      : null;
  return {
  matchId: row.id,
  score: Number(row.score || 0),
  label: toMatchLabel(Number(row.score || 0)),
  reasons: Array.isArray(row.reasonsJson) ? row.reasonsJson : (computed?.reasons || []),
  gaps: Array.isArray(row.gapsJson) ? row.gapsJson : (computed?.gaps || []),
  property: row.property,
  request: row.request
  };
};

const mapMatchForPropertyResponse = (row: any) => {
  const computed =
    row?.property && row?.request
      ? computePropertyRequestMatch(row.property as any, buildCriteriaFromRequest(row.request), MATCHING_WEIGHTS)
      : null;
  return {
  matchId: row.id,
  score: Number(row.score || 0),
  label: toMatchLabel(Number(row.score || 0)),
  reasons: Array.isArray(row.reasonsJson) ? row.reasonsJson : (computed?.reasons || []),
  gaps: Array.isArray(row.gapsJson) ? row.gapsJson : (computed?.gaps || []),
  request: row.request,
  contact: row.request?.contact || null,
  property: row.property
  };
};

app.get('/api/matching/for-request/:requestId', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const agencyId = auth.agencyId || String(req.query?.agencyId || '');
    if (!agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const requestId = req.params.requestId;
    const minScore = Number(req.query?.minScore ?? 0);
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit ?? 100)));

    await recomputeMatchesForRequest(requestId, agencyId);
    const rows = await getMatchesForRequest(requestId, agencyId, minScore, limit);
    res.json({ success: true, data: rows.map(mapMatchForRequestResponse) });
  } catch (error) {
    console.error('Errore caricamento matching richiesta:', error);
    res.status(500).json({ success: false, message: 'Errore caricamento matching richiesta' });
  }
});

app.get('/api/matching/for-property/:propertyId', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const agencyId = auth.agencyId || String(req.query?.agencyId || '');
    if (!agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const propertyId = req.params.propertyId;
    const minScore = Number(req.query?.minScore ?? 0);
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit ?? 100)));

    await recomputeMatchesForProperty(propertyId, agencyId);
    const rows = await getMatchesForProperty(propertyId, agencyId, minScore, limit);

    res.json({ success: true, data: rows.map(mapMatchForPropertyResponse) });
  } catch (error) {
    console.error('Errore caricamento matching immobile:', error);
    res.status(500).json({ success: false, message: 'Errore caricamento matching immobile' });
  }
});

app.get('/api/matching/search', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const agencyId = auth.agencyId || String(req.query?.agencyId || '');
    if (!agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const direction = String(req.query?.direction || 'request').toLowerCase();
    const requestId = String(req.query?.requestId || '').trim();
    const propertyId = String(req.query?.propertyId || '').trim();
    const contactId = String(req.query?.contactId || '').trim();
    const minScore = Number(req.query?.minScore ?? 0);
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit ?? 100)));
    const sort = String(req.query?.sort || 'score_desc').toLowerCase();

    if (direction === 'property') {
      if (!propertyId) return res.status(400).json({ success: false, message: 'propertyId richiesto' });
      await recomputeMatchesForProperty(propertyId, agencyId);
      let rows = await getMatchesForProperty(propertyId, agencyId, minScore, limit);
      if (sort === 'score_asc') rows = [...rows].sort((a, b) => Number(a.score || 0) - Number(b.score || 0));
      return res.json({ success: true, data: rows.map(mapMatchForPropertyResponse) });
    }

    if (requestId) {
      await recomputeMatchesForRequest(requestId, agencyId);
      let rows = await getMatchesForRequest(requestId, agencyId, minScore, limit);
      if (sort === 'score_asc') rows = [...rows].sort((a, b) => Number(a.score || 0) - Number(b.score || 0));
      return res.json({ success: true, data: rows.map(mapMatchForRequestResponse) });
    }

    if (contactId) {
      const requests = await prisma.request.findMany({
        where: { agencyId, contactId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      });
      await Promise.all(requests.map((request) => recomputeMatchesForRequest(request.id, agencyId)));
      const allRows = await Promise.all(requests.map((request) => getMatchesForRequest(request.id, agencyId, minScore, limit)));
      let rows = rankMatches(allRows.flat()).slice(0, limit);
      if (sort === 'score_asc') rows = [...rows].sort((a, b) => Number(a.score || 0) - Number(b.score || 0));
      return res.json({ success: true, data: rows.map(mapMatchForRequestResponse) });
    }

    return res.status(400).json({
      success: false,
      message: 'Specifica requestId, propertyId o contactId'
    });
  } catch (error) {
    console.error('Errore ricerca incroci:', error);
    res.status(500).json({ success: false, message: 'Errore ricerca incroci' });
  }
});

app.post('/api/matching/preview', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const agencyId = auth.agencyId || req.body?.agencyId;
    if (!agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });
    const criteria = buildCriteriaFromManualPayload(req.body?.criteria || req.body || {});
    const minScore = Number(req.body?.minScore ?? 0);
    const limit = Math.min(200, Math.max(1, Number(req.body?.limit ?? 100)));

    const properties = await prisma.property.findMany({
      where: { agencyId, status: 'AVAILABLE' },
      take: limit,
      select: {
        id: true, title: true, type: true, contractType: true, city: true, province: true,
        salePrice: true, rentPrice: true, rooms: true, bedrooms: true, bathrooms: true,
        address: true, zipCode: true, images: true, reference: true
      }
    });

    const ranked = rankMatches(
      properties.map((property) => {
        const computed = computePropertyRequestMatch(property as any, criteria, MATCHING_WEIGHTS);
        return {
          id: `preview-${property.id}`,
          score: computed.score,
          reasonsJson: computed.reasons,
          gapsJson: computed.gaps,
          property,
          request: null
        };
      })
    ).filter((row) => Number(row.score || 0) >= minScore);

    res.json({ success: true, data: ranked.map(mapMatchForRequestResponse) });
  } catch (error) {
    console.error('Error in matching preview:', error);
    res.status(500).json({ success: false, message: 'Error generating matching preview' });
  }
});

app.post('/api/matching/by-client/:contactId', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const agencyId = auth.agencyId || req.body?.agencyId;
    if (!agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });
    const minScore = Number(req.body?.minScore ?? 0);
    const limit = Math.min(200, Math.max(1, Number(req.body?.limit ?? 100)));

    const requests = await prisma.request.findMany({
      where: { agencyId, contactId: req.params.contactId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    });
    await Promise.all(requests.map((request) => recomputeMatchesForRequest(request.id, agencyId)));
    const allRows = await Promise.all(requests.map((request) => getMatchesForRequest(request.id, agencyId, minScore, limit)));
    const flattened = rankMatches(allRows.flat()).slice(0, limit);
    res.json({ success: true, data: flattened.map(mapMatchForRequestResponse) });
  } catch (error) {
    console.error('Error in matching by client:', error);
    res.status(500).json({ success: false, message: 'Error loading matching by client' });
  }
});

app.get('/api/matching/properties/:requestId', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const agencyId = auth.agencyId || String(req.query?.agencyId || '');
    if (!agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });
    const minScore = Number(req.query?.minScore ?? 0);
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit ?? 100)));
    await recomputeMatchesForRequest(req.params.requestId, agencyId);
    const rows = await getMatchesForRequest(req.params.requestId, agencyId, minScore, limit);
    res.json({ success: true, data: rows.map(mapMatchForRequestResponse) });
  } catch (error) {
    console.error('Error loading matching by request:', error);
    res.status(500).json({ success: false, message: 'Error loading matching by request' });
  }
});

app.post('/api/matching/recompute', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const agencyId = auth.agencyId || req.body?.agencyId;
    if (!agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const requestId = String(req.body?.requestId || '').trim();
    const propertyId = String(req.body?.propertyId || '').trim();

    if (requestId) {
      const result = await recomputeMatchesForRequest(requestId, agencyId);
      return res.json({ success: true, data: { scope: 'request', ...result } });
    }
    if (propertyId) {
      const result = await recomputeMatchesForProperty(propertyId, agencyId);
      return res.json({ success: true, data: { scope: 'property', ...result } });
    }

    const result = await recomputeMatchesForAgency(agencyId);
    return res.json({ success: true, data: { scope: 'agency', ...result } });
  } catch (error) {
    console.error('Error recomputing matching:', error);
    res.status(500).json({ success: false, message: 'Error recomputing matching' });
  }
});

app.post('/api/matching/:matchId/feedback', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const agencyId = auth.agencyId || req.body?.agencyId;
    if (!agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const matchId = req.params.matchId;
    const valueRaw = String(req.body?.value || '').trim().toUpperCase();
    const value = valueRaw === 'POSITIVE' || valueRaw === 'USEFUL' ? 'POSITIVE' : 'NEGATIVE';
    const note = String(req.body?.note || '').trim() || null;

    const match = await prisma.propertyMatch.findFirst({
      where: {
        id: matchId,
        request: { agencyId },
        property: { agencyId }
      },
      select: {
        id: true,
        propertyId: true,
        requestId: true
      }
    });

    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

    const feedback = await prisma.matchFeedback.create({
      data: {
        matchResultId: match.id,
        agencyId,
        value,
        note,
        createdById: auth.id,
        propertyId: match.propertyId,
        requestId: match.requestId
      }
    });

    res.status(201).json({ success: true, data: feedback });
  } catch (error) {
    console.error('Error saving matching feedback:', error);
    res.status(500).json({ success: false, message: 'Error saving feedback' });
  }
});

app.post('/api/properties', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const body = req.body;

    const normalizedPortalTargets = { valid: true, portalIds: ['ONECLICKANNUNCI'] as string[] };

    if (auth.role === 'AGENT') {
      const ownerIdCandidate = body?.ownerId != null ? String(body.ownerId).trim() : '';
      const agentIdCandidate = body?.agentId != null ? String(body.agentId).trim() : '';
      if ((ownerIdCandidate && ownerIdCandidate !== auth.id) || (agentIdCandidate && agentIdCandidate !== auth.id)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }
    
    const submitForApproval = Boolean(body?.submitForApproval);
    const shouldMarkPendingApproval = auth.role === 'AGENT' && submitForApproval;
    const mergedNotes = shouldMarkPendingApproval
      ? appendPendingApprovalTag(body?.notes, auth.id)
      : body?.notes;

    // Map fields
    let agencyId = body.agencyId;
    let ownerId = body.ownerId || body.agentId; // Use agentId as ownerId if ownerId missing

    if (auth.role === 'AGENT') {
      agencyId = auth.agencyId;
      ownerId = auth.id;
    } else if (auth.agencyId && auth.role !== 'SUPER_ADMIN') {
      agencyId = auth.agencyId;
    }
    
    // Fallback if still missing
    if (!agencyId) {
      const agency = await prisma.agency.findFirst();
      agencyId = agency?.id;
    } else {
      // Validate provided agencyId exists
      const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
      if (!agency) {
        console.warn(`Provided agencyId ${agencyId} not found, falling back to first available.`);
        const firstAgency = await prisma.agency.findFirst();
        agencyId = firstAgency?.id;
      }
    }

    if (!ownerId) {
      const user = await prisma.user.findFirst();
      ownerId = user?.id;
    } else {
       // Validate provided ownerId exists
       const user = await prisma.user.findUnique({ where: { id: ownerId } });
       if (!user) {
         console.warn(`Provided ownerId ${ownerId} not found, falling back to first available.`);
         const firstUser = await prisma.user.findFirst();
         ownerId = firstUser?.id;
       }
    }

    if (!agencyId || !ownerId) {
      return res.status(400).json({ success: false, message: 'Missing agencyId or ownerId' });
    }

    const PROPERTY_TYPE_VALUES = new Set(['APARTMENT', 'HOUSE', 'VILLA', 'OFFICE', 'SHOP', 'WAREHOUSE', 'LAND', 'GARAGE', 'OTHER']);
    const mapOneClickTypeToPropertyType = (id: number | null | undefined): string => {
      if (!Number.isFinite(Number(id))) return 'APARTMENT';
      switch (Number(id)) {
        case 5:
          return 'APARTMENT';
        case 36:
          return 'HOUSE';
        case 7:
          return 'VILLA';
        case 15:
          return 'OFFICE';
        case 18:
          return 'SHOP';
        case 29:
          return 'WAREHOUSE';
        case 19:
          return 'LAND';
        case 9:
          return 'GARAGE';
        default:
          return 'APARTMENT';
      }
    };
    const normalizePropertyType = (rawType: any, oneClickType: any): string => {
      const normalized = String(rawType || '').trim().toUpperCase();
      if (normalized === 'COMMERCIAL') return 'SHOP';
      if (normalized === 'LOFT') return 'APARTMENT';
      if (PROPERTY_TYPE_VALUES.has(normalized)) return normalized;
      return mapOneClickTypeToPropertyType(Number(oneClickType));
    };
    const type = normalizePropertyType(body?.type, body?.oneClickData?.idtipologiaimmobile);
    
    const oneClickInputBase = {
      ...body,
      reference: body.reference,
      giListingId: body.giListingId,
      createdAt: body.createdAt || new Date(),
      updatedAt: new Date()
    };
    const normalizedOneClickFromInput = body.oneClickData != null
      ? normalizeAndValidateOneClickInput(body.oneClickData, oneClickInputBase)
      : normalizeAndValidateOneClickInput(defaultOneClickDataFromPropertyInput(oneClickInputBase), oneClickInputBase);
    if (!normalizedOneClickFromInput.validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Campi obbligatori 1clickannunci mancanti o non validi',
        oneClickErrors: normalizedOneClickFromInput.validation.errors
      });
    }
    const normalizedOneClickFinal = applyOneClickPortalSelectionDelta(normalizedOneClickFromInput.normalized);
    const oneClickDataForPersistence = enforcePropertyPublicationControlsByRole(
      auth.role,
      normalizedOneClickFinal,
      null
    );
    const requiredErrors: string[] = [];
    if (!String(body?.title || '').trim()) requiredErrors.push('title');
    if (!String(body?.description || '').trim()) requiredErrors.push('description');
    if (!String(body?.ownerFirstName || '').trim()) requiredErrors.push('ownerFirstName');
    if (!String(body?.ownerLastName || '').trim()) requiredErrors.push('ownerLastName');
    if (!String(body?.ownerEmail || '').trim()) requiredErrors.push('ownerEmail');
    if (!String(body?.ownerPhone || '').trim()) requiredErrors.push('ownerPhone');
    if (!String(body?.agentId || body?.ownerId || '').trim()) requiredErrors.push('agentId');
    const oneClickRequired = (normalizedOneClickFinal || {}) as any;
    const hasPositive = (v: any) => Number.isFinite(Number(v)) && Number(v) > 0;
    const isYes = (v: any) => String(v || '').trim().toUpperCase() === 'S';
    const hasValue = (v: any) => String(v ?? '').trim().length > 0;
    const isBoxNone = (v: any) => {
      const raw = String(v || '').trim().toLowerCase();
      return !raw || raw === 'nessuno' || raw === 'no' || raw === 'n';
    };

    // Step 6 - Struttura edificio
    if (!hasValue(oneClickRequired.piano)) requiredErrors.push('piano');
    if (!hasValue(oneClickRequired.ascensore)) requiredErrors.push('ascensore');
    if (!hasPositive(oneClickRequired.spese_cond_mensili) && Number(oneClickRequired.spese_cond_mensili) !== 0) requiredErrors.push('spese_cond_mensili');

    // Step 7 - Spazi e accessori
    if (!hasValue(oneClickRequired.balcone)) requiredErrors.push('balcone');
    if (isYes(oneClickRequired.balcone) && !hasPositive(oneClickRequired.nr_balconi)) requiredErrors.push('nr_balconi');
    if (!hasValue(oneClickRequired.terrazzo)) requiredErrors.push('terrazzo');
    if (isYes(oneClickRequired.terrazzo) && !hasPositive(oneClickRequired.nr_terrazzi)) requiredErrors.push('nr_terrazzi');
    if (!hasValue(oneClickRequired.giardino)) requiredErrors.push('giardino');
    if (isYes(oneClickRequired.giardino) && !hasPositive(oneClickRequired.mq_giardino)) requiredErrors.push('mq_giardino');
    if (!hasValue(oneClickRequired.mansarda)) requiredErrors.push('mansarda');
    if (isYes(oneClickRequired.mansarda) && !hasPositive(oneClickRequired.mq_mansarda)) requiredErrors.push('mq_mansarda');
    if (!hasValue(oneClickRequired.cantina)) requiredErrors.push('cantina');
    if (isYes(oneClickRequired.cantina) && !hasPositive(oneClickRequired.mq_cantina)) requiredErrors.push('mq_cantina');
    if (!hasValue(oneClickRequired.box_auto)) requiredErrors.push('box_auto');
    if (!isBoxNone(oneClickRequired.box_auto) && !hasPositive(oneClickRequired.mq_box)) requiredErrors.push('mq_box');
    if ((isYes(oneClickRequired.balcone) || isYes(oneClickRequired.terrazzo) || isYes(oneClickRequired.giardino)) && !hasPositive(oneClickRequired.mq_esterno) && Number(oneClickRequired.mq_esterno) !== 0) requiredErrors.push('mq_esterno');

    // Step 8 - Dotazioni interne
    if (!hasValue(oneClickRequired.arredato)) requiredErrors.push('arredato');
    if (!hasValue(oneClickRequired.cucina)) requiredErrors.push('cucina');
    if (!hasValue(oneClickRequired.riscaldamento)) requiredErrors.push('riscaldamento');
    if (!hasValue(oneClickRequired.tipo_riscaldamento)) requiredErrors.push('tipo_riscaldamento');
    if (!hasValue(oneClickRequired.condizionatore)) requiredErrors.push('condizionatore');
    if (!hasValue(oneClickRequired.allarme_antifurto)) requiredErrors.push('allarme_antifurto');
    if (!hasValue(oneClickRequired.portineria)) requiredErrors.push('portineria');
    if (!hasValue(oneClickRequired.internet)) requiredErrors.push('internet');
    if (!hasValue(oneClickRequired.caminetto)) requiredErrors.push('caminetto');
    if (!hasValue(oneClickRequired.piscina)) requiredErrors.push('piscina');

    // Step 9 - Energetica
    if (!hasValue(oneClickRequired.classe_energetica)) requiredErrors.push('classe_energetica');

    if (requiredErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required property fields: ${requiredErrors.join(', ')}`
      });
    }

    const oneClick = (normalizedOneClickFinal || {}) as any;
    const contractType = normalizeContractTypeValue(body?.contractType, oneClick?.idtipologiaannuncio);
    const status = normalizePropertyStatusValue(body?.status);
    const inferredPrice = parseNumberOrUndefined(oneClick?.prezzo);
    const inferredSurface = parseNumberOrUndefined(oneClick?.mq);
    const inferredRooms = parseIntOrUndefined(oneClick?.nr_locali);
    const inferredBedrooms = parseIntOrUndefined(oneClick?.nr_camere);
    const inferredBathrooms = parseIntOrUndefined(oneClick?.nr_servizi);
    const inferredEnergyClass = firstDefinedValue(body?.energyClass, oneClick?.classe_energetica);

    // Clean data for Prisma (only include fields present in Schema)
    const propertyData: any = {
      title: body.title,
      description: body.description,
      type: type,
      contractType,
      status,
      address: body.address,
      city: body.city,
      province: body.province,
      zipCode: body.zipCode,
      giComuneIstat: firstDefinedValue(body.giComuneIstat, oneClick?.comune_istat),
      latitude: parseNumberOrUndefined(firstDefinedValue(body.latitude, oneClick?.latitudine)),
      longitude: parseNumberOrUndefined(firstDefinedValue(body.longitude, oneClick?.longitudine)),
      
      rooms: parseIntOrUndefined(firstDefinedValue(body.rooms, inferredRooms)),
      bedrooms: parseIntOrUndefined(firstDefinedValue(body.bedrooms, inferredBedrooms)),
      bathrooms: parseIntOrUndefined(firstDefinedValue(body.bathrooms, inferredBathrooms)),
      surface: parseNumberOrUndefined(firstDefinedValue(body.surface, inferredSurface)),
      garden: parseNumberOrUndefined(firstDefinedValue(body.garden, oneClick?.mq_giardino)),
      terrace: parseNumberOrUndefined(body.terrace),
      balcony: parseNumberOrUndefined(body.balcony),
      parking: parseIntOrUndefined(firstDefinedValue(body.parkingSpaces, body.parking)),
      floor: parseIntOrUndefined(firstDefinedValue(body.floor, oneClick?.piano)),
      totalFloors: parseIntOrUndefined(firstDefinedValue(body.totalFloors, oneClick?.totale_piani)),
      elevator: parseBooleanOrUndefined(firstDefinedValue(body.elevator, parseYesNoFlag(oneClick?.ascensore))),
      furnished: parseBooleanOrUndefined(firstDefinedValue(body.furnished, parseYesNoFlag(oneClick?.arredato))),
      
      salePrice: parseNumberOrUndefined(firstDefinedValue(body.salePrice, contractType !== 'RENT' ? inferredPrice : undefined)),
      rentPrice: parseNumberOrUndefined(firstDefinedValue(body.rentPrice, contractType === 'RENT' ? inferredPrice : undefined)),
      advertisingSalePrice: parseNumberOrUndefined(body.advertisingSalePrice),
      advertisingRentPrice: parseNumberOrUndefined(body.advertisingRentPrice),
      expenses: parseNumberOrUndefined(firstDefinedValue(body.condominium, body.expenses)), // Map condominium to expenses
      
      energyClass: inferredEnergyClass,
      
      ownerFirstName: body.ownerFirstName,
      ownerLastName: body.ownerLastName,
      ownerBirthDate: body.ownerBirthDate,
      ownerBirthPlace: body.ownerBirthPlace,
      ownerFiscalCode: body.ownerFiscalCode,
      ownerAddress: body.ownerAddress,
      ownerCity: body.ownerCity,
      ownerZipCode: body.ownerZipCode,
      ownerEmail: body.ownerEmail,
      ownerPhone: body.ownerPhone,
      
      buildingConstructionYear: parseIntOrUndefined(body.buildingConstructionYear),
      buildingRenovationYear: parseIntOrUndefined(body.buildingRenovationYear),
      buildingFloorsTotal: parseIntOrUndefined(body.buildingFloorsTotal),
      buildingElevator: parseBooleanOrUndefined(body.buildingElevator),
      buildingConcierge: parseBooleanOrUndefined(body.buildingConcierge),
      buildingGardenShared: parseBooleanOrUndefined(body.buildingGardenShared),
      buildingHeatingType: body.buildingHeatingType || body.heating, // Map heating fallback
      buildingCondition: body.buildingCondition,
      
      images: Array.isArray(body.images) ? body.images.filter((img: any) => typeof img === 'string' && img.trim()) : [],
      portalTargets: normalizedPortalTargets.portalIds,
      oneClickData: oneClickDataForPersistence,
      reference: firstDefinedValue(body.reference, oneClick?.riferimento),
      notes: mergedNotes,
      isPublished: auth.role === 'AGENT' ? false : (shouldMarkPendingApproval ? false : Boolean(body?.isPublished)),
      
      agencyId,
      ownerId
    };

    // Prisma strict undefined checks: explicit undefined in create/update can throw validation errors.
    Object.keys(propertyData).forEach((key) => propertyData[key] === undefined && delete propertyData[key]);
    
    const newProperty = await prisma.property.create({
      data: propertyData
    });

    try {
      await recomputeMatchesForProperty(newProperty.id, agencyId);
    } catch (matchingError) {
      console.error('Error recomputing matches after property create:', matchingError);
    }

    // Sync Contact (Owner) with Agent
    if (newProperty.ownerEmail || newProperty.ownerPhone) {
      try {
        const existingContact = await prisma.contact.findFirst({
          where: {
            OR: [
              { email: newProperty.ownerEmail || undefined },
              { phone: newProperty.ownerPhone || undefined }
            ]
          }
        });

        if (existingContact) {
          // Update existing contact assignment
          await prisma.contact.update({
            where: { id: existingContact.id },
            data: { assignedToId: ownerId }
          });
        } else if (newProperty.ownerFirstName && newProperty.ownerLastName) {
          // Create new contact
          await prisma.contact.create({
            data: {
              firstName: newProperty.ownerFirstName,
              lastName: newProperty.ownerLastName,
              email: newProperty.ownerEmail,
              phone: newProperty.ownerPhone,
              type: newProperty.contractType === 'RENT' ? 'LANDLORD' : 'SELLER',
              assignedToId: ownerId,
              agencyId: agencyId,
              source: 'PROPERTY_CREATION'
            }
          });
        }
      } catch (contactError) {
        console.error('Error syncing contact:', contactError);
        // Don't fail the request if contact sync fails
      }
    }

    if (shouldMarkPendingApproval && agencyId) {
      try {
        const submittedByName = [String(auth.firstName || '').trim(), String(auth.lastName || '').trim()].filter(Boolean).join(' ').trim() || String(auth.email || '').trim() || 'Agente';
        const admins = await prisma.user.findMany({
          where: {
            agencyId,
            role: { in: ['SUPER_ADMIN', 'AGENCY_ADMIN'] }
          },
          select: { id: true }
        });

        await Promise.all(
          admins.map((admin) =>
            createNotificationRecord({
              agencyId,
              recipientId: admin.id,
              type: 'PROPERTY_PENDING_APPROVAL',
              title: 'Nuovo immobile in approvazione',
              message: `L'agente ${submittedByName} richiede l'approvazione dell'immobile "${newProperty.title}"`,
              data: {
                propertyId: newProperty.id,
                status: 'PENDING_APPROVAL',
                submittedById: auth.id,
                submittedByName
              }
            })
          )
        );
      } catch (notificationError) {
        console.error('Error creating pending-approval notifications:', notificationError);
      }
    }

    if (agencyId) {
      try {
        const assigneeIds = extractPropertyAssigneeIds(body, newProperty.ownerId);
        await Promise.all(
          assigneeIds.map((recipientId) =>
            createNotificationRecord({
              agencyId,
              recipientId,
              type: 'PROPERTY_ASSIGNED',
              title: 'Nuovo immobile caricato',
              message: buildPropertyNotificationMessage(newProperty),
              data: {
                propertyId: newProperty.id,
                source: 'PROPERTY_CREATE',
                assignedById: auth.id
              }
            })
          )
        );
      } catch (notificationError) {
        console.error('Error creating property-assigned notifications:', notificationError);
      }
    }

    res.status(201).json({
      success: true,
      data: newProperty,
      message: 'Property created successfully'
    });
  } catch (error: any) {
    console.error('Error creating property:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Reference code already exists', error: 'P2002' });
    }
    res.status(500).json({ success: false, message: 'Error creating property', error: String(error) });
  }
});

app.put('/api/properties/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const existing = await prisma.property.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Property not found' });
    if (auth.agencyId && existing.agencyId !== auth.agencyId) return res.status(404).json({ success: false, message: 'Property not found' });
    if (auth.role === 'AGENT' && existing.ownerId !== auth.id) return res.status(403).json({ success: false, message: 'Forbidden' });

    const body = req.body;
    const submitForApproval = Boolean(body?.submitForApproval);
    const shouldMarkPendingApproval = auth.role === 'AGENT' && submitForApproval;

    const normalizedPortalTargets = { valid: true, portalIds: ['ONECLICKANNUNCI'] as string[] };

    if (auth.role === 'AGENT') {
      const ownerIdCandidate = body?.ownerId != null ? String(body.ownerId).trim() : '';
      const agentIdCandidate = body?.agentId != null ? String(body.agentId).trim() : '';
      if ((ownerIdCandidate && ownerIdCandidate !== auth.id) || (agentIdCandidate && agentIdCandidate !== auth.id)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    const PROPERTY_TYPE_VALUES = new Set(['APARTMENT', 'HOUSE', 'VILLA', 'OFFICE', 'SHOP', 'WAREHOUSE', 'LAND', 'GARAGE', 'OTHER']);
    const mapOneClickTypeToPropertyType = (id: number | null | undefined): string => {
      if (!Number.isFinite(Number(id))) return 'APARTMENT';
      switch (Number(id)) {
        case 5:
          return 'APARTMENT';
        case 36:
          return 'HOUSE';
        case 7:
          return 'VILLA';
        case 15:
          return 'OFFICE';
        case 18:
          return 'SHOP';
        case 29:
          return 'WAREHOUSE';
        case 19:
          return 'LAND';
        case 9:
          return 'GARAGE';
        default:
          return 'APARTMENT';
      }
    };
    const normalizePropertyType = (rawType: any, oneClickType: any): string => {
      const normalized = String(rawType || '').trim().toUpperCase();
      if (normalized === 'COMMERCIAL') return 'SHOP';
      if (normalized === 'LOFT') return 'APARTMENT';
      if (PROPERTY_TYPE_VALUES.has(normalized)) return normalized;
      return mapOneClickTypeToPropertyType(Number(oneClickType));
    };
    const type = normalizePropertyType(body?.type, body?.oneClickData?.idtipologiaimmobile ?? (existing?.oneClickData as any)?.idtipologiaimmobile);

    const hasOneClickDataField = Object.prototype.hasOwnProperty.call(body, 'oneClickData');
    const mergedOneClickInput =
      hasOneClickDataField
        ? body.oneClickData
        : (existing?.oneClickData ?? undefined);
    const oneClickInputBase = {
      ...(existing || {}),
      ...body,
      reference: body.reference ?? existing?.reference,
      giListingId: body.giListingId ?? existing?.giListingId,
      createdAt: existing?.createdAt || body.createdAt || new Date(),
      updatedAt: new Date()
    };
    const normalizedOneClickFromInput = normalizeAndValidateOneClickInput(
      mergedOneClickInput ?? defaultOneClickDataFromPropertyInput(oneClickInputBase),
      oneClickInputBase
    );
    if (!normalizedOneClickFromInput.validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Campi obbligatori 1clickannunci mancanti o non validi',
        oneClickErrors: normalizedOneClickFromInput.validation.errors
      });
    }
    const normalizedOneClickFinal = applyOneClickPortalSelectionDelta(
      normalizedOneClickFromInput.normalized,
      (existing?.oneClickData as any) || null
    );
    const oneClickDataForPersistence = enforcePropertyPublicationControlsByRole(
      auth.role,
      normalizedOneClickFinal,
      (existing?.oneClickData as any) || null
    );
    const MIN_PROPERTY_IMAGES = 7;
    const readFlag = (value: any) => String(value || '').trim().toUpperCase() === 'S';
    const effectiveImages = Array.isArray(body?.images)
      ? body.images.filter((img: any) => typeof img === 'string' && img.trim())
      : (Array.isArray(existing?.images) ? existing.images : []);
    const requiredErrors: string[] = [];
    const effectiveTitle = String(firstDefinedValue(body?.title, existing?.title) || '').trim();
    const effectiveDescription = String(firstDefinedValue(body?.description, existing?.description) || '').trim();
    const effectiveOwnerFirstName = String(firstDefinedValue(body?.ownerFirstName, existing?.ownerFirstName) || '').trim();
    const effectiveOwnerLastName = String(firstDefinedValue(body?.ownerLastName, existing?.ownerLastName) || '').trim();
    const effectiveOwnerEmail = String(firstDefinedValue(body?.ownerEmail, existing?.ownerEmail) || '').trim();
    const effectiveOwnerPhone = String(firstDefinedValue(body?.ownerPhone, existing?.ownerPhone) || '').trim();
    const effectiveAgentId = String(firstDefinedValue(body?.agentId, body?.ownerId, existing?.ownerId) || '').trim();
    if (!effectiveTitle) requiredErrors.push('title');
    if (!effectiveDescription) requiredErrors.push('description');
    if (!effectiveOwnerFirstName) requiredErrors.push('ownerFirstName');
    if (!effectiveOwnerLastName) requiredErrors.push('ownerLastName');
    if (!effectiveOwnerEmail) requiredErrors.push('ownerEmail');
    if (!effectiveOwnerPhone) requiredErrors.push('ownerPhone');
    if (!effectiveAgentId) requiredErrors.push('agentId');
    if (effectiveImages.length < MIN_PROPERTY_IMAGES) requiredErrors.push(`images(min:${MIN_PROPERTY_IMAGES})`);
    const oneClickRequired = (normalizedOneClickFinal || {}) as any;
    const hasPositive = (v: any) => Number.isFinite(Number(v)) && Number(v) > 0;
    const isYes = (v: any) => String(v || '').trim().toUpperCase() === 'S';
    const hasValue = (v: any) => String(v ?? '').trim().length > 0;
    const isBoxNone = (v: any) => {
      const raw = String(v || '').trim().toLowerCase();
      return !raw || raw === 'nessuno' || raw === 'no' || raw === 'n';
    };

    // Step 6 - Struttura edificio
    if (!hasValue(oneClickRequired.piano)) requiredErrors.push('piano');
    if (!hasValue(oneClickRequired.ascensore)) requiredErrors.push('ascensore');
    if (!hasPositive(oneClickRequired.spese_cond_mensili) && Number(oneClickRequired.spese_cond_mensili) !== 0) requiredErrors.push('spese_cond_mensili');

    // Step 7 - Spazi e accessori
    if (!hasValue(oneClickRequired.balcone)) requiredErrors.push('balcone');
    if (isYes(oneClickRequired.balcone) && !hasPositive(oneClickRequired.nr_balconi)) requiredErrors.push('nr_balconi');
    if (!hasValue(oneClickRequired.terrazzo)) requiredErrors.push('terrazzo');
    if (isYes(oneClickRequired.terrazzo) && !hasPositive(oneClickRequired.nr_terrazzi)) requiredErrors.push('nr_terrazzi');
    if (!hasValue(oneClickRequired.giardino)) requiredErrors.push('giardino');
    if (isYes(oneClickRequired.giardino) && !hasPositive(oneClickRequired.mq_giardino)) requiredErrors.push('mq_giardino');
    if (!hasValue(oneClickRequired.mansarda)) requiredErrors.push('mansarda');
    if (isYes(oneClickRequired.mansarda) && !hasPositive(oneClickRequired.mq_mansarda)) requiredErrors.push('mq_mansarda');
    if (!hasValue(oneClickRequired.cantina)) requiredErrors.push('cantina');
    if (isYes(oneClickRequired.cantina) && !hasPositive(oneClickRequired.mq_cantina)) requiredErrors.push('mq_cantina');
    if (!hasValue(oneClickRequired.box_auto)) requiredErrors.push('box_auto');
    if (!isBoxNone(oneClickRequired.box_auto) && !hasPositive(oneClickRequired.mq_box)) requiredErrors.push('mq_box');
    if ((isYes(oneClickRequired.balcone) || isYes(oneClickRequired.terrazzo) || isYes(oneClickRequired.giardino)) && !hasPositive(oneClickRequired.mq_esterno) && Number(oneClickRequired.mq_esterno) !== 0) requiredErrors.push('mq_esterno');

    // Step 8 - Dotazioni interne
    if (!hasValue(oneClickRequired.arredato)) requiredErrors.push('arredato');
    if (!hasValue(oneClickRequired.cucina)) requiredErrors.push('cucina');
    if (!hasValue(oneClickRequired.riscaldamento)) requiredErrors.push('riscaldamento');
    if (!hasValue(oneClickRequired.tipo_riscaldamento)) requiredErrors.push('tipo_riscaldamento');
    if (!hasValue(oneClickRequired.condizionatore)) requiredErrors.push('condizionatore');
    if (!hasValue(oneClickRequired.allarme_antifurto)) requiredErrors.push('allarme_antifurto');
    if (!hasValue(oneClickRequired.portineria)) requiredErrors.push('portineria');
    if (!hasValue(oneClickRequired.internet)) requiredErrors.push('internet');
    if (!hasValue(oneClickRequired.caminetto)) requiredErrors.push('caminetto');
    if (!hasValue(oneClickRequired.piscina)) requiredErrors.push('piscina');

    // Step 9 - Energetica
    if (!hasValue(oneClickRequired.classe_energetica)) requiredErrors.push('classe_energetica');

    if (String(firstDefinedValue(body?.contractType, existing?.contractType) || '').trim().toUpperCase() === 'RENT' && !String((normalizedOneClickFinal as any)?.contratto_affitto || '').trim()) {
      requiredErrors.push('contratto_affitto');
    }

    const explicitIsPublished = parseBooleanOrUndefined(body?.isPublished);
    const shouldEnforceStrictValidationOnUpdate =
      Boolean(existing?.isPublished) || (auth.role !== 'AGENT' && explicitIsPublished === true);
    const validationWarnings = requiredErrors.length > 0 && !shouldEnforceStrictValidationOnUpdate ? [...requiredErrors] : [];

    if (requiredErrors.length > 0 && shouldEnforceStrictValidationOnUpdate) {
      return res.status(400).json({
        success: false,
        message: `Missing required property fields: ${requiredErrors.join(', ')}`
      });
    }

    const oneClick = (normalizedOneClickFinal || {}) as any;
    const contractType = normalizeContractTypeValue(
      firstDefinedValue(body?.contractType, existing?.contractType),
      oneClick?.idtipologiaannuncio
    );
    const status = normalizePropertyStatusValue(firstDefinedValue(body?.status, existing?.status));
    const inferredPrice = parseNumberOrUndefined(oneClick?.prezzo);
    const inferredSurface = parseNumberOrUndefined(oneClick?.mq);
    const inferredRooms = parseIntOrUndefined(oneClick?.nr_locali);
    const inferredBedrooms = parseIntOrUndefined(oneClick?.nr_camere);
    const inferredBathrooms = parseIntOrUndefined(oneClick?.nr_servizi);

    const propertyData: any = {
      title: body.title,
      description: body.description,
      type: type,
      contractType,
      status,
      address: body.address,
      city: body.city,
      province: body.province,
      zipCode: body.zipCode,
      giComuneIstat: firstDefinedValue(body.giComuneIstat, oneClick?.comune_istat, existing?.giComuneIstat),
      latitude: parseNumberOrUndefined(firstDefinedValue(body.latitude, oneClick?.latitudine, existing?.latitude)),
      longitude: parseNumberOrUndefined(firstDefinedValue(body.longitude, oneClick?.longitudine, existing?.longitude)),
      
      rooms: parseIntOrUndefined(firstDefinedValue(body.rooms, inferredRooms, existing?.rooms)),
      bedrooms: parseIntOrUndefined(firstDefinedValue(body.bedrooms, inferredBedrooms, existing?.bedrooms)),
      bathrooms: parseIntOrUndefined(firstDefinedValue(body.bathrooms, inferredBathrooms, existing?.bathrooms)),
      surface: parseNumberOrUndefined(firstDefinedValue(body.surface, inferredSurface, existing?.surface)),
      garden: parseNumberOrUndefined(firstDefinedValue(body.garden, oneClick?.mq_giardino, existing?.garden)),
      terrace: parseNumberOrUndefined(firstDefinedValue(body.terrace, existing?.terrace)),
      balcony: parseNumberOrUndefined(firstDefinedValue(body.balcony, existing?.balcony)),
      parking: parseIntOrUndefined(firstDefinedValue(body.parkingSpaces, body.parking, existing?.parking)),
      floor: parseIntOrUndefined(firstDefinedValue(body.floor, oneClick?.piano, existing?.floor)),
      totalFloors: parseIntOrUndefined(firstDefinedValue(body.totalFloors, oneClick?.totale_piani, existing?.totalFloors)),
      elevator: parseBooleanOrUndefined(firstDefinedValue(body.elevator, parseYesNoFlag(oneClick?.ascensore), existing?.elevator)),
      furnished: parseBooleanOrUndefined(firstDefinedValue(body.furnished, parseYesNoFlag(oneClick?.arredato), existing?.furnished)),
      
      salePrice: parseNumberOrUndefined(firstDefinedValue(body.salePrice, contractType !== 'RENT' ? inferredPrice : undefined, existing?.salePrice)),
      rentPrice: parseNumberOrUndefined(firstDefinedValue(body.rentPrice, contractType === 'RENT' ? inferredPrice : undefined, existing?.rentPrice)),
      advertisingSalePrice: parseNumberOrUndefined(firstDefinedValue(body.advertisingSalePrice, existing?.advertisingSalePrice)),
      advertisingRentPrice: parseNumberOrUndefined(firstDefinedValue(body.advertisingRentPrice, existing?.advertisingRentPrice)),
      expenses: parseNumberOrUndefined(firstDefinedValue(body.condominium, body.expenses, existing?.expenses)), // Map condominium to expenses
      
      energyClass: firstDefinedValue(body.energyClass, oneClick?.classe_energetica, existing?.energyClass),
      
      ownerFirstName: body.ownerFirstName,
      ownerLastName: body.ownerLastName,
      ownerBirthDate: body.ownerBirthDate,
      ownerBirthPlace: body.ownerBirthPlace,
      ownerFiscalCode: body.ownerFiscalCode,
      ownerAddress: body.ownerAddress,
      ownerCity: body.ownerCity,
      ownerZipCode: body.ownerZipCode,
      ownerEmail: body.ownerEmail,
      ownerPhone: body.ownerPhone,
      
      buildingConstructionYear: parseIntOrUndefined(firstDefinedValue(body.buildingConstructionYear, existing?.buildingConstructionYear)),
      buildingRenovationYear: parseIntOrUndefined(firstDefinedValue(body.buildingRenovationYear, existing?.buildingRenovationYear)),
      buildingFloorsTotal: parseIntOrUndefined(firstDefinedValue(body.buildingFloorsTotal, existing?.buildingFloorsTotal)),
      buildingElevator: parseBooleanOrUndefined(firstDefinedValue(body.buildingElevator, existing?.buildingElevator)),
      buildingConcierge: parseBooleanOrUndefined(firstDefinedValue(body.buildingConcierge, existing?.buildingConcierge)),
      buildingGardenShared: parseBooleanOrUndefined(firstDefinedValue(body.buildingGardenShared, existing?.buildingGardenShared)),
      buildingHeatingType: body.buildingHeatingType || body.heating, // Map heating fallback
      buildingCondition: body.buildingCondition,
      
      images: Array.isArray(body.images)
        ? body.images.filter((img: any) => typeof img === 'string' && img.trim())
        : undefined,
      portalTargets: normalizedPortalTargets.portalIds,
      oneClickData: oneClickDataForPersistence,
      reference: firstDefinedValue(body.reference, oneClick?.riferimento, existing?.reference),
      notes: body.notes,
      ownerId: auth.role === 'AGENT' ? auth.id : (body.agentId || body.ownerId)
    };

    if (shouldMarkPendingApproval) {
      propertyData.notes = appendPendingApprovalTag(body?.notes, auth.id);
      propertyData.isPublished = false;
    }
    if (auth.role === 'AGENT') {
      propertyData.isPublished = false;
    }
    if (auth.role !== 'AGENT' && explicitIsPublished !== undefined) {
      propertyData.isPublished = explicitIsPublished;
      if (explicitIsPublished) {
        propertyData.publishedAt = existing?.publishedAt || new Date();
      } else {
        propertyData.publishedAt = null;
      }
    }

    // Remove undefined keys
    Object.keys(propertyData).forEach(key => propertyData[key] === undefined && delete propertyData[key]);

    const updatedProperty = await prisma.property.update({
      where: { id: req.params.id },
      data: propertyData
    });

    try {
      const adSalePrev = toPositivePriceOrNull(existing.advertisingSalePrice);
      const adSaleNext = toPositivePriceOrNull((updatedProperty as any).advertisingSalePrice);
      const adRentPrev = toPositivePriceOrNull(existing.advertisingRentPrice);
      const adRentNext = toPositivePriceOrNull((updatedProperty as any).advertisingRentPrice);
      const publishedPrev = Boolean(existing.isPublished);
      const publishedNext = Boolean((updatedProperty as any).isPublished);
      const hasAdvertisingPriceChange = adSalePrev !== adSaleNext || adRentPrev !== adRentNext;
      const hasPublishToggle = publishedPrev !== publishedNext;

      if (hasAdvertisingPriceChange || hasPublishToggle) {
        await writeAuditLog(
          hasPublishToggle ? 'PROPERTY_PUBLICATION_CHANGED' : 'PROPERTY_ADVERTISING_PRICE_CHANGED',
          'Property',
          String(updatedProperty.id),
          auth.id,
          req.ip,
          auth.email || null,
          req.get('user-agent') || null,
          {
            advertisingSalePrice: { before: adSalePrev, after: adSaleNext },
            advertisingRentPrice: { before: adRentPrev, after: adRentNext },
            isPublished: { before: publishedPrev, after: publishedNext }
          } as any
        );
      }
    } catch (auditError) {
      console.error('Error writing property update audit log:', auditError);
    }

    try {
      await recomputeMatchesForProperty(updatedProperty.id, updatedProperty.agencyId);
    } catch (matchingError) {
      console.error('Error recomputing matches after property update:', matchingError);
    }

    if (shouldMarkPendingApproval && updatedProperty.agencyId) {
      const submittedByName = [String(auth.firstName || '').trim(), String(auth.lastName || '').trim()].filter(Boolean).join(' ').trim() || String(auth.email || '').trim() || 'Agente';
      const admins = await prisma.user.findMany({
        where: {
          agencyId: updatedProperty.agencyId,
          role: { in: ['SUPER_ADMIN', 'AGENCY_ADMIN'] }
        },
        select: { id: true }
      });

      await Promise.all(
        admins.map((admin) =>
          createNotificationRecord({
            agencyId: updatedProperty.agencyId,
            recipientId: admin.id,
            type: 'PROPERTY_PENDING_APPROVAL',
            title: 'Immobile aggiornato in approvazione',
            message: `L'agente ${submittedByName} richiede l'approvazione dell'immobile "${updatedProperty.title}"`,
            data: {
              propertyId: updatedProperty.id,
              status: 'PENDING_APPROVAL',
              submittedById: auth.id,
              submittedByName
            }
          })
        )
      );
    }

    if (updatedProperty.agencyId) {
      const assigneeIds = extractPropertyAssigneeIds(body, updatedProperty.ownerId);
      const hasReassignment = existing.ownerId !== updatedProperty.ownerId || assigneeIds.some((id) => id !== String(existing.ownerId || '').trim());
      if (hasReassignment) {
        await Promise.all(
          assigneeIds.map((recipientId) =>
            createNotificationRecord({
              agencyId: updatedProperty.agencyId,
              recipientId,
              type: 'PROPERTY_ASSIGNED',
              title: 'Nuovo immobile assegnato',
              message: buildPropertyNotificationMessage(updatedProperty),
              data: {
                propertyId: updatedProperty.id,
                source: 'PROPERTY_REASSIGN',
                previousOwnerId: existing.ownerId,
                assignedById: auth.id
              }
            })
          )
        );
      }
    }

    // Sync Contact (Owner) with Agent
    const finalOwnerId = updatedProperty.ownerId; // Use the updated ownerId from the database
    if (finalOwnerId && (updatedProperty.ownerEmail || updatedProperty.ownerPhone || (updatedProperty.ownerFirstName && updatedProperty.ownerLastName))) {
      try {
        const existingContact = await prisma.contact.findFirst({
          where: {
            OR: [
              { email: updatedProperty.ownerEmail || undefined },
              { phone: updatedProperty.ownerPhone || undefined },
              // Fallback to name match if email/phone are missing (be careful with duplicates, but better than nothing)
              (!updatedProperty.ownerEmail && !updatedProperty.ownerPhone) ? {
                firstName: { equals: updatedProperty.ownerFirstName, mode: 'insensitive' },
                lastName: { equals: updatedProperty.ownerLastName, mode: 'insensitive' }
              } : {}
            ]
          }
        });

        if (existingContact) {
          // Update existing contact assignment
          await prisma.contact.update({
            where: { id: existingContact.id },
            data: { assignedToId: finalOwnerId }
          });
        } else if (updatedProperty.ownerFirstName && updatedProperty.ownerLastName) {
          // Create new contact
          await prisma.contact.create({
            data: {
              firstName: updatedProperty.ownerFirstName,
              lastName: updatedProperty.ownerLastName,
              email: updatedProperty.ownerEmail,
              phone: updatedProperty.ownerPhone,
              type: updatedProperty.contractType === 'RENT' ? 'LANDLORD' : 'SELLER',
              assignedToId: finalOwnerId,
              agencyId: updatedProperty.agencyId,
              source: 'PROPERTY_UPDATE'
            }
          });
        }
      } catch (contactError) {
        console.error('Error syncing contact:', contactError);
      }
    }

    res.json({
      success: true,
      data: updatedProperty,
      message: 'Property updated successfully',
      warnings: validationWarnings
    });
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({ success: false, message: 'Error updating property', error: String(error) });
  }
});

app.delete('/api/properties/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const existing = await prisma.property.findUnique({ where: { id: req.params.id }, select: { id: true, ownerId: true, agencyId: true } });
    if (!existing) return res.status(404).json({ success: false, message: 'Property not found' });
    if (auth.agencyId && existing.agencyId !== auth.agencyId) return res.status(404).json({ success: false, message: 'Property not found' });
    if (auth.role === 'AGENT' && existing.ownerId !== auth.id) return res.status(403).json({ success: false, message: 'Forbidden' });

    const deletedProperty = await prisma.property.delete({
      where: { id: req.params.id }
    });

    res.json({
      success: true,
      data: deletedProperty,
      message: 'Property deleted successfully'
    });
  } catch (error) {
    res.status(404).json({ success: false, message: 'Property not found' });
  }
});

const getAccessiblePropertyForMedia = async (propertyId: string, auth: AuthContext) => {
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) return null;
  if (auth.agencyId && property.agencyId !== auth.agencyId) return null;
  if (auth.role === 'AGENT' && property.ownerId !== auth.id) return null;
  return property;
};

app.post('/api/properties/:id/images', upload.array('images', 40), async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const property = await getAccessiblePropertyForMedia(req.params.id, auth);
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

    const files = ((req as any).files || []) as Express.Multer.File[];
    if (!files.length) return res.status(400).json({ success: false, message: 'No images uploaded' });

    const imageUrls: string[] = [];
    const storageWarnings: string[] = [];
    let storageReady = true;
    try {
      await storageEnsureBucket(OWNER_DOCUMENTS_BUCKET);
    } catch (storageInitError: any) {
      storageReady = false;
      storageWarnings.push(`storage_unavailable:${String(storageInitError?.message || storageInitError || 'unknown')}`);
      console.warn('Object storage unavailable, using inline fallback for property images:', storageInitError?.message || storageInitError);
    }
    for (const file of files) {
      if (!String(file.mimetype || '').startsWith('image/')) {
        return res.status(400).json({ success: false, message: 'Sono consentite solo immagini' });
      }
      if (storageReady) {
        try {
          const fileKey = buildSafeFileKey(`property-image-${property.id}`, file.originalname);
          await storagePutObject(OWNER_DOCUMENTS_BUCKET, fileKey, file.buffer, file.size, file.mimetype);
          imageUrls.push(`/api/properties/${property.id}/images/${encodeURIComponent(fileKey)}`);
          continue;
        } catch (storagePutError: any) {
          storageWarnings.push(`storage_put_failed:${String(storagePutError?.message || storagePutError || 'unknown')}`);
          console.warn('Image storage put failed, using inline fallback:', storagePutError?.message || storagePutError);
        }
      }
      const base64 = file.buffer.toString('base64');
      imageUrls.push(`data:${file.mimetype || 'image/jpeg'};base64,${base64}`);
    }

    await prisma.property.update({
      where: { id: property.id },
      data: { images: [...(Array.isArray(property.images) ? property.images : []), ...imageUrls] }
    });

    res.status(201).json({ success: true, imageUrls, warnings: storageWarnings });
  } catch (error) {
    console.error('Error uploading property images:', error);
    res.status(500).json({ success: false, message: 'Error uploading property images' });
  }
});

app.get('/api/properties/:id/images/:fileKey', async (req, res) => {
  try {
    const property = await prisma.property.findUnique({ where: { id: req.params.id }, select: { id: true, images: true } });
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

    const fileKey = decodeURIComponent(String(req.params.fileKey || ''));
    const expectedUrl = `/api/properties/${property.id}/images/${encodeURIComponent(fileKey)}`;
    if (!Array.isArray(property.images) || !property.images.includes(expectedUrl)) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    const stat = await storageStatObject(OWNER_DOCUMENTS_BUCKET, fileKey);
    const stream = await storageGetObject(OWNER_DOCUMENTS_BUCKET, fileKey);
    res.setHeader('Content-Type', stat?.metaData?.['content-type'] || stat?.contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    stream.pipe(res);
  } catch (error) {
    console.error('Error reading property image:', error);
    res.status(404).json({ success: false, message: 'Image not found' });
  }
});

app.put('/api/properties/:id/images/featured', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const property = await getAccessiblePropertyForMedia(req.params.id, auth);
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

    const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl : '';
    const images = Array.isArray(property.images) ? property.images : [];
    if (!imageUrl || !images.includes(imageUrl)) {
      return res.status(400).json({ success: false, message: 'Image not found in property gallery' });
    }

    const reordered = [imageUrl, ...images.filter((img) => img !== imageUrl)];
    const updated = await prisma.property.update({ where: { id: property.id }, data: { images: reordered } });
    res.json({ success: true, data: updated, imageUrls: reordered });
  } catch (error) {
    console.error('Error setting featured image:', error);
    res.status(500).json({ success: false, message: 'Error setting featured image' });
  }
});

app.delete('/api/properties/:id/images', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const property = await getAccessiblePropertyForMedia(req.params.id, auth);
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

    const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl : '';
    const images = Array.isArray(property.images) ? property.images : [];
    if (!imageUrl || !images.includes(imageUrl)) {
      return res.status(400).json({ success: false, message: 'Image not found in property gallery' });
    }

    const marker = `/api/properties/${property.id}/images/`;
    if (imageUrl.includes(marker)) {
      const fileKey = decodeURIComponent(imageUrl.split(marker)[1] || '');
      if (fileKey) {
        await storageRemoveObject(OWNER_DOCUMENTS_BUCKET, fileKey).catch(() => undefined);
      }
    }

    const updatedImages = images.filter((img) => img !== imageUrl);
    await prisma.property.update({ where: { id: property.id }, data: { images: updatedImages } });
    res.json({ success: true, imageUrls: updatedImages });
  } catch (error) {
    console.error('Error deleting property image:', error);
    res.status(500).json({ success: false, message: 'Error deleting property image' });
  }
});

app.get('/api/properties/:id/documents', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const property = await getAccessiblePropertyForMedia(req.params.id, auth);
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });
    const oneClickData = (property.oneClickData || {}) as any;
    const documents = [...normalizeStoredPropertyDocuments(oneClickData), ...legacyPropertyDocumentRows(oneClickData)]
      .sort((a: any, b: any) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
    res.json({ success: true, data: documents });
  } catch (error) {
    console.error('Error fetching property documents:', error);
    res.status(500).json({ success: false, message: 'Error fetching property documents' });
  }
});

app.post('/api/properties/:id/documents', upload.single('file'), async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const property = await getAccessiblePropertyForMedia(req.params.id, auth);
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

    const file: any = (req as any).file;
    if (!file) return res.status(400).json({ success: false, message: 'File is required' });

    const rawType = typeof req.body?.type === 'string' ? req.body.type.trim().toUpperCase() : 'ALTRO';
    const customLabel = typeof req.body?.customLabel === 'string' ? req.body.customLabel.trim() : '';
    const type = rawType === 'PLANIMETRIA' || rawType === 'VISURA' ? rawType : 'ALTRO';
    const label =
      type === 'PLANIMETRIA'
        ? 'Planimetria catastale'
        : type === 'VISURA'
          ? 'Visura catastale'
          : (customLabel || 'Documento immobile');
    const fileKey = buildSafeFileKey(`property-document-${property.id}-${type.toLowerCase()}`, file.originalname);
    await storageEnsureBucket(OWNER_DOCUMENTS_BUCKET);
    await storagePutObject(OWNER_DOCUMENTS_BUCKET, fileKey, file.buffer, file.size, file.mimetype || 'application/octet-stream');

    const oneClickData = { ...((property.oneClickData || {}) as any) };
    const documents = normalizeStoredPropertyDocuments(oneClickData);
    const document = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      label,
      fileName: file.originalname,
      fileKey,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
      uploadedAt: new Date().toISOString(),
      uploadedById: auth.id,
      uploadedByName: auth.id
    };
    oneClickData.propertyDocuments = [document, ...documents];
    if (type === 'PLANIMETRIA') {
      oneClickData.doc_planimetria = 'S';
      oneClickData.planimetria_file = document;
    }
    if (type === 'VISURA') {
      oneClickData.doc_visura = 'S';
      oneClickData.visura_file = document;
    }

    await prisma.property.update({ where: { id: property.id }, data: { oneClickData } });
    res.status(201).json({ success: true, data: document });
  } catch (error) {
    console.error('Error uploading property document:', error);
    res.status(500).json({ success: false, message: 'Error uploading property document' });
  }
});

app.get('/api/properties/:id/documents/:documentId', async (req, res) => {
  try {
    const property = await prisma.property.findUnique({ where: { id: req.params.id } });
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

    const docs = [
      ...normalizeStoredPropertyDocuments((property.oneClickData || {}) as any),
      ...legacyPropertyDocumentRows((property.oneClickData || {}) as any, true)
    ];
    const document = docs.find((doc: any) => String(doc.id) === String(req.params.documentId));
    if (!document?.fileKey && !document?.dataUrl) return res.status(404).json({ success: false, message: 'Document not found' });

    if (document.dataUrl) {
      const match = String(document.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return res.status(404).json({ success: false, message: 'Document not found' });
      const buffer = Buffer.from(match[2], 'base64');
      const download = String(req.query.download || '') === '1';
      res.setHeader('Content-Type', document.mimeType || match[1] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${String(document.fileName || 'documento').replace(/"/g, '')}"`);
      return res.send(buffer);
    }

    const stat = await storageStatObject(OWNER_DOCUMENTS_BUCKET, document.fileKey);
    const stream = await storageGetObject(OWNER_DOCUMENTS_BUCKET, document.fileKey);
    const download = String(req.query.download || '') === '1';
    res.setHeader('Content-Type', document.mimeType || stat?.metaData?.['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${String(document.fileName || 'documento').replace(/"/g, '')}"`);
    stream.pipe(res);
  } catch (error) {
    console.error('Error reading property document:', error);
    res.status(404).json({ success: false, message: 'Document not found' });
  }
});

// Contacts endpoints
const REQUEST_META_PREFIX = 'CRM_REQ_';
const REQUEST_META_KEYS = {
  goal: `${REQUEST_META_PREFIX}GOAL`,
  zone: `${REQUEST_META_PREFIX}ZONE`,
  rentSubtype: `${REQUEST_META_PREFIX}RENT_SUBTYPE`
} as const;

const parseOptionalString = (value: any): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseOptionalNumber = (value: any): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readRequestMetaFromNotes = (notes: string | null | undefined) => {
  const source = typeof notes === 'string' ? notes : '';
  const metaRegex = /\[(CRM_REQ_[A-Z_]+)=([^\]]*)\]/g;
  const meta: Record<string, string> = {};
  let match: RegExpExecArray | null;
  while ((match = metaRegex.exec(source)) !== null) {
    meta[match[1]] = match[2] || '';
  }
  const cleaned = source.replace(metaRegex, '').replace(/\n{3,}/g, '\n\n').trim();
  return { meta, cleanedNotes: cleaned || undefined };
};

const encodeRequestNotesWithMeta = (plainNotes: string | undefined, meta: Record<string, string | undefined>) => {
  const cleanNotes = parseOptionalString(plainNotes) || '';
  const tags = Object.entries(meta)
    .filter(([, value]) => parseOptionalString(value))
    .map(([key, value]) => `[${key}=${String(value).trim()}]`);
  const payload = [cleanNotes, ...tags].filter(Boolean).join('\n').trim();
  return payload.length > 0 ? payload : undefined;
};

const resolveRequestGoal = (request: any, meta: Record<string, string>) => {
  const fromMeta = parseOptionalString(meta[REQUEST_META_KEYS.goal]);
  if (fromMeta) return fromMeta;
  if (request?.contractType === 'RENT') return 'RENT';
  return 'SALE';
};

const normalizeRequestFlatResponse = (contact: any) => {
  const request = contact?.requests?.[0];
  const { requests, ...rest } = contact || {};
  if (!request) return rest;
  const requestMeta = readRequestMetaFromNotes(request.notes);
  return {
    ...rest,
    requestTitle: request.title ?? undefined,
    requestStatus: request.status ?? undefined,
    budget: request.maxPrice ?? undefined,
    budgetMin: request.minPrice ?? undefined,
    budgetMax: request.maxPrice ?? undefined,
    preferences: request.description ?? undefined,
    requestApartmentType: request.apartmentSubtype ?? undefined,
    requestBedrooms: request.minRooms ?? undefined,
    requestBathrooms: request.minBathrooms ?? undefined,
    requestFloor: request.minFloor ?? undefined,
    requestGoal: resolveRequestGoal(request, requestMeta.meta),
    requestPropertyType: request.type ?? undefined,
    requestZone: parseOptionalString(requestMeta.meta[REQUEST_META_KEYS.zone]),
    requestSurfaceSqm: request.minSurface ?? request.maxSurface ?? undefined,
    rentContractSubtype: parseOptionalString(requestMeta.meta[REQUEST_META_KEYS.rentSubtype]),
    requestNotes: requestMeta.cleanedNotes
  };
};

const mapRequestPropertyType = (value: any): Prisma.PropertyType | undefined => {
  const normalized = parseOptionalString(value)?.toUpperCase();
  if (!normalized) return undefined;
  const allowed = [
    'APARTMENT',
    'HOUSE',
    'VILLA',
    'OFFICE',
    'SHOP',
    'WAREHOUSE',
    'LAND',
    'GARAGE',
    'OTHER'
  ];
  if (!allowed.includes(normalized)) return undefined;
  return normalized as Prisma.PropertyType;
};

const mapRequestGoalToContract = (goal: string | undefined, fallbackByType: 'SALE' | 'RENT') => {
  const normalized = parseOptionalString(goal)?.toUpperCase();
  if (normalized === 'SALE' || normalized === 'VENDITA' || normalized === 'BUY' || normalized === 'ACQUISTO') return 'SALE';
  if (normalized === 'RENT' || normalized === 'AFFITTO' || normalized === 'LOCAZIONE') return 'RENT';
  if (normalized === 'VACATION') return 'RENT';
  return fallbackByType;
};

app.get('/api/contacts', async (req, res) => {
  const { page = 1, limit = 10, search, type, category, city, assignedToId } = req.query;

  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const where: any = {};

    if (auth.agencyId) where.agencyId = auth.agencyId;
    if (assignedToId) {
      if (assignedToId.toString() === '__UNASSIGNED__') {
        where.assignedToId = null;
      } else {
        where.assignedToId = assignedToId.toString();
      }
    }

    if (search) {
      const searchTerm = search.toString().toLowerCase();
      where.OR = [
        { firstName: { contains: searchTerm, mode: 'insensitive' } },
        { lastName: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
        { phone: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }

    if (type) {
      where.type = type;
    } else if (category) {
      if (category.toString() === 'CLIENT') {
        where.type = { in: ['BUYER', 'TENANT', 'LEAD'] };
      } else if (category.toString() === 'PROPRIETOR') {
        where.type = { in: ['SELLER', 'LANDLORD'] };
      }
    }
    if (city) where.city = { contains: city.toString(), mode: 'insensitive' };
    if (req.query.assignedToId && req.query.assignedToId.toString() !== '__UNASSIGNED__') {
      where.assignedToId = req.query.assignedToId.toString();
    }

    const [total, contactsWithRequests] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          requests: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      })
    ]);

    const contacts = contactsWithRequests.map((contact: any) => normalizeRequestFlatResponse(contact));

    res.json({
      success: true,
      data: contacts,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching contacts' });
  }
});

app.get('/api/contacts/:id', async (req, res, next) => {
  try {
    const contactId = String(req.params.id || '').toLowerCase();
    if (
      contactId === 'export' ||
      contactId === 'export.csv' ||
      contactId === 'import' ||
      contactId === 'import.csv' ||
      contactId === 'import-template' ||
      contactId === 'import-template.csv'
    ) {
      return next();
    }

    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const contactWithRequests = await prisma.contact.findUnique({
      where: { id: req.params.id },
      include: {
        requests: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (contactWithRequests) {
      if (auth.agencyId && contactWithRequests.agencyId !== auth.agencyId) {
        return res.status(404).json({ success: false, message: 'Contact not found' });
      }
      if (auth.role === 'AGENT' && contactWithRequests.assignedToId && contactWithRequests.assignedToId !== auth.id) {
        return res.status(404).json({ success: false, message: 'Contact not found' });
      }
      const contact = normalizeRequestFlatResponse(contactWithRequests as any);

      res.json({ success: true, data: contact });
    } else {
      res.status(404).json({ success: false, message: 'Contact not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching contact' });
  }
});

app.get('/api/contacts/:id/documents', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const contact = await prisma.contact.findUnique({
      where: { id: req.params.id },
      select: { id: true, agencyId: true, assignedToId: true }
    });

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    if (auth.agencyId && contact.agencyId !== auth.agencyId) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    if (auth.role === 'AGENT' && contact.assignedToId && contact.assignedToId !== auth.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const documents = await prisma.ownerDocument.findMany({
      where: { contactId: contact.id },
      orderBy: { uploadedAt: 'desc' }
    });

    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching documents' });
  }
});

app.get('/api/contacts/:id/documents/:documentId', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const contact = await prisma.contact.findUnique({
      where: { id: req.params.id },
      select: { id: true, agencyId: true, assignedToId: true }
    });

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    if (auth.agencyId && contact.agencyId !== auth.agencyId) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    if (auth.role === 'AGENT' && contact.assignedToId && contact.assignedToId !== auth.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const document = await prisma.ownerDocument.findUnique({
      where: { id: req.params.documentId }
    });

    if (!document || document.contactId !== contact.id) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const stat = await storageStatObject(OWNER_DOCUMENTS_BUCKET, document.fileKey);
    const dataStream = await storageGetObject(OWNER_DOCUMENTS_BUCKET, document.fileKey);

    const meta = stat?.metaData || {};
    const contentType =
      meta['content-type'] ||
      meta['Content-Type'] ||
      'application/octet-stream';

    const downloadParam = String((req.query as any)?.download || '').toLowerCase();
    const isDownload =
      downloadParam === '1' ||
      downloadParam === 'true' ||
      downloadParam === 'download';

    const fileName = document.fileKey.split('/').pop() || 'document';

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="${encodeURIComponent(fileName)}"`
    );

    dataStream.on('error', (streamErr: any) => {
      console.error('Error streaming document:', streamErr);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error streaming document' });
      } else {
        res.end();
      }
    });

    dataStream.pipe(res);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ success: false, message: 'Error downloading document' });
  }
});

type CsvRow = Record<string, string>;

const toCsvValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join('|');
  return String(value);
};

const escapeCsv = (value: any): string => {
  const raw = toCsvValue(value);
  if (raw.includes('"') || raw.includes(';') || raw.includes('\n') || raw.includes('\r')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

const normalizeCsvHeader = (header: string): string => {
  const norm = String(header || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_\-./]+/g, '');

  const aliases: Record<string, string> = {
    id: 'id',
    legacycustomerid: 'legacyCustomerId',
    legacyid: 'legacyCustomerId',
    firstname: 'firstName',
    nome: 'firstName',
    lastname: 'lastName',
    cognome: 'lastName',
    email: 'email',
    emailaddress: 'email',
    mail: 'email',
    telefono: 'phone',
    cellulare: 'phone',
    phone: 'phone',
    type: 'type',
    tipologia: 'type',
    address: 'address',
    indirizzo: 'address',
    city: 'city',
    citta: 'city',
    province: 'province',
    provincia: 'province',
    zipcode: 'zipCode',
    cap: 'zipCode',
    birthdate: 'birthDate',
    datadinascita: 'birthDate',
    birthplace: 'birthPlace',
    luogodinascita: 'birthPlace',
    fiscalcode: 'fiscalCode',
    codicefiscale: 'fiscalCode',
    notes: 'notes',
    note: 'notes',
    tags: 'tags',
    source: 'source',
    isactive: 'isActive',
    active: 'isActive',
    assignedtoid: 'assignedToId',
    assignedagentid: 'assignedToId',
    agentid: 'assignedToId',
    requesttitle: 'requestTitle',
    requestdescription: 'requestDescription',
    requestcontracttype: 'requestContractType',
    requeststatus: 'requestStatus',
    requesttype: 'requestType',
    requestapartmentsubtype: 'requestApartmentSubtype',
    requestminprice: 'requestMinPrice',
    requestmaxprice: 'requestMaxPrice',
    requestminsurface: 'requestMinSurface',
    requestmaxsurface: 'requestMaxSurface',
    requestminrooms: 'requestMinRooms',
    requestmaxrooms: 'requestMaxRooms',
    requestminbathrooms: 'requestMinBathrooms',
    requestmaxbathrooms: 'requestMaxBathrooms',
    requestminfloor: 'requestMinFloor',
    requestmaxfloor: 'requestMaxFloor',
    requestcities: 'requestCities',
    requestprovinces: 'requestProvinces',
    requestnotes: 'requestNotes'
  };

  return aliases[norm] || header.trim();
};

const detectCsvDelimiter = (text: string): string => {
  const firstLine = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) || '';
  const candidates = [';', ',', '\t'];
  let best = ';';
  let bestScore = -1;
  for (const delimiter of candidates) {
    const score = firstLine.split(delimiter).length - 1;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
};

const parseCsvWithDelimiter = (text: string, delimiter: string): CsvRow[] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(current);
      current = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }

    current += ch;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => normalizeCsvHeader(h));
  return rows.slice(1).map((values) => {
    const obj: CsvRow = {};
    headers.forEach((header, idx) => {
      obj[header] = (values[idx] ?? '').trim();
    });
    return obj;
  });
};

const parseCsvSemicolon = (text: string): CsvRow[] => {
  const delimiter = detectCsvDelimiter(text);
  return parseCsvWithDelimiter(text, delimiter);
};

const parseBooleanLike = (value: string | undefined, fallback = false): boolean => {
  if (!value) return fallback;
  const norm = value.trim().toLowerCase();
  if (['1', 'true', 'si', 'sì', 'yes', 'y'].includes(norm)) return true;
  if (['0', 'false', 'no', 'n'].includes(norm)) return false;
  return fallback;
};

const parseNumberLike = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  if (!normalized) return undefined;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
};

const parseIntLike = (value: string | undefined): number | undefined => {
  const n = parseNumberLike(value);
  if (n === undefined) return undefined;
  const int = Math.trunc(n);
  return Number.isFinite(int) ? int : undefined;
};

const parseDateLike = (value: string | undefined): Date | undefined => {
  if (!value || !value.trim()) return undefined;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return undefined;
  const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const normalizeContactType = (value?: string): 'BUYER' | 'SELLER' | 'TENANT' | 'LANDLORD' | 'LEAD' => {
  const norm = String(value || '').trim().toUpperCase();
  if (norm === 'BUYER' || norm === 'SELLER' || norm === 'TENANT' || norm === 'LANDLORD' || norm === 'LEAD') return norm;
  if (norm === 'CLIENT' || norm === 'ACQUIRENTE') return 'BUYER';
  if (norm === 'INQUILINO' || norm === 'RENT') return 'TENANT';
  if (norm === 'PROPRIETARIO') return 'LANDLORD';
  if (norm === 'VENDITORE') return 'SELLER';
  return 'LEAD';
};

const normalizeContractType = (value?: string): 'SALE' | 'RENT' => {
  const norm = String(value || '').trim().toUpperCase();
  if (norm === 'RENT' || norm === 'AFFITTO') return 'RENT';
  return 'SALE';
};

const pickCsvValue = (row: CsvRow, keys: string[]): string => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const isLegacyContactsCsvRow = (row: CsvRow): boolean => {
  return Boolean(
    row &&
    (
      'CUSTOMER_TYPE' in row ||
      'NOME' in row ||
      'COGNOME' in row ||
      'CELL1' in row ||
      'TEL1' in row
    )
  );
};

const buildLegacyPhone = (row: CsvRow): string | undefined => {
  const candidates = [
    [pickCsvValue(row, ['PREFCELL1']), pickCsvValue(row, ['CELL1'])].filter(Boolean).join(' '),
    [pickCsvValue(row, ['PREFTEL1']), pickCsvValue(row, ['TEL1'])].filter(Boolean).join(' '),
    [pickCsvValue(row, ['PREFCELL2']), pickCsvValue(row, ['CELL2'])].filter(Boolean).join(' '),
    [pickCsvValue(row, ['PREFTEL2']), pickCsvValue(row, ['TEL2'])].filter(Boolean).join(' ')
  ].map((value) => value.trim()).filter(Boolean);
  return candidates[0] || undefined;
};

const normalizeLegacyNotes = (row: CsvRow): string | undefined => {
  const noteParts = [
    pickCsvValue(row, ['NOTE']),
    pickCsvValue(row, ['RECAPITI_NOTE'])
      .replace(/\|+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  ].filter(Boolean);
  const merged = noteParts.join('\n').trim();
  return merged || undefined;
};

const inferLegacyContractType = (text: string): 'SALE' | 'RENT' => {
  const normalized = text.toLowerCase();
  if (/(affitt|locaz|canone|inquilin)/.test(normalized)) return 'RENT';
  return 'SALE';
};

const inferLegacyPropertyType = (text: string): Prisma.PropertyType => {
  const normalized = text.toLowerCase();
  if (/(ufficio|studio)/.test(normalized)) return 'OFFICE';
  if (/(negozio|locale commerciale|attivit)/.test(normalized)) return 'SHOP';
  if (/(magazzino|capannone|deposito)/.test(normalized)) return 'WAREHOUSE';
  if (/(garage|box auto|posto auto)/.test(normalized)) return 'GARAGE';
  if (/(terreno|lotto|edificabile)/.test(normalized)) return 'LAND';
  if (/(villa|villetta)/.test(normalized)) return 'VILLA';
  if (/(casa|abitazione|indipendente)/.test(normalized)) return 'HOUSE';
  return 'APARTMENT';
};

const inferLegacyMinRooms = (text: string): number | undefined => {
  const normalized = text.toLowerCase();
  if (/monolocal/.test(normalized)) return 1;
  if (/bilocal/.test(normalized)) return 2;
  if (/trilocal/.test(normalized)) return 3;
  if (/quadrilocal/.test(normalized)) return 4;
  if (/pentalocal|plurilocal/.test(normalized)) return 5;
  const explicit = normalized.match(/(\d+)\s*(?:camere|locali|vani)/);
  if (!explicit) return undefined;
  const value = Number(explicit[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

const inferLegacyMinBathrooms = (text: string): number | undefined => {
  const normalized = text.toLowerCase();
  const explicit = normalized.match(/(\d+)\s*bagni?/);
  if (!explicit) return undefined;
  const value = Number(explicit[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

const inferLegacyContactType = (row: CsvRow, noteText: string): 'BUYER' | 'SELLER' | 'TENANT' | 'LANDLORD' | 'LEAD' => {
  const customerType = pickCsvValue(row, ['CUSTOMER_TYPE']);
  const contractType = inferLegacyContractType(noteText);
  if (customerType === '1') return contractType === 'RENT' ? 'TENANT' : 'BUYER';
  if (customerType === '0') return contractType === 'RENT' ? 'LANDLORD' : 'SELLER';
  return 'LEAD';
};

const exportContactsCsvHandler = async (req: express.Request, res: express.Response) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const where: any = {};
    if (auth.agencyId) where.agencyId = auth.agencyId;
    if (req.query.search) {
      const term = String(req.query.search).toLowerCase();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } }
      ];
    }
    if (req.query.type) {
      where.type = String(req.query.type);
    } else if (req.query.category) {
      const category = String(req.query.category);
      if (category === 'CLIENT') where.type = { in: ['BUYER', 'TENANT', 'LEAD'] };
      if (category === 'PROPRIETOR') where.type = { in: ['SELLER', 'LANDLORD'] };
    }
    if (req.query.city) where.city = { contains: String(req.query.city), mode: 'insensitive' };
    if (req.query.assignedToId) {
      const assigned = String(req.query.assignedToId);
      where.assignedToId = assigned === '__UNASSIGNED__' ? null : assigned;
    }

    const contacts = await prisma.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        requests: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    const headers = [
      'id',
      'firstName',
      'lastName',
      'email',
      'phone',
      'type',
      'address',
      'city',
      'province',
      'zipCode',
      'birthDate',
      'birthPlace',
      'fiscalCode',
      'notes',
      'tags',
      'source',
      'isActive',
      'assignedToId',
      'legacyCustomerId',
      'requestTitle',
      'requestDescription',
      'requestContractType',
      'requestStatus',
      'requestType',
      'requestApartmentSubtype',
      'requestMinPrice',
      'requestMaxPrice',
      'requestMinSurface',
      'requestMaxSurface',
      'requestMinRooms',
      'requestMaxRooms',
      'requestMinBathrooms',
      'requestMaxBathrooms',
      'requestMinFloor',
      'requestMaxFloor',
      'requestCities',
      'requestProvinces',
      'requestNotes'
    ];

    const lines = [headers.join(';')];
    contacts.forEach((contact: any) => {
      const reqTop = contact.requests?.[0];
      const row = [
        contact.id,
        contact.firstName,
        contact.lastName,
        contact.email,
        contact.phone,
        contact.type,
        contact.address,
        contact.city,
        contact.province,
        contact.zipCode,
        contact.birthDate ? new Date(contact.birthDate).toISOString().slice(0, 10) : '',
        contact.birthPlace,
        contact.fiscalCode,
        contact.notes,
        contact.tags,
        contact.source,
        contact.isActive ? '1' : '0',
        contact.assignedToId,
        contact.legacyCustomerId,
        reqTop?.title,
        reqTop?.description,
        reqTop?.contractType,
        reqTop?.status,
        reqTop?.type,
        reqTop?.apartmentSubtype,
        reqTop?.minPrice,
        reqTop?.maxPrice,
        reqTop?.minSurface,
        reqTop?.maxSurface,
        reqTop?.minRooms,
        reqTop?.maxRooms,
        reqTop?.minBathrooms,
        reqTop?.maxBathrooms,
        reqTop?.minFloor,
        reqTop?.maxFloor,
        reqTop?.cities,
        reqTop?.provinces,
        reqTop?.notes
      ].map(escapeCsv);
      lines.push(row.join(';'));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="clienti-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${lines.join('\n')}`);
  } catch (error) {
    console.error('Error exporting contacts CSV:', error);
    res.status(500).json({ success: false, message: 'Error exporting contacts CSV' });
  }
};

app.get('/api/contacts/export.csv', exportContactsCsvHandler);
app.get('/api/contacts/export', exportContactsCsvHandler);

const importTemplateContactsCsvHandler = async (req: express.Request, res: express.Response) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const headers = [
      'id',
      'firstName',
      'lastName',
      'email',
      'phone',
      'type',
      'address',
      'city',
      'province',
      'zipCode',
      'birthDate',
      'birthPlace',
      'fiscalCode',
      'notes',
      'tags',
      'source',
      'isActive',
      'assignedToId',
      'legacyCustomerId',
      'requestTitle',
      'requestDescription',
      'requestContractType',
      'requestStatus',
      'requestType',
      'requestApartmentSubtype',
      'requestMinPrice',
      'requestMaxPrice',
      'requestMinSurface',
      'requestMaxSurface',
      'requestMinRooms',
      'requestMaxRooms',
      'requestMinBathrooms',
      'requestMaxBathrooms',
      'requestMinFloor',
      'requestMaxFloor',
      'requestCities',
      'requestProvinces',
      'requestNotes'
    ];

    const sample = [
      '',
      'Mario',
      'Rossi',
      'mario.rossi@email.it',
      '+393331112233',
      'BUYER',
      'Via Roma 10',
      'Pescara',
      'PE',
      '65121',
      '1985-04-20',
      'Pescara',
      'RSSMRA85D20G482X',
      'Cliente importato da template',
      'vip|cliente senza richiesta',
      'import_csv',
      '1',
      '',
      'legacy-123',
      'Richiesta trilocale',
      'Cerca appartamento con 2 bagni',
      'SALE',
      'ACTIVE',
      'APARTMENT',
      'APPARTAMENTO',
      '120000',
      '180000',
      '80',
      '140',
      '3',
      '4',
      '2',
      '2',
      '1',
      '3',
      'Pescara|Montesilvano',
      'PE',
      'Da richiamare nel pomeriggio'
    ];

    const lines = [headers.join(';'), sample.map(escapeCsv).join(';')];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="template-import-clienti.csv"');
    res.send(`\uFEFF${lines.join('\n')}`);
  } catch (error) {
    console.error('Error creating contacts import template CSV:', error);
    res.status(500).json({ success: false, message: 'Error creating import template CSV' });
  }
};

app.get('/api/contacts/import-template.csv', importTemplateContactsCsvHandler);
app.get('/api/contacts/import-template', importTemplateContactsCsvHandler);

const importContactsCsvHandler = async (req: express.Request, res: express.Response) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!req.file) return res.status(400).json({ success: false, message: 'Missing CSV file' });

    const agencyId = auth.agencyId;
    if (!agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const raw = req.file.buffer.toString('utf8');
    const rows = parseCsvSemicolon(raw);
    if (!rows.length) return res.status(400).json({ success: false, message: 'CSV vuoto o non valido' });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let requestsUpserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      try {
        const isLegacyRow = isLegacyContactsCsvRow(row);
        const legacyNotes = normalizeLegacyNotes(row) || '';
        const firstName = isLegacyRow ? pickCsvValue(row, ['NOME']) : (row.firstName || '').trim();
        const lastName = isLegacyRow ? pickCsvValue(row, ['COGNOME']) : (row.lastName || '').trim();
        if (!firstName && !lastName) {
          skipped += 1;
          continue;
        }

        const lookupId = isLegacyRow ? '' : (row.id || '').trim();
        const legacyCustomerId = isLegacyRow
          ? pickCsvValue(row, ['ID']) || undefined
          : (row.legacyCustomerId || '').trim() || undefined;
        const normalizedType = isLegacyRow
          ? inferLegacyContactType(row, legacyNotes)
          : normalizeContactType(row.type);
        const assignedToIdRaw = isLegacyRow ? '' : (row.assignedToId || '').trim();
        const assignedToId = assignedToIdRaw ? assignedToIdRaw : null;
        const legacyPhone = buildLegacyPhone(row);
        const legacyEmail = pickCsvValue(row, ['EMAIL', 'EMAIL2', 'PEC']) || null;
        const legacyAddress = pickCsvValue(row, ['INDIRIZZO']) || null;
        const legacyZipCode = pickCsvValue(row, ['CAP']) || null;
        const legacyBirthDate = parseDateLike(pickCsvValue(row, ['DATANASCITA'])) || null;
        const legacyFiscalCode = pickCsvValue(row, ['CF']) || null;

        const contactPayload: any = {
          firstName: firstName || 'Cliente',
          lastName: lastName || 'Senza cognome',
          email: isLegacyRow ? legacyEmail : (row.email || '').trim() || null,
          phone: isLegacyRow ? legacyPhone || null : (row.phone || '').trim() || null,
          type: normalizedType,
          address: isLegacyRow ? legacyAddress : (row.address || '').trim() || null,
          city: isLegacyRow ? null : (row.city || '').trim() || null,
          province: isLegacyRow ? null : (row.province || '').trim() || null,
          zipCode: isLegacyRow ? legacyZipCode : (row.zipCode || '').trim() || null,
          birthDate: isLegacyRow ? legacyBirthDate : parseDateLike(row.birthDate) || null,
          birthPlace: isLegacyRow ? null : (row.birthPlace || '').trim() || null,
          fiscalCode: isLegacyRow ? legacyFiscalCode : (row.fiscalCode || '').trim() || null,
          notes: isLegacyRow ? (legacyNotes || null) : (row.notes || '').trim() || null,
          tags: isLegacyRow
            ? [pickCsvValue(row, ['CUSTOMER_TYPE']) === '1' ? 'legacy_cliente' : 'legacy_proprietario']
            : (row.tags || '').split('|').map((x) => x.trim()).filter(Boolean),
          source: isLegacyRow ? 'import_csv_legacy' : (row.source || '').trim() || null,
          isActive: isLegacyRow ? String(pickCsvValue(row, ['DATA_DELETED']) || '0').trim() !== '1' : parseBooleanLike(row.isActive, true),
          legacyCustomerId,
          assignedToId,
          agencyId
        };

        let contact: any = null;
        if (lookupId) {
          contact = await prisma.contact.findFirst({ where: { id: lookupId, agencyId } });
        }
        if (!contact && legacyCustomerId) {
          contact = await prisma.contact.findFirst({ where: { agencyId, legacyCustomerId } });
        }
        if (!contact && contactPayload.email) {
          contact = await prisma.contact.findFirst({ where: { agencyId, email: contactPayload.email } });
        }

        if (contact) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: contactPayload
          });
          updated += 1;
          contact = { ...contact, ...contactPayload };
        } else {
          const data: any = { ...contactPayload };
          if (lookupId) data.id = lookupId;
          contact = await prisma.contact.create({ data });
          created += 1;
        }

        const requestTitle = isLegacyRow ? '' : (row.requestTitle || '').trim();
        const legacyRequestContract = inferLegacyContractType(legacyNotes);
        const legacyRequestType = inferLegacyPropertyType(legacyNotes);
        const legacyMinRooms = inferLegacyMinRooms(legacyNotes);
        const legacyMinBathrooms = inferLegacyMinBathrooms(legacyNotes);
        const hasRequestData =
          (isLegacyRow && ['BUYER', 'TENANT'].includes(normalizedType)) ||
          !!requestTitle ||
          !!((isLegacyRow ? legacyNotes : (row.requestDescription || '').trim())) ||
          !!(row.requestMinPrice || '').trim() ||
          !!(row.requestMaxPrice || '').trim() ||
          !!(row.requestMinRooms || '').trim() ||
          !!(row.requestMaxRooms || '').trim();

        if (hasRequestData) {
          const existingReq = await prisma.request.findFirst({
            where: { agencyId, contactId: contact.id },
            orderBy: { createdAt: 'desc' }
          });

          const requestPayload: any = {
            title: requestTitle || `Richiesta per ${contact.firstName} ${contact.lastName}`,
            description: isLegacyRow ? (legacyNotes || null) : (row.requestDescription || '').trim() || null,
            contractType: isLegacyRow ? legacyRequestContract : normalizeContractType(row.requestContractType),
            status: (row.requestStatus || 'ACTIVE').trim() || 'ACTIVE',
            type: isLegacyRow ? legacyRequestType : (row.requestType || 'APARTMENT').trim() || 'APARTMENT',
            apartmentSubtype: isLegacyRow
              ? (legacyRequestType === 'APARTMENT' ? 'APPARTAMENTO' : null)
              : (row.requestApartmentSubtype || '').trim() || null,
            minPrice: parseNumberLike(row.requestMinPrice) ?? null,
            maxPrice: parseNumberLike(row.requestMaxPrice) ?? null,
            minSurface: parseNumberLike(row.requestMinSurface) ?? null,
            maxSurface: parseNumberLike(row.requestMaxSurface) ?? null,
            minRooms: isLegacyRow ? (legacyMinRooms ?? null) : parseIntLike(row.requestMinRooms) ?? null,
            maxRooms: parseIntLike(row.requestMaxRooms) ?? null,
            minBathrooms: isLegacyRow ? (legacyMinBathrooms ?? null) : parseIntLike(row.requestMinBathrooms) ?? null,
            maxBathrooms: parseIntLike(row.requestMaxBathrooms) ?? null,
            minFloor: parseIntLike(row.requestMinFloor) ?? null,
            maxFloor: parseIntLike(row.requestMaxFloor) ?? null,
            cities: (row.requestCities || '').split('|').map((x) => x.trim()).filter(Boolean),
            provinces: (row.requestProvinces || '').split('|').map((x) => x.trim()).filter(Boolean),
            notes: isLegacyRow ? (legacyNotes || null) : (row.requestNotes || '').trim() || null,
            agencyId,
            contactId: contact.id
          };

          if (existingReq) {
            await prisma.request.update({ where: { id: existingReq.id }, data: requestPayload });
          } else {
            await prisma.request.create({ data: requestPayload });
          }
          requestsUpserted += 1;
        }
      } catch (rowError) {
        skipped += 1;
        errors.push(`Riga ${i + 2}: ${String(rowError)}`);
      }
    }

    res.json({
      success: true,
      data: {
        totalRows: rows.length,
        created,
        updated,
        skipped,
        requestsUpserted,
        errors: errors.slice(0, 50)
      },
      message: 'Import CSV completato'
    });
  } catch (error) {
    console.error('Error importing contacts CSV:', error);
    res.status(500).json({ success: false, message: 'Error importing contacts CSV', error: String(error) });
  }
};

app.post('/api/contacts/import.csv', upload.single('file'), importContactsCsvHandler);
app.post('/api/contacts/import', upload.single('file'), importContactsCsvHandler);

app.delete('/api/contacts/bulk-delete', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const category = String(req.query.category || 'CLIENT').trim().toUpperCase();
    const clientTypes = ['BUYER', 'TENANT', 'LEAD'];
    const proprietorTypes = ['SELLER', 'LANDLORD'];
    const targetTypes = category === 'PROPRIETOR' ? proprietorTypes : clientTypes;

    const targetContacts = await prisma.contact.findMany({
      where: { agencyId: auth.agencyId, type: { in: targetTypes } },
      select: { id: true }
    });

    const contactIds = targetContacts.map((contact) => contact.id);
    if (contactIds.length === 0) {
      return res.json({ success: true, data: { deletedContacts: 0 }, message: 'Nessun contatto da eliminare' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.appointment.updateMany({
        where: { agencyId: auth.agencyId, contactId: { in: contactIds } },
        data: { contactId: null }
      });
      await tx.activity.updateMany({
        where: { agencyId: auth.agencyId, contactId: { in: contactIds } },
        data: { contactId: null }
      });
      await tx.contact.deleteMany({
        where: { agencyId: auth.agencyId, id: { in: contactIds } }
      });
    });

    res.json({
      success: true,
      data: { deletedContacts: contactIds.length },
      message: category === 'PROPRIETOR' ? 'Tutti i proprietari sono stati eliminati' : 'Tutti i clienti sono stati eliminati'
    });
  } catch (error) {
    console.error('Error bulk deleting contacts:', error);
    res.status(500).json({ success: false, message: 'Errore durante eliminazione massiva contatti' });
  }
});

app.get('/api/properties/:id/linked-requests', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const property = await prisma.property.findUnique({ where: { id: req.params.id } });
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });
    if (auth.agencyId && property.agencyId !== auth.agencyId) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    if (auth.role === 'AGENT' && property.ownerId !== auth.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const linked = await prisma.propertyMatch.findMany({
      where: { propertyId: property.id },
      include: {
        request: {
          include: {
            contact: true,
            assignedTo: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const mapped = linked.map((item) => {
      const meta: any = (() => {
        try {
          return item.request?.notes ? JSON.parse(String(item.request.notes)) : {};
        } catch {
          return {};
        }
      })();

      return {
        id: item.id,
        requestId: item.requestId,
        contactId: item.request.contactId,
        contactName: `${item.request.contact?.firstName || ''} ${item.request.contact?.lastName || ''}`.trim(),
        contactPhone: item.request.contact?.phone || undefined,
        contactEmail: item.request.contact?.email || undefined,
        agentId: item.request.assignedToId || '',
        agentName: item.request.assignedTo?.name || [item.request.assignedTo?.firstName, item.request.assignedTo?.lastName].filter(Boolean).join(' ') || '',
        notePreset: meta?.notePreset || undefined,
        noteText: meta?.noteText || undefined,
        createdAt: item.createdAt,
        createdByName: meta?.createdByName || undefined
      };
    });

    return res.json({ success: true, data: mapped });
  } catch (error) {
    console.error('Error fetching linked property requests:', error);
    return res.status(500).json({ success: false, message: 'Error fetching linked requests' });
  }
});

app.get('/api/properties/:id/request-report-history', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      select: { id: true, agencyId: true, ownerId: true }
    });
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });
    if (auth.agencyId && property.agencyId !== auth.agencyId) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    if (auth.role === 'AGENT' && property.ownerId !== auth.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const rows = await prisma.activity.findMany({
      where: {
        propertyId: property.id,
        completed: true,
        report: { not: null },
        OR: [{ requestId: { not: null } }, { tags: { has: 'RICHIESTA_COLLEGATA' } }]
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        contact: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        request: { select: { id: true, title: true } }
      },
      orderBy: { completedAt: 'desc' },
      take: 200
    });

    const data = rows
      .filter((row) => typeof row.report === 'string' && row.report.trim().length > 0)
      .map((row) => ({
        id: row.id,
        title: row.title,
        report: String(row.report || '').trim(),
        completedAt: row.completedAt,
        assignedToId: row.assignedToId,
        assignedToName: row.assignedTo
          ? `${row.assignedTo.firstName || ''} ${row.assignedTo.lastName || ''}`.trim() || row.assignedTo.email
          : null,
        requestId: row.requestId || null,
        requestTitle: row.request?.title || null,
        contactId: row.contactId || null,
        contactName: row.contact
          ? `${row.contact.firstName || ''} ${row.contact.lastName || ''}`.trim()
          : null,
        contactPhone: row.contact?.phone || null,
        contactEmail: row.contact?.email || null
      }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching property request report history:', error);
    return res.status(500).json({ success: false, message: 'Error fetching request report history' });
  }
});

app.get('/api/properties/:id/history-events', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      select: { id: true, agencyId: true, ownerId: true }
    });

    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });
    if (auth.agencyId && property.agencyId !== auth.agencyId) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    if (auth.role === 'AGENT' && property.ownerId !== auth.id) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    const rows = await prisma.auditLog.findMany({
      where: {
        entity: 'Property',
        entityId: property.id,
        action: {
          in: ['PROPERTY_APPROVED_AND_PUBLISHED', 'PROPERTY_APPROVED', 'PROPERTY_PUBLISHED']
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    const userIds = Array.from(
      new Set(
        rows
          .map((row) => String(row.userId || '').trim())
          .filter(Boolean)
      )
    );

    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true, role: true }
        })
      : [];

    const usersById = new Map(users.map((u) => [u.id, u]));

    const events = rows.map((row) => {
      const user = row.userId ? usersById.get(String(row.userId)) : null;
      const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
      const byName = fullName || user?.email || row.userEmail || (row.userId ? `Utente ${String(row.userId).slice(0, 6)}` : 'Utente sconosciuto');
      const normalizedAction = String(row.action || '').trim().toUpperCase();
      const type =
        normalizedAction.includes('APPROV') ? 'APPROVAL' :
        normalizedAction.includes('PUBLISH') ? 'PUBLICATION' :
        'SYSTEM';

      return {
        id: row.id,
        type,
        action: row.action,
        at: row.createdAt,
        by: {
          id: user?.id || row.userId || null,
          name: byName,
          email: user?.email || row.userEmail || null,
          role: user?.role || null
        }
      };
    });

    return res.json({ success: true, data: events });
  } catch (error) {
    console.error('Error fetching property history events:', error);
    return res.status(500).json({ success: false, message: 'Error fetching property history events' });
  }
});

app.get('/api/properties/:id/approval-status', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        agencyId: true,
        ownerId: true,
        notes: true,
        isPublished: true,
        publishedAt: true,
        createdAt: true,
        oneClickData: true
      }
    });

    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });
    if (auth.agencyId && property.agencyId !== auth.agencyId) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    if (auth.role === 'AGENT' && property.ownerId !== auth.id) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    const notesText = String(property.notes || '');
    const pendingMatch = Array.from(notesText.matchAll(/\[PENDING_APPROVAL\]\[by:([^\]]+)\]\[at:([^\]]+)\]/g));
    const latestPending = pendingMatch.length > 0 ? pendingMatch[pendingMatch.length - 1] : null;
    const pendingById = latestPending?.[1] ? String(latestPending[1]).trim() : '';
    const pendingAt = latestPending?.[2] ? String(latestPending[2]).trim() : '';

    const oneClickData = property.oneClickData && typeof property.oneClickData === 'object'
      ? (property.oneClickData as any)
      : {};
    const review = oneClickData?.publicationReview && typeof oneClickData.publicationReview === 'object'
      ? oneClickData.publicationReview
      : {};
    const approvedAt = String(review?.approvedAt || review?.reviewedAt || '').trim();
    const approvedById = String(review?.approvedById || '').trim();
    const publishedAt = property.publishedAt ? new Date(property.publishedAt).toISOString() : '';

    const userIds = Array.from(new Set([pendingById, approvedById].filter(Boolean)));
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true }
        })
      : [];
    const usersById = new Map(users.map((u) => [u.id, u]));
    const resolveUserName = (id?: string) => {
      if (!id) return '';
      const user = usersById.get(id);
      if (!user) return '';
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
      return fullName || String(user.email || '').trim();
    };

    const state1Done = Boolean(pendingAt || approvedAt || publishedAt);
    const state2Done = Boolean(approvedAt || publishedAt);
    const state3Done = Boolean(property.isPublished && publishedAt);

    const states = [
      {
        key: 'PENDING_APPROVAL',
        label: 'In fase di approvazione',
        done: state1Done,
        at: pendingAt || '',
        byName: resolveUserName(pendingById),
        byId: pendingById || null
      },
      {
        key: 'APPROVED_PUBLICATION',
        label: 'Approvato in fase di pubblicazione',
        done: state2Done,
        at: approvedAt || '',
        byName: resolveUserName(approvedById),
        byId: approvedById || null
      },
      {
        key: 'PUBLISHED',
        label: 'Pubblicato',
        done: state3Done,
        at: publishedAt || '',
        byName: resolveUserName(approvedById),
        byId: approvedById || null
      }
    ];

    return res.json({
      success: true,
      data: {
        propertyId: property.id,
        currentStatus: state3Done ? 'PUBLISHED' : (state2Done ? 'APPROVED_PUBLICATION' : (state1Done ? 'PENDING_APPROVAL' : 'DRAFT')),
        states
      }
    });
  } catch (error) {
    console.error('Error fetching property approval status:', error);
    return res.status(500).json({ success: false, message: 'Error fetching property approval status' });
  }
});

app.get('/api/properties/:id/cross-calls', async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Deprecated endpoint. Usa /api/matching/for-property/:propertyId'
  });
});

app.post('/api/properties/:id/linked-requests', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const property = await prisma.property.findUnique({ where: { id: req.params.id } });
    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });
    if (auth.agencyId && property.agencyId !== auth.agencyId) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    const {
      contactId,
      agentId,
      notePreset,
      noteText
    } = req.body || {};

    if (!contactId || !agentId) {
      return res.status(400).json({ success: false, message: 'contactId e agentId sono obbligatori' });
    }

    const [contact, agent] = await Promise.all([
      prisma.contact.findUnique({ where: { id: String(contactId) } }),
      prisma.user.findUnique({ where: { id: String(agentId) } })
    ]);

    if (!contact) return res.status(404).json({ success: false, message: 'Contatto non trovato' });
    if (!agent) return res.status(404).json({ success: false, message: 'Agente non trovato' });
    if (auth.agencyId && (contact.agencyId !== auth.agencyId || agent.agencyId !== auth.agencyId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const actorName = [auth.firstName, auth.lastName].filter(Boolean).join(' ').trim() || auth.email || 'Admin';
    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || contact.email || 'Contatto';
    const propertyLabel = property.reference ? `${property.title} (${property.reference})` : property.title;
    const noteSummary = [notePreset ? String(notePreset) : '', noteText ? String(noteText) : '']
      .filter(Boolean)
      .join(' · ');
    const requestMessage = `${actorName} ha assegnato una richiesta per ${propertyLabel} (${contactName})`;
    const now = new Date();
    const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const [adminsSameAgency] = await Promise.all([
      prisma.user.findMany({
        where: {
          agencyId: property.agencyId,
          isActive: true,
          role: { in: ['SUPER_ADMIN', 'AGENCY_ADMIN'] }
        },
        select: { id: true }
      })
    ]);

    const recipients = new Set<string>();
    adminsSameAgency.forEach((adminUser) => recipients.add(adminUser.id));

    const created = await prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          title: `Richiesta collegata immobile ${property.reference || property.id}`,
          description: notePreset ? String(notePreset) : (noteText ? String(noteText) : undefined),
          type: property.type as any,
          contractType: property.contractType as any,
          status: 'ACTIVE',
          cities: property.city ? [property.city] : [],
          provinces: property.province ? [property.province] : [],
          notes: JSON.stringify({
            notePreset: notePreset ? String(notePreset) : undefined,
            noteText: noteText ? String(noteText) : undefined,
            createdByName: actorName,
            linkedPropertyId: property.id
          }),
          agencyId: property.agencyId,
          contactId: contact.id,
          assignedToId: agent.id
        }
      });

      const match = await tx.propertyMatch.create({
        data: {
          propertyId: property.id,
          requestId: request.id,
          score: 100
        }
      });

      const activity = await tx.activity.create({
        data: {
          type: 'TASK',
          title: `Richiesta cliente · ${property.reference || property.id}`,
          description: [
            `Immobile: ${propertyLabel}`,
            `Cliente: ${contactName}`,
            contact.phone ? `Telefono cliente: ${contact.phone}` : null,
            contact.email ? `Email cliente: ${contact.email}` : null,
            noteSummary ? `Nota admin: ${noteSummary}` : null
          ]
            .filter(Boolean)
            .join('\n'),
          dueDate: dueAt,
          priority: 2,
          tags: ['RICHIESTA_COLLEGATA', 'CHIAMATA'],
          agencyId: property.agencyId,
          assignedToId: agent.id,
          contactId: contact.id,
          propertyId: property.id,
          requestId: request.id,
          report: JSON.stringify({
            source: 'LINKED_REQUEST',
            requestId: request.id,
            linkedMatchId: match.id
          })
        }
      });

      const appointment = await tx.appointment.create({
        data: {
          title: `Da chiamare · ${contactName}`,
          description: [
            `Richiesta collegata all'immobile: ${propertyLabel}`,
            contact.phone ? `Telefono: ${contact.phone}` : null,
            contact.email ? `Email: ${contact.email}` : null,
            noteSummary ? `Nota admin: ${noteSummary}` : null
          ]
            .filter(Boolean)
            .join('\n'),
          startTime: now,
          endTime: dueAt,
          location: [property.address, property.city].filter(Boolean).join(', ') || null,
          status: 'SCHEDULED',
          reminder: true,
          reminderSent: false,
          notes: JSON.stringify({
            source: 'LINKED_REQUEST',
            requestId: request.id,
            linkedMatchId: match.id,
            activityId: activity.id
          }),
          agencyId: property.agencyId,
          assignedToId: agent.id,
          contactId: contact.id,
          propertyId: property.id
        }
      });

      if (recipients.size > 0) {
        await tx.notification.createMany({
          data: Array.from(recipients).map((recipientId) => ({
            agencyId: property.agencyId,
            recipientId,
            type: 'REQUEST_LINKED',
            title: 'Nuova richiesta cliente collegata',
            message: requestMessage,
            data: {
              propertyId: property.id,
              propertyTitle: property.title,
              propertyReference: property.reference || null,
              requestId: request.id,
              linkedMatchId: match.id,
              activityId: activity.id,
              appointmentId: appointment.id,
              contactId: contact.id,
              contactName,
              contactPhone: contact.phone || null,
              contactEmail: contact.email || null,
              notePreset: notePreset || null,
              noteText: noteText || null
            }
          }))
        });
      }

      return {
        request,
        match,
        activity,
        appointment
      };
    });

    await createNotificationRecord({
      agencyId: property.agencyId,
      recipientId: agent.id,
      type: 'REQUEST_LINKED',
      title: 'Nuova richiesta da contattare',
      message: `${requestMessage}. Scadenza entro 24 ore.`,
      data: {
        propertyId: property.id,
        propertyTitle: property.title,
        propertyReference: property.reference || null,
        requestId: created.request.id,
        linkedMatchId: created.match.id,
        activityId: created.activity.id,
        appointmentId: created.appointment.id,
        contactId: contact.id,
        contactName,
        contactPhone: contact.phone || null,
        contactEmail: contact.email || null,
        dueAt: dueAt.toISOString()
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Richiesta collegata creata',
      data: {
        id: created.match.id,
        requestId: created.request.id,
        activityId: created.activity.id,
        appointmentId: created.appointment.id
      }
    });
  } catch (error) {
    console.error('Error creating linked property request:', error);
    return res.status(500).json({ success: false, message: 'Error creating linked request' });
  }
});

app.post('/api/properties/:id/approve', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!isAdminRole(auth.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const existing = await prisma.property.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        title: true,
        ownerId: true,
        agencyId: true,
        notes: true,
        oneClickData: true,
        contractType: true,
        description: true,
        ownerFirstName: true,
        ownerLastName: true,
        ownerEmail: true,
        ownerPhone: true,
        images: true
      }
    });

    if (!existing) return res.status(404).json({ success: false, message: 'Property not found' });
    if (auth.agencyId && existing.agencyId !== auth.agencyId) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    if (!hasPendingApprovalTag(existing.notes)) {
      return res.status(400).json({ success: false, message: 'Property is not pending approval' });
    }

    const oneClickData = (existing.oneClickData && typeof existing.oneClickData === 'object')
      ? (existing.oneClickData as any)
      : {};
    const readFlag = (value: any) => String(value || '').trim().toUpperCase() === 'S';
    const MIN_PROPERTY_IMAGES = 7;
    const images = Array.isArray(existing.images) ? existing.images.filter((img: any) => typeof img === 'string' && img.trim()) : [];
    const publishValidationErrors: string[] = [];
    if (!String(existing.title || '').trim()) publishValidationErrors.push('title');
    if (!String(existing.description || '').trim()) publishValidationErrors.push('description');
    if (!String(existing.ownerFirstName || '').trim()) publishValidationErrors.push('ownerFirstName');
    if (!String(existing.ownerLastName || '').trim()) publishValidationErrors.push('ownerLastName');
    if (!String(existing.ownerEmail || '').trim()) publishValidationErrors.push('ownerEmail');
    if (!String(existing.ownerPhone || '').trim()) publishValidationErrors.push('ownerPhone');
    if (images.length < MIN_PROPERTY_IMAGES) publishValidationErrors.push(`images(min:${MIN_PROPERTY_IMAGES})`);
    if (!readFlag(oneClickData?.doc_planimetria)) publishValidationErrors.push('doc_planimetria');
    if (!readFlag(oneClickData?.doc_visura)) publishValidationErrors.push('doc_visura');
    if (String(existing.contractType || '').trim().toUpperCase() === 'RENT' && !String(oneClickData?.contratto_affitto || '').trim()) {
      publishValidationErrors.push('contratto_affitto');
    }
    if (publishValidationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required property fields: ${publishValidationErrors.join(', ')}`
      });
    }

    const cleanedNotes = clearPendingApprovalTag(existing.notes);
    const approvalStamp = `[APPROVED_BY_ADMIN][by:${auth.id}][at:${new Date().toISOString()}]`;
    const nextNotes = cleanedNotes ? `${cleanedNotes}\n${approvalStamp}` : approvalStamp;

    const existingOneClickData = (existing.oneClickData && typeof existing.oneClickData === 'object')
      ? (existing.oneClickData as any)
      : {};
    const existingReview = sanitizePublicationReviewPayload(existingOneClickData.publicationReview);
    const nextReview = {
      ...(existingReview || { hiddenFields: [], adminNote: '' }),
      reviewedAt: new Date().toISOString(),
      reviewedByRole: auth.role || 'AGENCY_ADMIN',
      approvedAt: new Date().toISOString(),
      approvedById: auth.id
    };

    const updated = await prisma.property.update({
      where: { id: req.params.id },
      data: {
        notes: nextNotes,
        isPublished: true,
        publishedAt: new Date(),
        oneClickData: {
          ...existingOneClickData,
          publicationReview: nextReview
        }
      }
    });

    try {
      await writeAuditLog(
        'PROPERTY_APPROVED_AND_PUBLISHED',
        'Property',
        String(updated.id),
        auth.id,
        req.ip,
        auth.email || null,
        req.get('user-agent') || null,
        {
          isPublished: { before: false, after: true },
          approvedById: auth.id
        } as any
      );
    } catch (auditError) {
      console.error('Error writing property approval audit log:', auditError);
    }

    await createNotificationRecord({
      agencyId: updated.agencyId,
      recipientId: updated.ownerId,
      type: 'PROPERTY_APPROVED',
      title: 'Immobile approvato',
      message: `${updated.title} è stato approvato e pubblicato`,
      data: {
        propertyId: updated.id,
        status: 'APPROVED'
      }
    });

    return res.json({
      success: true,
      data: updated,
      message: 'Property approved and published'
    });
  } catch (error) {
    console.error('Error approving property:', error);
    return res.status(500).json({ success: false, message: 'Error approving property' });
  }
});

app.get('/api/contacts/:id/properties', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const contact = await prisma.contact.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        agencyId: true,
        assignedToId: true
      }
    });

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    if (auth.agencyId && contact.agencyId !== auth.agencyId) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    if (auth.role === 'AGENT' && contact.assignedToId && contact.assignedToId !== auth.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const ownerEmail = contact.email ? contact.email.trim() : '';
    const ownerPhone = contact.phone ? contact.phone.trim() : '';
    const ownerFirstName = contact.firstName.trim();
    const ownerLastName = contact.lastName.trim();

    const where: any = {
      agencyId: contact.agencyId,
      OR: [] as any[]
    };

    if (ownerEmail) {
      where.OR.push({ ownerEmail: ownerEmail });
    }
    if (ownerPhone) {
      where.OR.push({ ownerPhone: ownerPhone });
    }
    if (ownerFirstName || ownerLastName) {
      where.OR.push({
        AND: [
          ownerFirstName ? { ownerFirstName: ownerFirstName } : {},
          ownerLastName ? { ownerLastName: ownerLastName } : {}
        ]
      });
    }

    if (where.OR.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const properties = await prisma.property.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: properties });
  } catch (error) {
    console.error('Error fetching owner properties:', error);
    res.status(500).json({ success: false, message: 'Error fetching properties' });
  }
});

app.post('/api/contacts/:id/documents', upload.single('file'), async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const contact = await prisma.contact.findUnique({
      where: { id: req.params.id },
      select: { id: true, agencyId: true, assignedToId: true }
    });

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    if (auth.agencyId && contact.agencyId !== auth.agencyId) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    if (auth.role === 'AGENT' && contact.assignedToId && contact.assignedToId !== auth.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const file: any = (req as any).file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'File is required' });
    }

    const type = typeof req.body.type === 'string' ? req.body.type.trim() : '';
    const side = typeof req.body.side === 'string' ? req.body.side.trim() : '';

    if (!type) {
      return res.status(400).json({ success: false, message: 'Document type is required' });
    }

    const fileKey = `${contact.id}/${Date.now()}_${file.originalname}`;

    await storagePutObject(OWNER_DOCUMENTS_BUCKET, fileKey, file.buffer, file.size, file.mimetype);

    const document = await prisma.ownerDocument.create({
      data: {
        contactId: contact.id,
        type,
        side: side || null,
        fileKey
      }
    });

    res.status(201).json({ success: true, data: document, message: 'Document uploaded successfully' });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ success: false, message: 'Error uploading document' });
  }
});

app.delete('/api/contacts/:id/documents/:documentId', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const contact = await prisma.contact.findUnique({
      where: { id: req.params.id },
      select: { id: true, agencyId: true, assignedToId: true }
    });

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    if (auth.agencyId && contact.agencyId !== auth.agencyId) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    if (auth.role === 'AGENT' && contact.assignedToId !== auth.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const document = await prisma.ownerDocument.findUnique({
      where: { id: req.params.documentId }
    });

    if (!document || document.contactId !== contact.id) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    await storageRemoveObject(OWNER_DOCUMENTS_BUCKET, document.fileKey);

    await prisma.ownerDocument.delete({
      where: { id: document.id }
    });

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ success: false, message: 'Error deleting document' });
  }
});

app.post('/api/contacts', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const data = req.body;
    let agencyId = data.agencyId;

    if (auth.role === 'AGENT') {
      const assignedToIdCandidate = data?.assignedToId != null ? String(data.assignedToId).trim() : '';
      const assignedAgentCandidate = data?.assignedAgent != null ? String(data.assignedAgent).trim() : '';
      if ((assignedToIdCandidate && assignedToIdCandidate !== auth.id) || (assignedAgentCandidate && assignedAgentCandidate !== auth.id)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      agencyId = auth.agencyId;
      data.assignedToId = auth.id;
      data.assignedAgent = auth.id;
    } else if (auth.agencyId && auth.role !== 'SUPER_ADMIN') {
      agencyId = auth.agencyId;
    }

    if (!agencyId) {
      const agency = await prisma.agency.findFirst();
      agencyId = agency?.id;
    }

    if (!agencyId) {
       return res.status(400).json({ success: false, message: 'Missing agencyId' });
    }

    const contactType = parseOptionalString(data.type)?.toUpperCase();
    const isRequestEligibleType =
      contactType === 'BUYER' || contactType === 'TENANT' || contactType === 'LEAD';

    if (isRequestEligibleType) {
      const firstName = parseOptionalString(data.firstName);
      const lastName = parseOptionalString(data.lastName);
      const email = parseOptionalString(data.email);
      const phone = parseOptionalString(data.phone);
      const city = parseOptionalString(data.city);
      const province = parseOptionalString(data.province);
      const address = parseOptionalString(data.address);
      const birthDate = parseOptionalString(data.birthDate);
      const birthPlace = parseOptionalString(data.birthPlace);
      const requestGoal = parseOptionalString(data.requestGoal)?.toUpperCase();
      const requestPropertyTypeRaw = parseOptionalString(data.requestPropertyType);
      const requestPropertyType = mapRequestPropertyType(requestPropertyTypeRaw);
      const requestZone = parseOptionalString(data.requestZone);
      const requestApartmentType = parseOptionalString(data.requestApartmentType);
      const requestSurfaceSqm = parseOptionalNumber(data.requestSurfaceSqm);
      const rentContractSubtype = parseOptionalString(data.rentContractSubtype);
      const budget = parseOptionalNumber(data.budget);
      const requestCondition = parseOptionalString(data.requestCondition);
      const requestBathrooms = parseOptionalNumber(data.requestBathrooms);
      const requestBedrooms = parseOptionalNumber(data.requestBedrooms);
      const requestFloor = parseOptionalNumber(data.requestFloor);
      const requestCommercialRooms = parseOptionalNumber(data.requestCommercialRooms);
      const requestParkingSpots = parseOptionalNumber(data.requestParkingSpots);
      const requestShopWindows = parseOptionalNumber(data.requestShopWindows);
      const requestLandUse = parseOptionalString(data.requestLandUse);
      const requestBuildable = parseOptionalString(data.requestBuildable);
      const requestGarageType = parseOptionalString(data.requestGarageType);
      const notes = parseOptionalString(data.notes);

      const validationErrors: string[] = [];

      if (!firstName || !lastName) validationErrors.push('Nome e cognome sono obbligatori');
      if (!email || !phone) validationErrors.push('Per il cliente email e telefono sono obbligatori');
      if (!city || !province) validationErrors.push('Per il cliente città e provincia sono obbligatorie');
      if (!address) validationErrors.push('Per il cliente indirizzo obbligatorio');
      // data/luogo di nascita: dati anagrafici opzionali in fase di richiesta,
      // si completano in seguito. Il form non li impone, quindi non bloccano.
      if (!requestGoal) validationErrors.push('Seleziona la finalità della richiesta');
      if (!requestPropertyTypeRaw || !requestPropertyType) {
        validationErrors.push('Seleziona la tipologia immobile richiesta');
      }
      if (!requestZone) validationErrors.push('Inserisci la zona richiesta');
      if (budget == null || budget <= 0) validationErrors.push('Inserisci il budget richiesto');
      if (!notes) validationErrors.push('Inserisci le note richiesta');

      const isApartmentRequest = requestPropertyType === 'APARTMENT';
      const isCommercialRequest = requestPropertyType === 'SHOP' || requestPropertyType === 'OFFICE';
      const isWarehouseRequest = requestPropertyType === 'WAREHOUSE';
      const isLandRequest = requestPropertyType === 'LAND';
      const isGarageRequest = requestPropertyType === 'GARAGE';
      const isShopLikeRequest = requestPropertyType === 'SHOP';
      // tipologia appartamento: sotto-tipo opzionale, il form non lo impone.
      if (!isApartmentRequest && requestSurfaceSqm == null) {
        validationErrors.push('Inserisci i mq richiesti');
      }
      // Dettagli residenziali (camere, bagni, piano, stato immobile) opzionali:
      // il form li propone come facoltativi, non bloccano la creazione.
      if (isCommercialRequest) {
        if (requestBathrooms == null || requestBathrooms <= 0) validationErrors.push('Inserisci il numero bagni richiesti');
        if (requestCommercialRooms == null || requestCommercialRooms <= 0) validationErrors.push('Inserisci il numero locali richiesti');
        if (requestParkingSpots == null || requestParkingSpots <= 0) validationErrors.push('Inserisci i posti auto richiesti');
        if (isShopLikeRequest && (requestShopWindows == null || requestShopWindows <= 0)) validationErrors.push('Inserisci il numero vetrine richieste');
        if (!requestCondition) validationErrors.push('Seleziona lo stato immobile richiesto');
      }
      if (isWarehouseRequest && (requestParkingSpots == null || requestParkingSpots <= 0)) {
        validationErrors.push('Inserisci i posti auto richiesti');
      }
      if (isLandRequest && !requestLandUse) validationErrors.push('Inserisci uso terreno');
      if (isLandRequest && !requestBuildable) validationErrors.push('Indica se il terreno è edificabile');
      if (isGarageRequest && !requestGarageType) validationErrors.push('Seleziona il tipo box richiesto');
      if (requestGoal === 'RENT' && !rentContractSubtype) {
        validationErrors.push("Seleziona il tipo contratto per l'affitto");
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validazione Nuovo Cliente fallita',
          errors: validationErrors
        });
      }
    }

    const contactData = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      type: data.type,
      // category field removed as it is not in Prisma schema
      city: data.city,
      province: data.province,
      address: data.address,
      zipCode: data.zipCode,
      birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
      birthPlace: data.birthPlace,
      fiscalCode: data.fiscalCode,
      // budget field removed as it is not in Prisma schema
      // preferences field removed as it is not in Prisma schema
      notes: data.notes,
      tags: data.tags,
      isActive: data.isActive,
      
      // Mapped or optional fields
      assignedToId: (data.assignedAgent && data.assignedAgent !== "") 
        ? data.assignedAgent 
        : (data.assignedToId && data.assignedToId !== "") 
          ? data.assignedToId 
          : undefined,
      source: data.source,
      
      agencyId
    };

    // Remove undefined keys
    Object.keys(contactData).forEach(key => (contactData as any)[key] === undefined && delete (contactData as any)[key]);

    const newContact = await prisma.contact.create({
      data: contactData
    });

    const hasRequestDetails =
      (data.requestApartmentType && String(data.requestApartmentType).trim() !== '') ||
      (typeof data.requestBedrooms === 'number' && !Number.isNaN(data.requestBedrooms)) ||
      (typeof data.requestBathrooms === 'number' && !Number.isNaN(data.requestBathrooms)) ||
      (typeof data.requestFloor === 'number' && !Number.isNaN(data.requestFloor)) ||
      (parseOptionalString(data.requestGoal) !== undefined) ||
      (parseOptionalString(data.requestPropertyType) !== undefined) ||
      (parseOptionalString(data.requestZone) !== undefined) ||
      (parseOptionalNumber(data.requestSurfaceSqm) !== undefined) ||
      (parseOptionalString(data.rentContractSubtype) !== undefined);

    let request: any = null;

    if ((hasRequestDetails || isRequestEligibleType) && isRequestEligibleType) {
      const fallbackContractType = data.type === 'TENANT' ? 'RENT' : 'SALE';
      const requestGoal = parseOptionalString(data.requestGoal)?.toUpperCase();
      const contractType = mapRequestGoalToContract(requestGoal, fallbackContractType as 'SALE' | 'RENT');
      const requestPropertyType = mapRequestPropertyType(data.requestPropertyType) || 'APARTMENT';
      const requestSurfaceSqm = parseOptionalNumber(data.requestSurfaceSqm);
      const apartmentSubtype =
        requestPropertyType === 'APARTMENT'
          ? parseOptionalString(data.requestApartmentType)
          : undefined;
      const minRooms = parseOptionalNumber(data.requestBedrooms);
      const minBathrooms = parseOptionalNumber(data.requestBathrooms);
      const minFloor = parseOptionalNumber(data.requestFloor);
      const maxPrice = parseOptionalNumber(data.budget);
      const requestMetaNotes = encodeRequestNotesWithMeta(data.notes, {
        [REQUEST_META_KEYS.goal]: requestGoal,
        [REQUEST_META_KEYS.zone]: parseOptionalString(data.requestZone),
        [REQUEST_META_KEYS.rentSubtype]: parseOptionalString(data.rentContractSubtype)
      });

      const cities = data.city ? [String(data.city)] : [];
      const provinces = data.province ? [String(data.province)] : [];

      const requestData: any = {
        title: `Richiesta per ${newContact.firstName} ${newContact.lastName}`,
        description: data.preferences || data.notes || undefined,
        type: requestPropertyType,
        contractType,
        status: 'ACTIVE',
        minRooms,
        maxRooms: minRooms,
        minBathrooms,
        maxBathrooms: minBathrooms,
        minFloor,
        maxFloor: minFloor,
        minSurface: requestSurfaceSqm,
        maxSurface: requestSurfaceSqm,
        minPrice: maxPrice,
        maxPrice,
        apartmentSubtype,
        cities,
        provinces,
        priority: 1,
        notes: requestMetaNotes,
        agencyId,
        contactId: newContact.id
      };

      request = await prisma.request.create({
        data: requestData
      });
    }

    const responseContact = request
      ? normalizeRequestFlatResponse({ ...newContact, requests: [request] })
      : newContact;

    res.status(201).json({
      success: true,
      data: responseContact,
      message: 'Contact created successfully'
    });
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ success: false, message: 'Error creating contact', error: String(error) });
  }
});

app.put('/api/contacts/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const existing = await prisma.contact.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        assignedToId: true,
        agencyId: true,
        type: true,
        firstName: true,
        lastName: true,
        requests: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Contact not found' });
    if (auth.agencyId && existing.agencyId !== auth.agencyId) return res.status(404).json({ success: false, message: 'Contact not found' });
    if (auth.role === 'AGENT' && existing.assignedToId && existing.assignedToId !== auth.id) return res.status(403).json({ success: false, message: 'Forbidden' });

    const data = req.body;

    if (auth.role === 'AGENT') {
      const assignedToIdCandidate = data?.assignedToId != null ? String(data.assignedToId).trim() : '';
      const assignedAgentCandidate = data?.assignedAgent != null ? String(data.assignedAgent).trim() : '';
      if ((assignedToIdCandidate && assignedToIdCandidate !== auth.id) || (assignedAgentCandidate && assignedAgentCandidate !== auth.id)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }
    
    const contactData: any = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      type: data.type,
      city: data.city,
      address: data.address,
      province: data.province,
      zipCode: data.zipCode,
      birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
      birthPlace: data.birthPlace,
      fiscalCode: data.fiscalCode,
      notes: data.notes,
      tags: data.tags,
      isActive: data.isActive,
      
      assignedToId: auth.role === 'AGENT'
        ? auth.id
        : (data.assignedAgent && data.assignedAgent !== "") 
          ? data.assignedAgent 
          : (data.assignedToId && data.assignedToId !== "") 
            ? data.assignedToId 
            : undefined,
      source: data.source,
    };

    // Remove undefined keys
    Object.keys(contactData).forEach(key => (contactData as any)[key] === undefined && delete (contactData as any)[key]);

    const updatedContact = await prisma.contact.update({
      where: { id: req.params.id },
      data: contactData
    });

    const requestInputPresent =
      data.requestApartmentType !== undefined ||
      data.requestBedrooms !== undefined ||
      data.requestBathrooms !== undefined ||
      data.requestFloor !== undefined ||
      data.budget !== undefined ||
      data.preferences !== undefined ||
      data.requestGoal !== undefined ||
      data.requestPropertyType !== undefined ||
      data.requestZone !== undefined ||
      data.requestSurfaceSqm !== undefined ||
      data.rentContractSubtype !== undefined;

    const effectiveType = (parseOptionalString(data.type) || existing.type).toUpperCase();
    const isRequestEligibleType =
      effectiveType === 'BUYER' || effectiveType === 'TENANT' || effectiveType === 'LEAD';

    const currentRequest = existing.requests?.[0] || null;
    let savedRequest = currentRequest;

    if (isRequestEligibleType && (requestInputPresent || currentRequest)) {
      const currentMeta = readRequestMetaFromNotes(currentRequest?.notes);
      const requestGoal =
        parseOptionalString(data.requestGoal)?.toUpperCase() ||
        resolveRequestGoal(currentRequest, currentMeta.meta);
      const fallbackContractType = effectiveType === 'TENANT' ? 'RENT' : 'SALE';
      const contractType = mapRequestGoalToContract(requestGoal, fallbackContractType as 'SALE' | 'RENT');
      const requestPropertyType =
        mapRequestPropertyType(data.requestPropertyType) ||
        currentRequest?.type ||
        'APARTMENT';
      const requestSurfaceSqm = parseOptionalNumber(data.requestSurfaceSqm);
      const minRooms = parseOptionalNumber(data.requestBedrooms);
      const minBathrooms = parseOptionalNumber(data.requestBathrooms);
      const minFloor = parseOptionalNumber(data.requestFloor);
      const budget = parseOptionalNumber(data.budget);
      const mergedNotes = encodeRequestNotesWithMeta(
        parseOptionalString(data.notes) ?? currentMeta.cleanedNotes,
        {
          [REQUEST_META_KEYS.goal]: requestGoal,
          [REQUEST_META_KEYS.zone]:
            parseOptionalString(data.requestZone) ?? parseOptionalString(currentMeta.meta[REQUEST_META_KEYS.zone]),
          [REQUEST_META_KEYS.rentSubtype]:
            parseOptionalString(data.rentContractSubtype) ??
            parseOptionalString(currentMeta.meta[REQUEST_META_KEYS.rentSubtype])
        }
      );

      const requestData: any = {
        title: currentRequest?.title || `Richiesta per ${updatedContact.firstName} ${updatedContact.lastName}`,
        description:
          parseOptionalString(data.preferences) ??
          currentRequest?.description ??
          parseOptionalString(data.notes),
        type: requestPropertyType,
        contractType,
        status: currentRequest?.status || 'ACTIVE',
        minRooms: minRooms ?? currentRequest?.minRooms ?? undefined,
        maxRooms: minRooms ?? currentRequest?.maxRooms ?? undefined,
        minBathrooms: minBathrooms ?? currentRequest?.minBathrooms ?? undefined,
        maxBathrooms: minBathrooms ?? currentRequest?.maxBathrooms ?? undefined,
        minFloor: minFloor ?? currentRequest?.minFloor ?? undefined,
        maxFloor: minFloor ?? currentRequest?.maxFloor ?? undefined,
        minSurface: requestSurfaceSqm ?? currentRequest?.minSurface ?? undefined,
        maxSurface: requestSurfaceSqm ?? currentRequest?.maxSurface ?? undefined,
        minPrice: budget ?? currentRequest?.minPrice ?? undefined,
        maxPrice: budget ?? currentRequest?.maxPrice ?? undefined,
        apartmentSubtype:
          requestPropertyType === 'APARTMENT'
            ? parseOptionalString(data.requestApartmentType) ?? currentRequest?.apartmentSubtype ?? undefined
            : undefined,
        cities:
          parseOptionalString(data.city) !== undefined
            ? [String(data.city)]
            : Array.isArray(currentRequest?.cities)
              ? currentRequest.cities
              : [],
        provinces:
          parseOptionalString(data.province) !== undefined
            ? [String(data.province)]
            : Array.isArray(currentRequest?.provinces)
              ? currentRequest.provinces
              : [],
        priority: currentRequest?.priority || 1,
        notes: mergedNotes,
        agencyId: existing.agencyId,
        contactId: updatedContact.id
      };

      if (currentRequest?.id) {
        savedRequest = await prisma.request.update({
          where: { id: currentRequest.id },
          data: requestData
        });
      } else {
        savedRequest = await prisma.request.create({
          data: requestData
        });
      }
    }

    res.json({
      success: true,
      data: savedRequest
        ? normalizeRequestFlatResponse({ ...updatedContact, requests: [savedRequest] })
        : updatedContact,
      message: 'Contact updated successfully'
    });
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ success: false, message: 'Error updating contact', error: String(error) });
  }
});

app.delete('/api/contacts/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const existing = await prisma.contact.findUnique({ where: { id: req.params.id }, select: { id: true, assignedToId: true, agencyId: true } });
    if (!existing) return res.status(404).json({ success: false, message: 'Contact not found' });
    if (auth.agencyId && existing.agencyId !== auth.agencyId) return res.status(404).json({ success: false, message: 'Contact not found' });
    if (auth.role === 'AGENT' && existing.assignedToId && existing.assignedToId !== auth.id) return res.status(403).json({ success: false, message: 'Forbidden' });

    const deletedContact = await prisma.contact.delete({
      where: { id: req.params.id }
    });

    res.json({
      success: true,
      data: deletedContact,
      message: 'Contact deleted successfully'
    });
  } catch (error) {
    res.status(404).json({ success: false, message: 'Contact not found' });
  }
});

const appointmentParticipantSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  isActive: true
};

const uniqueStringList = (values: any[]): string[] => Array.from(
  new Set(values.map((id) => String(id || '').trim()).filter(Boolean))
);

const readAppointmentParticipantIdsFromBody = (data: any): string[] => {
  const listFields = ['selectedAgentIds', 'participantIds', 'assignedAgents', 'assignedToIds'];
  const listValues = listFields.flatMap((field) => Array.isArray(data?.[field]) ? data[field] : []);
  const fallbackValues = [data?.selectedAgentId, data?.assignedToId];
  return uniqueStringList([...listValues, ...fallbackValues]);
};

const getAppointmentParticipantIds = (appointment: any): string[] => {
  const participantIds = Array.isArray(appointment?.participantIds) ? appointment.participantIds : [];
  return uniqueStringList([...participantIds, appointment?.assignedToId]);
};

const mapAppointmentForResponse = (appointment: any, participantsById: Map<string, any>) => {
  const participantIds = getAppointmentParticipantIds(appointment);
  const participants = participantIds
    .map((id) => participantsById.get(id))
    .filter(Boolean)
    .map((user) => ({
      ...user,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Agente'
    }));

  return {
    ...appointment,
    participantIds,
    assignedAgents: participantIds,
    participants,
    createdById: appointment.createdById || undefined,
    contactName: appointment.contact ? `${appointment.contact.firstName} ${appointment.contact.lastName}` : undefined,
    propertyTitle: appointment.property?.title
  };
};

const canManageAppointment = (auth: any, appointment: any): boolean => {
  if (isAdminRole(auth?.role)) return true;
  if (!auth?.id || !appointment) return false;
  const authId = String(auth.id);
  const participantIds = getAppointmentParticipantIds(appointment);
  if (participantIds.includes(authId)) return true;
  if (appointment.createdById) return appointment.createdById === auth.id;
  return appointment.assignedToId === auth.id;
};

// Appointments endpoints
app.get('/api/appointments', async (req, res) => {
  const { page = 1, limit = 10, date, startDate, endDate, status, contactId, propertyId } = req.query;

  try {
    const where: any = {};

    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (auth.agencyId) where.agencyId = auth.agencyId;
    if (!isAdminRole(auth.role)) {
      where.OR = [
        { assignedToId: auth.id },
        { participantIds: { has: auth.id } },
        { createdById: auth.id }
      ];
    } else if (req.query.assignedToId) {
      const assignedToId = req.query.assignedToId.toString();
      where.OR = [
        { assignedToId },
        { participantIds: { has: assignedToId } }
      ];
    }

    if (startDate && endDate) {
      const start = new Date(String(startDate));
      const end = new Date(String(endDate));
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        where.startTime = {
          gte: start,
          lte: end
        };
      }
    } else if (date) {
      // Simple date filtering (matches the whole day)
      const startDate = new Date(date.toString());
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      
      where.startTime = {
        gte: startDate,
        lt: endDate
      };
    }

    if (status) where.status = status;
    if (contactId) where.contactId = contactId;
    if (propertyId) where.propertyId = propertyId;

    const [total, appointments] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        include: {
           assignedTo: { select: appointmentParticipantSelect },
           contact: { select: { firstName: true, lastName: true } },
           property: { select: { title: true } }
        },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { startTime: 'desc' }
      })
    ]);

    const participantIds = uniqueStringList(appointments.flatMap(getAppointmentParticipantIds));
    const participantUsers = participantIds.length
      ? await prisma.user.findMany({
          where: { id: { in: participantIds } },
          select: appointmentParticipantSelect
        })
      : [];
    const participantsById = new Map(participantUsers.map((user) => [user.id, user]));

    // Map to flatten contactName/propertyTitle and expose multi-agent participants for frontend compatibility.
    const mappedAppointments = appointments.map(app => mapAppointmentForResponse(app, participantsById));

    res.json({
      success: true,
      data: mappedAppointments,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching appointments' });
  }
});

app.post('/api/appointments', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const data = req.body;
    let agencyId = data.agencyId;

    if (auth.agencyId && auth.role !== 'SUPER_ADMIN') {
      agencyId = auth.agencyId;
    }

    if (!agencyId) {
      const agency = await prisma.agency.findFirst();
      agencyId = agency?.id;
    }

    let assignedToIds = readAppointmentParticipantIdsFromBody(data);

    // Agenti/collaboratori possono coinvolgere altri utenti, ma restano sempre partecipanti del proprio appuntamento.
    if (!isAdminRole(auth.role)) {
      assignedToIds = uniqueStringList([...assignedToIds, auth.id]);
    }

    // For admin users, assignment is required.
    if (isAdminRole(auth.role) && assignedToIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one assignedToId is required for appointment creation'
      });
    }

    // Ensure at least one assignee is present for non-admin fallbacks.
    if (!assignedToIds.length) {
      const user = await prisma.user.findFirst({
        where: auth.agencyId ? { agencyId: auth.agencyId } : undefined,
        select: { id: true }
      });
      if (user?.id) assignedToIds = [user.id];
    }

    if (auth.agencyId && assignedToIds.length) {
      const assignedUsers = await prisma.user.findMany({
        where: { id: { in: assignedToIds } },
        select: { id: true, agencyId: true }
      });
      const validAssigneeIds = new Set(
        assignedUsers
          .filter((user) => user.agencyId === auth.agencyId)
          .map((user) => user.id)
      );
      const invalidAssignees = assignedToIds.filter((id) => !validAssigneeIds.has(id));
      if (invalidAssignees.length > 0) {
        return res.status(400).json({ success: false, message: 'Invalid assignedToId' });
      }
    }

    // Prepare common valid data for Prisma
    const appointmentDataBase: any = {
      title: data.title,
      description: data.description,
      startTime: data.startTime ? new Date(data.startTime) : new Date(),
      endTime: data.endTime ? new Date(data.endTime) : new Date(),
      location: data.location,
      status: data.status || 'SCHEDULED',
      notes: data.notes,
      agencyId: agencyId
    };

    if (auth.agencyId && data.contactId && String(data.contactId).trim() !== '') {
      const contact = await prisma.contact.findUnique({
        where: { id: String(data.contactId) },
        select: { agencyId: true, assignedToId: true }
      });
      if (!contact || contact.agencyId !== auth.agencyId) {
        return res.status(400).json({ success: false, message: 'Invalid contactId' });
      }
    }

    if (auth.agencyId && data.propertyId && String(data.propertyId).trim() !== '') {
      const property = await prisma.property.findUnique({
        where: { id: String(data.propertyId) },
        select: { agencyId: true, ownerId: true }
      });
      if (!property || property.agencyId !== auth.agencyId) {
        return res.status(400).json({ success: false, message: 'Invalid propertyId' });
      }
    }

    // Validate status enum
    const validStatuses = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
    if (!validStatuses.includes(appointmentDataBase.status)) {
      appointmentDataBase.status = 'SCHEDULED';
    }

    const appointmentData: any = {
      ...appointmentDataBase,
      assignedToId: assignedToIds[0],
      participantIds: assignedToIds,
      createdById: auth.id
    };
    if (data.contactId && String(data.contactId).trim() !== '') {
      appointmentData.contactId = String(data.contactId).trim();
    }
    if (data.propertyId && String(data.propertyId).trim() !== '') {
      appointmentData.propertyId = String(data.propertyId).trim();
    }

    const newAppointment = await prisma.appointment.create({
      data: appointmentData,
      include: {
        assignedTo: { select: appointmentParticipantSelect },
        contact: { select: { firstName: true, lastName: true } },
        property: { select: { title: true } }
      }
    });

    let autoActivityId: string | undefined;
    try {
      const activityDescriptionLines: string[] = [];
      if (data.description) {
        activityDescriptionLines.push(String(data.description));
      }
      const startTimeFormatted = newAppointment.startTime.toISOString();
      const locationText = data.location ? String(data.location) : 'Non specificato';
      activityDescriptionLines.push('');
      activityDescriptionLines.push('Dettagli Appuntamento:');
      activityDescriptionLines.push(`- Luogo: ${locationText}`);
      activityDescriptionLines.push(`- Data/Ora: ${startTimeFormatted}`);
      const activityDescription = activityDescriptionLines.join('\n');

      const autoActivity = await prisma.activity.create({
        data: {
          type: 'TASK',
          title: `Task: ${newAppointment.title}`,
          description: activityDescription,
          completed: false,
          dueDate: newAppointment.startTime,
          priority: 2,
          tags: ['AUTO-GENERATED', 'CALENDAR'],
          agencyId: newAppointment.agencyId,
          assignedToId: newAppointment.assignedToId,
          contactId: newAppointment.contactId || undefined,
          propertyId: newAppointment.propertyId || undefined
        }
      });
      autoActivityId = autoActivity.id;
    } catch (activityError) {
      console.error('Error creating automatic activity for appointment:', activityError);
    }

    for (const recipientId of assignedToIds) {
      await createNotificationRecord({
        agencyId: newAppointment.agencyId,
        recipientId,
        type: 'APPOINTMENT_CREATED',
        title: 'Nuovo appuntamento assegnato',
        message: newAppointment.title,
        data: {
          appointmentId: newAppointment.id,
          activityId: autoActivityId
        }
      });
    }

    const participantUsers = await prisma.user.findMany({
      where: { id: { in: assignedToIds } },
      select: appointmentParticipantSelect
    });
    const participantsById = new Map(participantUsers.map((user) => [user.id, user]));

    res.status(201).json({
      success: true,
      data: mapAppointmentForResponse(newAppointment, participantsById),
      message: 'Appointment created successfully'
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ success: false, message: 'Error creating appointment' });
  }
});

app.get('/api/push/public-key', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!WEB_PUSH_VAPID_PUBLIC_KEY) {
      return res.status(503).json({ success: false, message: 'Push key not configured' });
    }
    res.json({ success: true, data: { publicKey: WEB_PUSH_VAPID_PUBLIC_KEY } });
  } catch (error) {
    console.error('Error reading push public key:', error);
    res.status(500).json({ success: false, message: 'Error reading push public key' });
  }
});

app.post('/api/push/subscribe', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!WEB_PUSH_VAPID_PUBLIC_KEY || !WEB_PUSH_VAPID_PRIVATE_KEY) {
      return res.status(503).json({ success: false, message: 'Push not configured' });
    }

    const subscription = req.body?.subscription;
    const endpoint = subscription?.endpoint;
    if (!endpoint) {
      return res.status(400).json({ success: false, message: 'Missing push subscription endpoint' });
    }

    let agencyId = auth.agencyId || null;
    if (!agencyId) {
      const userAgency = await prisma.user.findUnique({
        where: { id: auth.id },
        select: { agencyId: true }
      });
      agencyId = userAgency?.agencyId || null;
    }
    if (!agencyId) {
      return res.status(400).json({ success: false, message: 'Missing agencyId' });
    }

    const existingRows = await prisma.notification.findMany({
      where: {
        agencyId,
        recipientId: auth.id,
        type: WEB_PUSH_SUBSCRIPTION_TYPE
      }
    });

    const alreadyExists = existingRows.some(
      row => ((row.data as any)?.subscription?.endpoint || '') === endpoint
    );

    if (!alreadyExists) {
      await prisma.notification.create({
        data: {
          agencyId,
          recipientId: auth.id,
          type: WEB_PUSH_SUBSCRIPTION_TYPE,
          title: 'Push Subscription',
          message: '',
          isRead: true,
          data: {
            endpoint,
            subscription,
            userAgent: req.headers['user-agent'] || '',
            subscribedAt: new Date().toISOString()
          }
        }
      });
    }

    res.json({ success: true, message: 'Push subscription saved' });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ success: false, message: 'Error saving push subscription' });
  }
});

app.post('/api/push/unsubscribe', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const endpoint = String(req.body?.endpoint || '').trim();
    if (!endpoint) return res.status(400).json({ success: false, message: 'Missing endpoint' });

    let agencyId = auth.agencyId || null;
    if (!agencyId) {
      const userAgency = await prisma.user.findUnique({
        where: { id: auth.id },
        select: { agencyId: true }
      });
      agencyId = userAgency?.agencyId || null;
    }

    const rows = await prisma.notification.findMany({
      where: {
        agencyId: agencyId || undefined,
        recipientId: auth.id,
        type: WEB_PUSH_SUBSCRIPTION_TYPE
      }
    });

    const idsToDelete = rows
      .filter(row => ((row.data as any)?.subscription?.endpoint || '') === endpoint)
      .map(row => row.id);

    if (idsToDelete.length) {
      await prisma.notification.deleteMany({ where: { id: { in: idsToDelete } } });
    }

    res.json({ success: true, deleted: idsToDelete.length });
  } catch (error) {
    console.error('Error unsubscribing push:', error);
    res.status(500).json({ success: false, message: 'Error unsubscribing push' });
  }
});

app.post('/api/push/test', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!auth.agencyId) return res.status(400).json({ success: false, message: 'Missing agencyId' });

    const result = await createNotificationRecord({
      agencyId: auth.agencyId,
      recipientId: auth.id,
      type: 'EVENT_REMINDER',
      title: 'Test notifiche push',
      message: 'Se vedi questa notifica, il push è configurato correttamente.',
      data: { source: 'push-test', createdAt: new Date().toISOString() }
    });

    res.json({ success: true, message: 'Test push inviato', data: result });
  } catch (error) {
    console.error('Error sending test push:', error);
    res.status(500).json({ success: false, message: 'Error sending test push' });
  }
});

app.get('/api/notifications', async (req, res) => {
  const { agentId, isRead } = req.query;
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const where: any = {};

    if (auth.agencyId) {
      where.agencyId = auth.agencyId;
    }

    if (auth.role === 'AGENT') {
      where.recipientId = auth.id;
    } else if (agentId) {
      where.recipientId = agentId.toString();
    }

    if (typeof isRead === 'string') {
      if (isRead === 'true') where.isRead = true;
      if (isRead === 'false') where.isRead = false;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Error fetching notifications' });
  }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const where: any = { id: req.params.id };

    if (auth.role === 'AGENT') {
      where.recipientId = auth.id;
    } else if (auth.agencyId) {
      where.agencyId = auth.agencyId;
    }

    const result = await prisma.notification.updateMany({
      where,
      data: { isRead: true }
    });

    if (result.count === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, message: 'Error marking notification as read' });
  }
});

app.put('/api/notifications/read-all/:agentId', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const targetUserId = req.params.agentId;
    const markAllForAgency = targetUserId === 'ALL';

    if (auth.role === 'AGENT' && (markAllForAgency || targetUserId !== auth.id)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const where: any = {
      type: { not: WEB_PUSH_SUBSCRIPTION_TYPE }
    };

    if (!markAllForAgency) {
      where.recipientId = targetUserId;
    }

    if (auth.agencyId) {
      where.agencyId = auth.agencyId;
    }

    if (markAllForAgency && !isAdminRole(auth.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const result = await prisma.notification.updateMany({
      where,
      data: { isRead: true }
    });

    res.json({
      success: true,
      updatedCount: result.count
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ success: false, message: 'Error marking all notifications as read' });
  }
});

app.delete('/api/notifications/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const where: any = { id: req.params.id };

    if (auth.role === 'AGENT') {
      where.recipientId = auth.id;
    } else if (auth.agencyId) {
      where.agencyId = auth.agencyId;
    }

    const result = await prisma.notification.deleteMany({ where });

    if (result.count === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ success: false, message: 'Error deleting notification' });
  }
});

app.get('/api/notifications/unread-count/:agentId', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const targetUserId = req.params.agentId;

    if (auth.role === 'AGENT' && targetUserId !== auth.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const where: any = {
      recipientId: targetUserId,
      isRead: false,
      type: { not: WEB_PUSH_SUBSCRIPTION_TYPE }
    };

    if (auth.agencyId) {
      where.agencyId = auth.agencyId;
    }

    const count = await prisma.notification.count({ where });

    res.json({ success: true, count });
  } catch (error) {
    console.error('Error fetching unread notifications count:', error);
    res.status(500).json({ success: false, message: 'Error fetching unread notifications count' });
  }
});

app.put('/api/appointments/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const existing = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      select: { id: true, agencyId: true, assignedToId: true, participantIds: true, createdById: true, startTime: true, title: true }
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (auth.agencyId && existing.agencyId !== auth.agencyId) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (!canManageAppointment(auth, existing)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const data = { ...req.body };
    
    // Prepare valid data for Prisma update
    const appointmentData: any = {};
    
    // Only include fields that are present in the request
    if (data.title !== undefined) appointmentData.title = data.title;
    if (data.description !== undefined) appointmentData.description = data.description;
    const nextStartTime = data.startTime ? new Date(data.startTime) : null;
    if (nextStartTime) appointmentData.startTime = nextStartTime;
    if (data.endTime) appointmentData.endTime = new Date(data.endTime);
    if (data.location !== undefined) appointmentData.location = data.location;
    if (data.status !== undefined) appointmentData.status = data.status;
    if (data.notes !== undefined) appointmentData.notes = data.notes;
    
    let participantIdsFromBody = readAppointmentParticipantIdsFromBody(data);
    if (!isAdminRole(auth.role) && participantIdsFromBody.length > 0) {
      participantIdsFromBody = uniqueStringList([...participantIdsFromBody, auth.id]);
    }
    if (participantIdsFromBody.length > 0) {
      appointmentData.assignedToId = participantIdsFromBody[0];
      appointmentData.participantIds = participantIdsFromBody;
    }

    // Handle relations
    if (data.contactId !== undefined) {
      appointmentData.contactId = data.contactId && data.contactId.trim() !== '' ? data.contactId : null;
    }
    if (data.propertyId !== undefined) {
      appointmentData.propertyId = data.propertyId && data.propertyId.trim() !== '' ? data.propertyId : null;
    }

    if (auth.agencyId && appointmentData.participantIds?.length) {
      const assignedUsers = await prisma.user.findMany({
        where: { id: { in: appointmentData.participantIds } },
        select: { id: true, agencyId: true }
      });
      const validAssigneeIds = new Set(
        assignedUsers
          .filter((user) => user.agencyId === auth.agencyId)
          .map((user) => user.id)
      );
      const invalidAssignees = appointmentData.participantIds.filter((id: string) => !validAssigneeIds.has(id));
      if (invalidAssignees.length > 0) {
        return res.status(400).json({ success: false, message: 'Invalid assignedToId' });
      }
    }

    if (auth.agencyId && appointmentData.contactId) {
      const contact = await prisma.contact.findUnique({
        where: { id: appointmentData.contactId },
        select: { agencyId: true, assignedToId: true }
      });
      if (!contact || contact.agencyId !== auth.agencyId) {
        return res.status(400).json({ success: false, message: 'Invalid contactId' });
      }
    }

    if (auth.agencyId && appointmentData.propertyId) {
      const property = await prisma.property.findUnique({
        where: { id: appointmentData.propertyId },
        select: { agencyId: true, ownerId: true }
      });
      if (!property || property.agencyId !== auth.agencyId) {
        return res.status(400).json({ success: false, message: 'Invalid propertyId' });
      }
    }

    if (
      nextStartTime &&
      existing.startTime &&
      new Date(existing.startTime).getTime() !== nextStartTime.getTime()
    ) {
      appointmentData.reminderSent = false;
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: appointmentData,
      include: {
        assignedTo: { select: appointmentParticipantSelect },
        contact: { select: { firstName: true, lastName: true } },
        property: { select: { title: true } }
      }
    });

    const participantIds = getAppointmentParticipantIds(updatedAppointment);
    const participantUsers = participantIds.length
      ? await prisma.user.findMany({
          where: { id: { in: participantIds } },
          select: appointmentParticipantSelect
        })
      : [];
    const participantsById = new Map(participantUsers.map((user) => [user.id, user]));

    try {
      for (const recipientId of participantIds) {
        await createNotificationRecord({
          agencyId: updatedAppointment.agencyId,
          recipientId,
          type: 'APPOINTMENT_UPDATED',
          title: 'Appuntamento aggiornato',
          message: updatedAppointment.title,
          data: {
            appointmentId: updatedAppointment.id
          }
        });
      }
    } catch (notifyError) {
      console.error('Error creating appointment update notifications:', notifyError);
    }

    res.json({
      success: true,
      data: mapAppointmentForResponse(updatedAppointment, participantsById),
      message: 'Appointment updated successfully'
    });
  } catch (error) {
    res.status(404).json({ success: false, message: 'Appointment not found' });
  }
});

app.delete('/api/appointments/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const existing = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      select: { id: true, agencyId: true, assignedToId: true, participantIds: true, createdById: true, title: true }
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (auth.agencyId && existing.agencyId !== auth.agencyId) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (!canManageAppointment(auth, existing)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const deletedAppointment = await prisma.appointment.delete({ where: { id: req.params.id } });

    try {
      const recipientIds = getAppointmentParticipantIds(existing);
      for (const recipientId of recipientIds) {
        await createNotificationRecord({
          agencyId: existing.agencyId,
          recipientId,
          type: 'APPOINTMENT_CANCELLED',
          title: 'Appuntamento annullato',
          message: existing.title || 'Appuntamento eliminato',
          data: {
            appointmentId: existing.id
          }
        });
      }
    } catch (notifyError) {
      console.error('Error creating appointment cancel notifications:', notifyError);
    }

    res.json({
      success: true,
      data: deletedAppointment,
      message: 'Appointment deleted successfully'
    });
  } catch (error) {
    res.status(404).json({ success: false, message: 'Appointment not found' });
  }
});

// Activities endpoints
const ACTIVITY_TYPE_DEFINITIONS = [
  { value: 'CALL', label: 'Chiamata' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'NOTE', label: 'Prendere informazioni' },
  { value: 'TASK', label: 'Recupero documenti' },
  { value: 'MEETING', label: 'Fare zona' },
  { value: 'VIEWING', label: 'Altro' }
] as const;

const ACTIVITY_TYPE_VALUES_SET = new Set(ACTIVITY_TYPE_DEFINITIONS.map((entry) => entry.value));
const ACTIVITY_TYPE_LABEL_BY_VALUE = new Map(
  ACTIVITY_TYPE_DEFINITIONS.map((entry) => [entry.value, entry.label])
);

const normalizeActivityType = (value: any): string | null => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return null;

  const aliases: Record<string, string> = {
    FOLLOW_UP: 'NOTE',
    FOLLOWUP: 'NOTE',
    VISIT: 'VIEWING',
    VISITA: 'VIEWING',
    INCONTRO: 'MEETING'
  };

  const normalized = aliases[raw] || raw;
  if (!ACTIVITY_TYPE_VALUES_SET.has(normalized)) return null;
  return normalized;
};

const getActivityTypeLabel = (value: any): string => {
  const normalized = normalizeActivityType(value);
  if (!normalized) return String(value || '');
  return ACTIVITY_TYPE_LABEL_BY_VALUE.get(normalized) || normalized;
};

app.get('/api/activities/types', async (req, res) => {
  const auth = getAuth(req);
  if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });
  return res.json({ success: true, data: ACTIVITY_TYPE_DEFINITIONS });
});

app.get('/api/activities', async (req, res) => {
  const { page = 1, limit = 10, status, type, assignedToId } = req.query;

  try {
    const where: any = {};
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (auth.agencyId) where.agencyId = auth.agencyId;

    if (auth.role === 'AGENT') {
      where.assignedToId = auth.id;
    } else if (assignedToId) {
      where.assignedToId = assignedToId.toString();
    }

    if (status === 'completed') where.completed = true;
    if (status === 'pending') where.completed = false;
    if (type) {
      const normalizedType = normalizeActivityType(type);
      if (normalizedType) where.type = normalizedType;
    }

    const [total, activities] = await Promise.all([
      prisma.activity.count({ where }),
      prisma.activity.findMany({
        where,
        include: {
          contact: { select: { firstName: true, lastName: true } },
          property: { select: { title: true } },
          assignedTo: { select: { firstName: true, lastName: true } }
        },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const mappedActivities = activities.map(act => ({
      ...act,
      typeLabel: getActivityTypeLabel(act.type),
      contactName: act.contact ? `${act.contact.firstName} ${act.contact.lastName}` : undefined,
      propertyTitle: act.property?.title,
      assignedToName: act.assignedTo ? `${act.assignedTo.firstName} ${act.assignedTo.lastName}` : undefined
    }));

    res.json({
      success: true,
      data: mappedActivities,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching activities' });
  }
});

app.get('/api/reports/activity', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const limitRaw = Number(req.query.limit || 500);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 500;
    const agentIdQuery = req.query.agentId != null ? String(req.query.agentId).trim() : '';

    const where: any = {
      completed: true,
      report: { not: null }
    };
    if (auth.agencyId) where.agencyId = auth.agencyId;

    if (auth.role === 'AGENT') {
      where.assignedToId = auth.id;
    } else if (agentIdQuery) {
      where.assignedToId = agentIdQuery;
    }

    const rows = await prisma.activity.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        property: { select: { id: true, title: true, reference: true } },
        request: { select: { id: true, title: true } }
      },
      orderBy: { completedAt: 'desc' },
      take: limit
    });

    const filtered = rows.filter((row) => typeof row.report === 'string' && row.report.trim().length > 0);

    const data = filtered.map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
      typeLabel: getActivityTypeLabel(row.type),
      report: String(row.report || '').trim(),
      completedAt: row.completedAt,
      dueDate: row.dueDate,
      priority: row.priority,
      tags: row.tags || [],
      assignedTo: row.assignedTo
        ? {
            id: row.assignedTo.id,
            name: `${row.assignedTo.firstName || ''} ${row.assignedTo.lastName || ''}`.trim() || row.assignedTo.email,
            email: row.assignedTo.email,
            role: row.assignedTo.role
          }
        : null,
      contact: row.contact
        ? {
            id: row.contact.id,
            name: `${row.contact.firstName || ''} ${row.contact.lastName || ''}`.trim()
          }
        : null,
      property: row.property
        ? {
            id: row.property.id,
            title: row.property.title,
            reference: row.property.reference || null
          }
        : null,
      request: row.request
        ? {
            id: row.request.id,
            title: row.request.title
          }
        : null
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching activity reports:', error);
    return res.status(500).json({ success: false, message: 'Error fetching activity reports' });
  }
});

const sendWebPushToRecipient = async (params: {
  agencyId: string;
  recipientId: string;
  title: string;
  message: string;
  data?: any;
}) => {
  if (!WEB_PUSH_VAPID_PUBLIC_KEY || !WEB_PUSH_VAPID_PRIVATE_KEY) {
    return { attempted: 0, sent: 0, failed: 0, skipped: true, reason: 'push_not_configured' };
  }

  try {
    const subscriptionRows = await prisma.notification.findMany({
      where: {
        agencyId: params.agencyId,
        recipientId: params.recipientId,
        type: WEB_PUSH_SUBSCRIPTION_TYPE
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!subscriptionRows.length) {
      return { attempted: 0, sent: 0, failed: 0, skipped: true, reason: 'no_subscriptions' };
    }

    const payload = JSON.stringify({
      title: params.title,
      message: params.message,
      data: params.data ?? null,
      timestamp: new Date().toISOString()
    });

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    await Promise.all(
      subscriptionRows.map(async row => {
        const subscription = (row.data as any)?.subscription;
        const hasKeys = Boolean(
          subscription?.keys &&
          typeof subscription.keys.p256dh === 'string' &&
          subscription.keys.p256dh.trim() &&
          typeof subscription.keys.auth === 'string' &&
          subscription.keys.auth.trim()
        );
        if (!subscription?.endpoint || !hasKeys) {
          failed += 1;
          errors.push('invalid_subscription_payload');
          return;
        }

        try {
          await webpush.sendNotification(subscription, payload, {
            // Keep pending notifications in provider queue for offline devices.
            TTL: 60 * 60 * 24,
            urgency: 'high'
          } as any);
          sent += 1;
        } catch (error: any) {
          const statusCode = Number(error?.statusCode || 0);
          if (statusCode === 404 || statusCode === 410) {
            await prisma.notification.delete({ where: { id: row.id } }).catch(() => {});
          }
          failed += 1;
          errors.push(error?.message ? String(error.message) : 'push_send_error');
          console.error('Push send error:', error?.message || error);
        }
      })
    );
    return {
      attempted: subscriptionRows.length,
      sent,
      failed,
      skipped: false,
      errors: errors.slice(0, 5)
    };
  } catch (error) {
    console.error('Error sending push notifications:', error);
    return { attempted: 0, sent: 0, failed: 0, skipped: true, reason: 'push_send_exception' };
  }
};

const getNotificationRoute = (type: string, data?: any) => {
  const notificationType = String(type || '').toUpperCase();
  const payload = data && typeof data === 'object' ? data : {};
  const propertyId = payload.propertyId ? String(payload.propertyId) : '';
  const activityId = payload.activityId ? String(payload.activityId) : '';
  const appointmentId = payload.appointmentId ? String(payload.appointmentId) : '';

  if (notificationType === 'APPOINTMENT_REPORT_REMINDER') {
    if (activityId) return `/attivita?activityId=${encodeURIComponent(activityId)}`;
    return '/attivita';
  }
  if (
    propertyId &&
    notificationType === 'PROPERTY_PENDING_APPROVAL'
  ) {
    return `/immobili?approvalPropertyId=${encodeURIComponent(propertyId)}`;
  }
  if (
    propertyId &&
    ['PROPERTY_APPROVED', 'PROPERTY_ASSIGNED', 'REQUEST_LINKED', 'PUBLIC_CONTACT_REQUEST', 'VISIT_REQUEST'].includes(notificationType)
  ) {
    return `/immobili/${encodeURIComponent(propertyId)}`;
  }

  if (notificationType.startsWith('APPOINTMENT_')) {
    if (appointmentId) return `/appuntamenti?appointmentId=${encodeURIComponent(appointmentId)}`;
    return '/appuntamenti';
  }
  if (notificationType === 'EVENT_REMINDER') return '/notifiche';
  if (notificationType.startsWith('TASK_') || notificationType.startsWith('ACTIVITY_') || notificationType === 'REQUEST_ACTIVITY_REMINDER') {
    if (activityId) return `/attivita?activityId=${encodeURIComponent(activityId)}`;
    return '/attivita';
  }
  if (notificationType === 'ZONE_TASK_REMINDER') {
    if (activityId) return `/attivita?activityId=${encodeURIComponent(activityId)}`;
    return '/zone-tasks';
  }
  if (notificationType.startsWith('ZONE_')) return '/zone-tasks';
  if (notificationType === 'MATCH_FOUND') return '/incrocio';
  if (notificationType.startsWith('PROPERTY_')) return '/immobili';
  if (notificationType === 'CLIENT_ADDED') return '/contatti';
  if (notificationType.startsWith('CONTRACT_')) return '/contratti';
  if (notificationType.includes('REPORT')) return '/report';
  if (notificationType === 'MORNING_DAILY_REMINDER') return '/dashboard';
  return '/dashboard';
};

const getNotificationDefaultMessage = (type: string, title: string, message: string, data?: any) => {
  const notificationType = String(type || '').toUpperCase();
  const payload = data && typeof data === 'object' ? data : {};
  const incoming = String(message || '').trim();
  if (incoming) return incoming;

  switch (notificationType) {
    case 'APPOINTMENT_CREATED':
      return `Nuovo appuntamento assegnato: ${payload.appointmentTitle || title || 'appuntamento'}`;
    case 'APPOINTMENT_REMINDER':
      return `Il tuo appuntamento inizia a breve`;
    case 'APPOINTMENT_REPORT_REMINDER':
      return `Come è andato il tuo appuntamento, lascia un feedback`;
    case 'TASK_CREATED':
      return `Nuovo task assegnato: ${payload.taskTitle || title || 'task'}`;
    case 'ACTIVITY_CREATED':
      return `Nuova attività assegnata: ${payload.activityTitle || title || 'attività'}`;
    case 'REQUEST_ACTIVITY_REMINDER':
      return `Promemoria richiesta: lascia il report del task in scadenza.`;
    case 'ZONE_TASK_REMINDER':
      return `Promemoria task zona in scadenza.`;
    case 'ZONE_TASK_ASSIGNED':
      return `Nuova prossima azione task zona assegnata.`;
    case 'REQUEST_LINKED':
      return `Nuova richiesta cliente collegata a un immobile.`;
    case 'PUBLIC_CONTACT_REQUEST':
      return `Nuova richiesta informazioni da portale pubblico.`;
    case 'VISIT_REQUEST':
      return `Nuova richiesta visita da portale pubblico.`;
    case 'MORNING_DAILY_REMINDER':
      return `Promemoria giornata: controlla appuntamenti e task.`;
    default:
      return String(title || 'Nuova notifica').trim() || 'Nuova notifica';
  }
};

const createNotificationRecord = async (params: {
  agencyId: string | null | undefined;
  recipientId: string | null | undefined;
  type: string;
  title: string;
  message: string;
  data?: any;
}) => {
  try {
    if (!params.agencyId || !params.recipientId) {
      return { stored: false, push: { skipped: true, reason: 'missing_agency_or_recipient' } };
    }
    if (String(params.type || '').toUpperCase() === 'PROPERTY_PENDING_APPROVAL') {
      const propertyId = params.data?.propertyId ? String(params.data.propertyId) : '';
      if (propertyId) {
        const existingUnread = await prisma.notification.findMany({
          where: {
            agencyId: params.agencyId,
            recipientId: params.recipientId,
            type: 'PROPERTY_PENDING_APPROVAL',
            isRead: false
          },
          orderBy: { createdAt: 'desc' },
          take: 50
        });
        const hasExistingForProperty = existingUnread.some((row) => {
          const rowPropertyId = row?.data && typeof row.data === 'object'
            ? String((row.data as any)?.propertyId || '')
            : '';
          return rowPropertyId === propertyId;
        });
        if (hasExistingForProperty) {
          return { stored: false, push: { skipped: true, reason: 'duplicate_property_pending_approval' } };
        }
      }
    }
    const route = getNotificationRoute(params.type, params.data);
    const normalizedData = {
      ...(params.data && typeof params.data === 'object' ? params.data : {}),
      url: route,
      route
    };
    const normalizedMessage = getNotificationDefaultMessage(params.type, params.title, params.message, normalizedData);

    await prisma.notification.create({
      data: {
        agencyId: params.agencyId,
        recipientId: params.recipientId,
        type: params.type,
        title: params.title,
        message: normalizedMessage,
        data: normalizedData
      }
    });

    const pushResult = await sendWebPushToRecipient({
      agencyId: params.agencyId,
      recipientId: params.recipientId,
      title: params.title,
      message: normalizedMessage,
      data: normalizedData
    });
    return { stored: true, push: pushResult };
  } catch (error) {
    console.error('Error creating notification:', error);
    return { stored: false, push: { skipped: true, reason: 'create_notification_exception' } };
  }
};

const buildPropertyNotificationMessage = (property: {
  title?: string | null;
  reference?: string | null;
  city?: string | null;
  address?: string | null;
}) => {
  const title = String(property?.title || '').trim();
  const reference = String(property?.reference || '').trim();
  const city = String(property?.city || '').trim();
  const address = String(property?.address || '').trim();
  const primary = title || (reference ? `Rif. ${reference}` : 'Nuovo immobile');
  const location = [city, address].filter(Boolean).join(' - ');
  return location ? `${primary} - ${location}` : primary;
};

const extractPropertyAssigneeIds = (raw: any, fallbackOwnerId?: string | null) => {
  const ids = new Set<string>();
  const push = (value: any) => {
    const id = String(value || '').trim();
    if (id) ids.add(id);
  };
  push(raw?.agentId);
  push(raw?.ownerId);
  push(raw?.oneClickData?.idagente);
  push(fallbackOwnerId);
  return Array.from(ids);
};

const getDisplayNameFromUser = (user?: { firstName?: string | null; lastName?: string | null; name?: string | null; email?: string | null } | null) => {
  const full = `${String(user?.firstName || '').trim()} ${String(user?.lastName || '').trim()}`.trim();
  if (full) return full;
  const byName = String(user?.name || '').trim();
  if (byName) return byName;
  return String(user?.email || '').trim() || 'Agente';
};

const APPOINTMENT_REMINDER_WINDOW_MINUTES = Number(process.env.APPOINTMENT_REMINDER_WINDOW_MINUTES || 30);
const APPOINTMENT_REPORT_REMINDER_DELAY_MINUTES = Number(process.env.APPOINTMENT_REPORT_REMINDER_DELAY_MINUTES || 30);
const APPOINTMENT_REPORT_REMINDER_LOOKBACK_MINUTES = Number(process.env.APPOINTMENT_REPORT_REMINDER_LOOKBACK_MINUTES || 10);
const REQUEST_ACTIVITY_REMINDER_LEAD_HOURS = Number(process.env.REQUEST_ACTIVITY_REMINDER_LEAD_HOURS || 2);
const APPOINTMENT_REMINDER_POLL_MS = Number(process.env.APPOINTMENT_REMINDER_POLL_MS || 60_000);
const APPOINTMENT_REMINDER_SWEEP_THROTTLE_MS = Number(
  process.env.APPOINTMENT_REMINDER_SWEEP_THROTTLE_MS || 30_000
);
const DAILY_MORNING_REMINDER_END_HOUR = Number(process.env.DAILY_MORNING_REMINDER_END_HOUR || 12);
const APPOINTMENT_REMINDER_SWEEP_SECRET = String(
  process.env.APPOINTMENT_REMINDER_SWEEP_SECRET || ''
).trim();
const CRON_SECRET = String(process.env.CRON_SECRET || '').trim();
let appointmentReminderMonitorStarted = false;
let appointmentReminderSweepRunning = false;
let appointmentReminderLastSweepAt = 0;

const formatDateKeyRome = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

const getRomeHour = (date: Date) =>
  Number(
    new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      hour12: false
    }).format(date)
  );

const runMorningDailyReminderSweep = async () => {
  const now = new Date();
  const romeHour = getRomeHour(now);
  if (!Number.isFinite(romeHour) || romeHour >= DAILY_MORNING_REMINDER_END_HOUR) {
    return { processed: 0, skipped: true, reason: 'outside_morning_window' };
  }

  const todayKey = formatDateKeyRome(now);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = formatDateKeyRome(yesterday);

  const rangeStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const rangeEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [candidateActivities, candidateAppointments] = await Promise.all([
    prisma.activity.findMany({
      where: {
        completed: false,
        dueDate: {
          gte: rangeStart,
          lte: rangeEnd
        }
      },
      select: {
        id: true,
        agencyId: true,
        assignedToId: true,
        title: true,
        dueDate: true
      },
      take: 500
    }),
    prisma.appointment.findMany({
      where: {
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        startTime: {
          gte: rangeStart,
          lte: rangeEnd
        }
      },
      select: {
        id: true,
        agencyId: true,
        assignedToId: true,
        title: true,
        startTime: true
      },
      take: 500
    })
  ]);

  type Bucket = {
    agencyId: string;
    recipientId: string;
    todayAppointments: number;
    todayTasks: number;
    overdueFromYesterday: number;
  };
  const buckets = new Map<string, Bucket>();
  const getBucket = (agencyId: string, recipientId: string) => {
    const key = `${agencyId}:${recipientId}`;
    const existing = buckets.get(key);
    if (existing) return existing;
    const created: Bucket = {
      agencyId,
      recipientId,
      todayAppointments: 0,
      todayTasks: 0,
      overdueFromYesterday: 0
    };
    buckets.set(key, created);
    return created;
  };

  for (const activity of candidateActivities) {
    if (!activity.assignedToId || !activity.dueDate) continue;
    const dueKey = formatDateKeyRome(activity.dueDate);
    const bucket = getBucket(activity.agencyId, activity.assignedToId);
    if (dueKey === todayKey) bucket.todayTasks += 1;
    if (dueKey === yesterdayKey) bucket.overdueFromYesterday += 1;
  }

  for (const appointment of candidateAppointments) {
    if (!appointment.assignedToId || !appointment.startTime) continue;
    const startKey = formatDateKeyRome(appointment.startTime);
    if (startKey !== todayKey) continue;
    const bucket = getBucket(appointment.agencyId, appointment.assignedToId);
    bucket.todayAppointments += 1;
  }

  let processed = 0;
  for (const bucket of buckets.values()) {
    const hasAny =
      bucket.todayAppointments > 0 ||
      bucket.todayTasks > 0 ||
      bucket.overdueFromYesterday > 0;
    if (!hasAny) continue;

    const existingReminder = await prisma.notification.findFirst({
      where: {
        agencyId: bucket.agencyId,
        recipientId: bucket.recipientId,
        type: 'MORNING_DAILY_REMINDER',
        data: {
          path: ['dateKey'],
          equals: todayKey
        } as any
      },
      select: { id: true }
    });
    if (existingReminder) continue;

    const summaryParts = [
      `Oggi hai ${bucket.todayAppointments} appuntamenti`,
      `${bucket.todayTasks} task`,
      `arretrati da ieri: ${bucket.overdueFromYesterday}`
    ];

    await createNotificationRecord({
      agencyId: bucket.agencyId,
      recipientId: bucket.recipientId,
      type: 'MORNING_DAILY_REMINDER',
      title: 'Promemoria giornata',
      message: summaryParts.join(' · '),
      data: {
        dateKey: todayKey,
        todayAppointments: bucket.todayAppointments,
        todayTasks: bucket.todayTasks,
        overdueFromYesterday: bucket.overdueFromYesterday
      }
    });
    processed += 1;
  }

  return { processed };
};

const runRequestActivityReminderSweep = async () => {
  const now = new Date();
  const leadMs = REQUEST_ACTIVITY_REMINDER_LEAD_HOURS * 60 * 60 * 1000;
  const threshold = new Date(now.getTime() + leadMs);

  const dueActivities = await prisma.activity.findMany({
    where: {
      completed: false,
      dueDate: {
        not: null,
        lte: threshold
      },
      OR: [
        { requestId: { not: null } },
        { tags: { has: 'RICHIESTA_COLLEGATA' } },
        { tags: { has: 'ZONE_NEXT_ACTION' } }
      ]
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      agencyId: true,
      assignedToId: true,
      requestId: true,
      tags: true
    },
    take: 100
  });

  if (!dueActivities.length) {
    return { processed: 0 };
  }

  const eligibleActivities = dueActivities.filter(a => a.dueDate && a.dueDate.getTime() > now.getTime());
  const existingActivityReminders = await Promise.all(
    eligibleActivities.map(activity => {
      const reminderType = Array.isArray(activity.tags) && activity.tags.includes('ZONE_NEXT_ACTION') ? 'ZONE_TASK_REMINDER' : 'REQUEST_ACTIVITY_REMINDER';
      return prisma.notification.findFirst({
        where: { agencyId: activity.agencyId, recipientId: activity.assignedToId, type: reminderType, data: { path: ['activityId'], equals: activity.id } as any },
        select: { id: true }
      });
    })
  );

  const toNotify = eligibleActivities.filter((_, i) => !existingActivityReminders[i]);
  await Promise.all(toNotify.map(activity => {
    const isZoneTaskReminder = Array.isArray(activity.tags) && activity.tags.includes('ZONE_NEXT_ACTION');
    const reminderType = isZoneTaskReminder ? 'ZONE_TASK_REMINDER' : 'REQUEST_ACTIVITY_REMINDER';
    return createNotificationRecord({
      agencyId: activity.agencyId,
      recipientId: activity.assignedToId,
      type: reminderType,
      title: isZoneTaskReminder ? 'Promemoria task zona' : 'Promemoria richiesta',
      message: isZoneTaskReminder
        ? `Promemoria task zona: ${activity.title}`
        : `lascia il report per la richiesta (${activity.title})`,
      data: {
        activityId: activity.id,
        requestId: activity.requestId || null,
        dueDate: activity.dueDate!.toISOString(),
        leadHours: REQUEST_ACTIVITY_REMINDER_LEAD_HOURS,
        source: isZoneTaskReminder ? 'ZONE_NEXT_ACTION' : 'REQUEST'
      }
    });
  }));

  return { processed: toNotify.length };
};

const runAppointmentReminderSweep = async () => {
  if (appointmentReminderSweepRunning) return { processed: 0 };
  appointmentReminderSweepRunning = true;
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 2 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + APPOINTMENT_REMINDER_WINDOW_MINUTES * 60 * 1000);

    const dueAppointments = await prisma.appointment.findMany({
      where: {
        reminder: true,
        reminderSent: false,
        status: {
          in: ['SCHEDULED', 'CONFIRMED']
        },
        startTime: {
          gte: windowStart,
          lte: windowEnd
        }
      },
      select: {
        id: true,
        agencyId: true,
        assignedToId: true,
        title: true,
        startTime: true
      },
      take: 100
    });

    let appointmentProcessed = 0;

    if (dueAppointments.length) {
      await Promise.all(dueAppointments.map(appointment =>
        createNotificationRecord({
          agencyId: appointment.agencyId,
          recipientId: appointment.assignedToId,
          type: 'APPOINTMENT_REMINDER',
          title: 'Promemoria appuntamento',
          message: 'Il tuo appuntamento inizia a breve',
          data: {
            appointmentId: appointment.id,
            appointmentTitle: appointment.title,
            startTime: appointment.startTime.toISOString()
          }
        })
      ));
      await prisma.appointment.updateMany({
        where: { id: { in: dueAppointments.map(a => a.id) } },
        data: { reminderSent: true }
      });
      appointmentProcessed = dueAppointments.length;
    }

    const reportDelayMs = APPOINTMENT_REPORT_REMINDER_DELAY_MINUTES * 60 * 1000;
    const reportLookbackMs = APPOINTMENT_REPORT_REMINDER_LOOKBACK_MINUTES * 60 * 1000;
    const reportWindowStart = new Date(now.getTime() - reportDelayMs - reportLookbackMs);
    const reportWindowEnd = new Date(now.getTime() - reportDelayMs + 2 * 60 * 1000);

    const recentlyEndedAppointments = await prisma.appointment.findMany({
      where: {
        status: { in: ['SCHEDULED', 'CONFIRMED', 'COMPLETED'] },
        endTime: {
          gte: reportWindowStart,
          lte: reportWindowEnd
        }
      },
      select: {
        id: true,
        agencyId: true,
        assignedToId: true,
        title: true,
        endTime: true,
        notes: true
      },
      take: 100
    });

    if (recentlyEndedAppointments.length) {
      const existingReportReminders = await Promise.all(
        recentlyEndedAppointments.map(a => prisma.notification.findFirst({
          where: { agencyId: a.agencyId, recipientId: a.assignedToId, type: 'APPOINTMENT_REPORT_REMINDER', data: { path: ['appointmentId'], equals: a.id } as any },
          select: { id: true }
        }))
      );
      const toNotify = recentlyEndedAppointments.filter((_, i) => !existingReportReminders[i]);

      await Promise.all(toNotify.map(async (appointment) => {
        let relatedActivityTitle: string | null = null;
        let relatedActivityId: string | null = null;
        try {
          const parsedNotes = appointment.notes ? JSON.parse(String(appointment.notes)) : null;
          relatedActivityId = parsedNotes?.activityId ? String(parsedNotes.activityId) : null;
          if (relatedActivityId) {
            const relatedActivity = await prisma.activity.findUnique({
              where: { id: relatedActivityId },
              select: { id: true, title: true, completed: true }
            });
            if (relatedActivity && !relatedActivity.completed) {
              relatedActivityTitle = relatedActivity.title;
            }
          }
        } catch {}

        await createNotificationRecord({
          agencyId: appointment.agencyId,
          recipientId: appointment.assignedToId,
          type: 'APPOINTMENT_REPORT_REMINDER',
          title: 'Lascia feedback appuntamento',
          message: `Come è andato il tuo appuntamento, lascia un feedback`,
          data: {
            appointmentId: appointment.id,
            appointmentTitle: appointment.title,
            endedAt: appointment.endTime.toISOString(),
            activityId: relatedActivityId || null,
            relatedActivityTitle: relatedActivityTitle || null
          }
        });
      }));
    }

    const [requestActivityReminderResult, morningDailyReminderResult] = await Promise.all([
      runRequestActivityReminderSweep(),
      runMorningDailyReminderSweep()
    ]);

    return {
      processed: appointmentProcessed,
      appointmentProcessed,
      requestActivityProcessed: requestActivityReminderResult.processed,
      morningDailyProcessed: morningDailyReminderResult.processed || 0
    };
  } catch (error) {
    console.error('Appointment reminder sweep error:', error);
    return { processed: 0, appointmentProcessed: 0, requestActivityProcessed: 0, morningDailyProcessed: 0 };
  } finally {
    appointmentReminderSweepRunning = false;
  }
};

const maybeRunAppointmentReminderSweep = () => {
  const now = Date.now();
  if (now - appointmentReminderLastSweepAt < APPOINTMENT_REMINDER_SWEEP_THROTTLE_MS) return;
  appointmentReminderLastSweepAt = now;
  runAppointmentReminderSweep().catch((error) => {
    console.error('Appointment reminder opportunistic sweep error:', error);
  });
};

const startAppointmentReminderMonitor = () => {
  if (appointmentReminderMonitorStarted) return;
  appointmentReminderMonitorStarted = true;
  setInterval(() => {
    runAppointmentReminderSweep().catch((error) => {
      console.error('Appointment reminder monitor loop error:', error);
    });
  }, APPOINTMENT_REMINDER_POLL_MS);
};

const isReminderSweepAuthorized = (req: express.Request) => {
  const effectiveSecret = APPOINTMENT_REMINDER_SWEEP_SECRET || CRON_SECRET;
  if (!effectiveSecret) {
    return Boolean(req.headers['x-vercel-cron']) || process.env.NODE_ENV !== 'production';
  }
  const authHeader = String(req.headers.authorization || '').trim();
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const querySecret = String((req.query as any)?.secret || '').trim();
  return bearer === effectiveSecret || querySecret === effectiveSecret;
};

const handleAppointmentReminderSweepRequest = async (req: express.Request, res: express.Response) => {
  try {
    if (!isReminderSweepAuthorized(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await runAppointmentReminderSweep();
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Appointment reminder sweep endpoint error:', error);
    return res.status(500).json({ success: false, message: 'Error running reminder sweep' });
  }
};

app.get('/api/internal/reminders/appointments/sweep', handleAppointmentReminderSweepRequest);
app.get('/internal/reminders/appointments/sweep', handleAppointmentReminderSweepRequest);

app.post('/api/activities', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (!isAdminRole(auth.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    let { agencyId, ...data } = req.body;

    if (auth.agencyId && auth.role !== 'SUPER_ADMIN') {
      agencyId = auth.agencyId;
    }

    if (!agencyId) {
      const agency = await prisma.agency.findFirst();
      agencyId = agency?.id;
    }
    
    const assignedToIdFromBody = data.assignedToId ? String(data.assignedToId).trim() : '';
    const assignedToIdsFromBody = Array.isArray((data as any).assignedToIds)
      ? (data as any).assignedToIds
          .map((value: any) => String(value || '').trim())
          .filter((value: string) => Boolean(value))
      : [];

    const assignedToIds = Array.from(new Set([
      ...assignedToIdsFromBody,
      ...(assignedToIdFromBody ? [assignedToIdFromBody] : [])
    ]));

    delete (data as any).assignedToIds;

    if (!assignedToIds.length) {
      if (isAdminRole(auth.role)) {
        return res.status(400).json({ success: false, message: 'assignedToId is required' });
      }
      assignedToIds.push(auth.id);
    }

    const parsedStartTime =
      data.startTime && !Number.isNaN(new Date(data.startTime).getTime())
        ? new Date(data.startTime)
        : null;
    const parsedEndTime =
      data.endTime && !Number.isNaN(new Date(data.endTime).getTime())
        ? new Date(data.endTime)
        : null;

    if (data.dueDate) data.dueDate = new Date(data.dueDate);
    if (!data.dueDate && parsedStartTime) data.dueDate = parsedStartTime;

    delete (data as any).startTime;
    delete (data as any).endTime;

    // Sanitize optional fields to avoid Foreign Key errors
    if (!data.contactId) delete data.contactId;
    if (!data.propertyId) delete data.propertyId;
    if (!data.requestId) delete data.requestId;

    // Remove non-schema fields that might be sent by frontend
    delete (data as any).contactName;
    delete (data as any).propertyTitle;

    const normalizedType = normalizeActivityType((data as any).type);
    if (!normalizedType) {
      return res.status(400).json({ success: false, message: 'Invalid activity type' });
    }
    (data as any).type = normalizedType;

    if (auth.agencyId) {
      const usersInAgency = await prisma.user.findMany({
        where: {
          id: { in: assignedToIds },
          agencyId: auth.agencyId
        },
        select: { id: true }
      });
      const usersInAgencySet = new Set(usersInAgency.map((u) => u.id));
      const invalidAssignees = assignedToIds.filter((id) => !usersInAgencySet.has(id));
      if (invalidAssignees.length) {
        return res.status(400).json({ success: false, message: 'Invalid assignedToId' });
      }
    }

    if (auth.agencyId && data.contactId) {
      const contact = await prisma.contact.findUnique({
        where: { id: data.contactId },
        select: { agencyId: true, assignedToId: true }
      });
      if (!contact || contact.agencyId !== auth.agencyId) {
        return res.status(400).json({ success: false, message: 'Invalid contactId' });
      }
    }

    if (auth.agencyId && data.propertyId) {
      const property = await prisma.property.findUnique({
        where: { id: data.propertyId },
        select: { agencyId: true, ownerId: true }
      });
      if (!property || property.agencyId !== auth.agencyId) {
        return res.status(400).json({ success: false, message: 'Invalid propertyId' });
      }
    }

    if (auth.agencyId && data.requestId) {
      const request = await prisma.request.findUnique({
        where: { id: data.requestId },
        select: { agencyId: true, assignedToId: true }
      });
      if (!request || request.agencyId !== auth.agencyId) {
        return res.status(400).json({ success: false, message: 'Invalid requestId' });
      }
    }

    const { createdActivities, createdAppointments } = await prisma.$transaction(async (tx) => {
      const nextActivities: any[] = [];
      const nextAppointments: any[] = [];
      for (const assigneeId of assignedToIds) {
        const newActivity = await tx.activity.create({
          data: {
            ...data,
            agencyId,
            assignedToId: assigneeId
          }
        });
        nextActivities.push(newActivity);

        const appointmentStart = parsedStartTime ? new Date(parsedStartTime) : (newActivity.dueDate ? new Date(newActivity.dueDate) : new Date());
        const appointmentEnd = parsedEndTime ? new Date(parsedEndTime) : new Date(appointmentStart.getTime() + 30 * 60 * 1000);
        const generatedAppointment = await tx.appointment.create({
          data: {
            title: newActivity.title,
            description: newActivity.description || '',
            startTime: appointmentStart,
            endTime: appointmentEnd,
            location: '',
            status: 'SCHEDULED',
            notes: `AUTO_FROM_ACTIVITY:${newActivity.id}`,
            agencyId: newActivity.agencyId,
            assignedToId: assigneeId,
            participantIds: [assigneeId],
            createdById: auth.id,
            contactId: newActivity.contactId || undefined,
            propertyId: newActivity.propertyId || undefined
          }
        });
        nextAppointments.push(generatedAppointment);
      }
      return {
        createdActivities: nextActivities,
        createdAppointments: nextAppointments
      };
    });

    const assigneeIdsForResponse = Array.from(
      new Set(createdActivities.map((row) => String(row.assignedToId || '').trim()).filter(Boolean))
    );
    const assigneeRows = assigneeIdsForResponse.length
      ? await prisma.user.findMany({
          where: { id: { in: assigneeIdsForResponse } },
          select: { id: true, firstName: true, lastName: true, email: true }
        })
      : [];
    const assigneeNameById = new Map(
      assigneeRows.map((u) => [u.id, `${String(u.firstName || '').trim()} ${String(u.lastName || '').trim()}`.trim() || String(u.email || '').trim() || 'Agente'])
    );
    const createdActivitiesForResponse = createdActivities.map((row) => ({
      ...row,
      typeLabel: getActivityTypeLabel(row.type),
      assignedToName: assigneeNameById.get(String(row.assignedToId || '').trim()) || undefined
    }));

    for (const created of createdActivities) {
      const isTask = String(created.type || '').toUpperCase() === 'TASK';
      await createNotificationRecord({
        agencyId,
        recipientId: created.assignedToId,
        type: isTask ? 'TASK_CREATED' : 'ACTIVITY_CREATED',
        title: isTask ? 'Nuovo task assegnato' : 'Nuova attività assegnata',
        message: created.title,
        data: {
          activityId: created.id,
          type: created.type
        }
      });
    }

    for (const createdAppointment of createdAppointments) {
      await createNotificationRecord({
        agencyId,
        recipientId: createdAppointment.assignedToId,
        type: 'APPOINTMENT_CREATED',
        title: 'Nuovo appuntamento assegnato',
        message: createdAppointment.title,
        data: {
          appointmentId: createdAppointment.id,
          generatedFrom: 'activity'
        }
      });
    }

    res.status(201).json({
      success: true,
      data: createdActivitiesForResponse.length === 1 ? createdActivitiesForResponse[0] : createdActivitiesForResponse,
      appointments: createdAppointments,
      createdCount: createdActivities.length,
      message: 'Activities created successfully'
    });
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({ success: false, message: 'Error creating activity' });
  }
});

app.put('/api/activities/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (!isAdminRole(auth.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const existing = await prisma.activity.findUnique({
      where: { id: req.params.id },
      select: { id: true, agencyId: true, assignedToId: true }
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Activity not found' });
    if (auth.agencyId && existing.agencyId !== auth.agencyId) return res.status(404).json({ success: false, message: 'Activity not found' });

    const data = { ...req.body };
    if (data.dueDate) data.dueDate = new Date(data.dueDate);
    delete (data as any).startTime;
    delete (data as any).endTime;

    delete (data as any).contactName;
    delete (data as any).propertyTitle;

    if (Object.prototype.hasOwnProperty.call(data, 'type')) {
      const normalizedType = normalizeActivityType((data as any).type);
      if (!normalizedType) {
        return res.status(400).json({ success: false, message: 'Invalid activity type' });
      }
      (data as any).type = normalizedType;
    }

    if (auth.agencyId && data.assignedToId) {
      const assignedUser = await prisma.user.findUnique({
        where: { id: data.assignedToId },
        select: { agencyId: true }
      });
      if (!assignedUser || assignedUser.agencyId !== auth.agencyId) {
        return res.status(400).json({ success: false, message: 'Invalid assignedToId' });
      }
    }

    if (auth.agencyId && data.contactId) {
      const contact = await prisma.contact.findUnique({
        where: { id: data.contactId },
        select: { agencyId: true, assignedToId: true }
      });
      if (!contact || contact.agencyId !== auth.agencyId) {
        return res.status(400).json({ success: false, message: 'Invalid contactId' });
      }
    }

    if (auth.agencyId && data.propertyId) {
      const property = await prisma.property.findUnique({
        where: { id: data.propertyId },
        select: { agencyId: true, ownerId: true }
      });
      if (!property || property.agencyId !== auth.agencyId) {
        return res.status(400).json({ success: false, message: 'Invalid propertyId' });
      }
    }

    if (auth.agencyId && data.requestId) {
      const request = await prisma.request.findUnique({
        where: { id: data.requestId },
        select: { agencyId: true, assignedToId: true }
      });
      if (!request || request.agencyId !== auth.agencyId) {
        return res.status(400).json({ success: false, message: 'Invalid requestId' });
      }
    }

    const updatedActivity = await prisma.activity.update({
      where: { id: req.params.id },
      data
    });

    res.json({
      success: true,
      data: {
        ...updatedActivity,
        typeLabel: getActivityTypeLabel(updatedActivity.type)
      },
      message: 'Activity updated successfully'
    });
  } catch (error) {
    res.status(404).json({ success: false, message: 'Activity not found' });
  }
});

app.delete('/api/activities/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (!isAdminRole(auth.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const existing = await prisma.activity.findUnique({
      where: { id: req.params.id },
      select: { id: true, agencyId: true, assignedToId: true }
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Activity not found' });
    if (auth.agencyId && existing.agencyId !== auth.agencyId) return res.status(404).json({ success: false, message: 'Activity not found' });

    const deletedActivity = await prisma.activity.delete({ where: { id: req.params.id } });

    res.json({
      success: true,
      data: deletedActivity,
      message: 'Activity deleted successfully'
    });
  } catch (error) {
    res.status(404).json({ success: false, message: 'Activity not found' });
  }
});

app.put('/api/activities/:id/complete', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const existing = await prisma.activity.findUnique({
      where: { id: req.params.id },
      select: { id: true, agencyId: true, assignedToId: true }
    });

    if (!existing) return res.status(404).json({ success: false, message: 'Activity not found' });
    if (auth.agencyId && existing.agencyId !== auth.agencyId) {
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }
    if (auth.role === 'AGENT' && existing.assignedToId !== auth.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const rawReport = (req.body as any)?.report;
    const report = typeof rawReport === 'string' ? rawReport.trim() : '';

    if (auth.role === 'AGENT' && !report) {
      return res.status(400).json({ success: false, message: 'Report is required to complete activity' });
    }

    const updatedActivity = await prisma.activity.update({
      where: { id: req.params.id },
      data: {
        completed: true,
        completedAt: new Date(),
        report: report || undefined
      }
    });

    if (updatedActivity.assignedToId) {
      await createNotificationRecord({
        agencyId: updatedActivity.agencyId,
        recipientId: updatedActivity.assignedToId,
        type: updatedActivity.type === 'TASK' ? 'TASK_COMPLETED' : 'ACTIVITY_COMPLETED',
        title: updatedActivity.type === 'TASK' ? 'Task completato' : 'Attività completata',
        message: updatedActivity.title,
        data: {
          activityId: updatedActivity.id,
          completedAt: updatedActivity.completedAt?.toISOString?.() || new Date().toISOString()
        }
      });
    }

    res.json({
      success: true,
      data: updatedActivity,
      message: 'Activity completed successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error completing activity' });
  }
});

type ContractStatus = 'DRAFT' | 'COMPLETED' | 'SIGNED' | 'ACTIVE' | 'EXPIRED';

type ContractTemplateRecord = {
  id: string;
  name: string;
  type: string;
  description: string;
  fields: string[];
  template: string;
  createdAt: string;
};

type ContractRecord = {
  id: string;
  templateId: string;
  templateName: string;
  propertyId?: string;
  propertyTitle?: string;
  contactId?: string;
  contactName?: string;
  agentId?: string;
  agentName?: string;
  status: ContractStatus;
  data: Record<string, any>;
  generatedText?: string | null;
  createdAt: string;
  updatedAt: string;
};

const CONTRACT_TEMPLATES: ContractTemplateRecord[] = [
  {
    id: '1',
    name: 'Contratto di Locazione Abitativa',
    type: 'LOCAZIONE_ABITATIVA',
    description: 'Contratto base di locazione abitativa',
    fields: [
      'locatore_nome',
      'locatore_cognome',
      'locatore_cf',
      'conduttore_nome',
      'conduttore_cognome',
      'conduttore_cf',
      'immobile_indirizzo',
      'immobile_citta',
      'canone_mensile',
      'data_inizio'
    ],
    template:
      'CONTRATTO DI LOCAZIONE\n\n' +
      'Locatore: {{locatore_nome}} {{locatore_cognome}} (CF {{locatore_cf}})\n' +
      'Conduttore: {{conduttore_nome}} {{conduttore_cognome}} (CF {{conduttore_cf}})\n' +
      'Immobile: {{immobile_indirizzo}}, {{immobile_citta}}\n' +
      'Canone mensile: {{canone_mensile}}\n' +
      'Decorrenza: {{data_inizio}}\n',
    createdAt: new Date().toISOString()
  }
];

const CONTRACTS: ContractRecord[] = [];

const createContractId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

app.get('/api/contract-templates', (req, res) => {
  res.json({ success: true, data: CONTRACT_TEMPLATES });
});

app.get('/api/contract-templates/:id', (req, res) => {
  const template = CONTRACT_TEMPLATES.find(t => t.id === req.params.id);
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template non trovato' });
  }
  res.json({ success: true, data: template });
});

app.get('/api/contracts', (req, res) => {
  const { status, agentId, templateId } = req.query;

  let filtered = [...CONTRACTS];

  if (status) filtered = filtered.filter(c => c.status === String(status));
  if (agentId) filtered = filtered.filter(c => c.agentId === String(agentId));
  if (templateId) filtered = filtered.filter(c => c.templateId === String(templateId));

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ success: true, data: filtered });
});

app.get('/api/contracts/:id', (req, res) => {
  const contract = CONTRACTS.find(c => c.id === req.params.id);
  if (!contract) {
    return res.status(404).json({ success: false, message: 'Contratto non trovato' });
  }
  res.json({ success: true, data: contract });
});

app.post('/api/contracts', (req, res) => {
  const payload = req.body as Partial<ContractRecord>;
  const now = new Date().toISOString();

  const template = payload.templateId
    ? CONTRACT_TEMPLATES.find(t => t.id === String(payload.templateId))
    : undefined;

  const contract: ContractRecord = {
    id: createContractId(),
    templateId: String(payload.templateId || template?.id || ''),
    templateName: String(payload.templateName || template?.name || ''),
    propertyId: payload.propertyId,
    propertyTitle: payload.propertyTitle,
    contactId: payload.contactId,
    contactName: payload.contactName,
    agentId: payload.agentId,
    agentName: payload.agentName,
    status: (payload.status as ContractStatus) || 'DRAFT',
    data: payload.data || {},
    generatedText: payload.generatedText ?? null,
    createdAt: now,
    updatedAt: now
  };

  CONTRACTS.unshift(contract);

  res.status(201).json({ success: true, data: contract });
});

app.put('/api/contracts/:id', (req, res) => {
  const index = CONTRACTS.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Contratto non trovato' });
  }

  const existing = CONTRACTS[index];
  const payload = req.body as Partial<ContractRecord>;
  const now = new Date().toISOString();

  const updated: ContractRecord = {
    ...existing,
    ...payload,
    status: (payload.status as ContractStatus) || existing.status,
    data: payload.data != null ? payload.data : existing.data,
    updatedAt: now
  };

  CONTRACTS[index] = updated;

  res.json({ success: true, data: updated });
});

app.delete('/api/contracts/:id', (req, res) => {
  const index = CONTRACTS.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Contratto non trovato' });
  }

  const [deleted] = CONTRACTS.splice(index, 1);
  res.json({ success: true, data: deleted });
});

app.post('/api/contracts/:id/generate', (req, res) => {
  const index = CONTRACTS.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Contratto non trovato' });
  }

  const contract = CONTRACTS[index];
  const template = CONTRACT_TEMPLATES.find(t => t.id === contract.templateId);

  if (!template) {
    return res.status(404).json({ success: false, message: 'Template non trovato' });
  }

  let generatedText = template.template;
  const data = contract.data || {};

  Object.keys(data).forEach(key => {
    const value = data[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const token = `{{${key}}}`;
      generatedText = generatedText.split(token).join(String(value));
    }
  });

  const now = new Date().toISOString();
  const updated: ContractRecord = {
    ...contract,
    generatedText,
    status: 'COMPLETED',
    updatedAt: now
  };

  CONTRACTS[index] = updated;

  res.json({
    success: true,
    data: updated,
    generatedText
  });
});

// Requests endpoints
app.get('/api/requests', async (req, res) => {
  try {
    const requests = await prisma.request.findMany({
      include: { contact: true, agency: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching requests' });
  }
});

app.post('/api/requests', async (req, res) => {
  try {
    let { agencyId, ...data } = req.body;
    if (!agencyId) {
      const agency = await prisma.agency.findFirst();
      agencyId = agency?.id;
    }
    const newRequest = await prisma.request.create({
      data: { ...data, agencyId }
    });
    try {
      await recomputeMatchesForRequest(newRequest.id, agencyId);
    } catch (matchingError) {
      console.error('Error recomputing matches after request create:', matchingError);
    }
    res.status(201).json({ success: true, data: newRequest, message: 'Request created successfully' });
  } catch (error) {
    console.error('Error creating request:', error);
    res.status(500).json({ success: false, message: 'Error creating request' });
  }
});

app.put('/api/requests/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const existing = await prisma.request.findUnique({
      where: { id: req.params.id },
      select: { id: true, agencyId: true }
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Request not found' });
    if (auth.agencyId && existing.agencyId !== auth.agencyId) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const updated = await prisma.request.update({
      where: { id: req.params.id },
      data: req.body || {}
    });

    try {
      await recomputeMatchesForRequest(updated.id, updated.agencyId);
    } catch (matchingError) {
      console.error('Error recomputing matches after request update:', matchingError);
    }

    res.json({ success: true, data: updated, message: 'Request updated successfully' });
  } catch (error) {
    console.error('Error updating request:', error);
    res.status(500).json({ success: false, message: 'Error updating request' });
  }
});

// Matches endpoints
app.post('/api/matches', async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Deprecated endpoint. Usa /api/matching/for-request/:requestId o /api/matching/for-property/:propertyId'
  });
});

// Reset Data Endpoint
app.post('/api/reset', async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!isAdminRole(auth.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (!auth.agencyId) {
      return res.status(400).json({ success: false, message: 'Agency context missing' });
    }

    const agencyId = auth.agencyId;

    await prisma.$transaction([
      // Zone / task di zona (children first)
      prisma.zoneStreetListingAssignmentHistory.deleteMany({ where: { agencyId } }),
      prisma.zoneStreetListingAction.deleteMany({ where: { agencyId } }),
      prisma.zoneStreetListing.deleteMany({ where: { agencyId } }),
      prisma.zoneStreetListingSnapshot.deleteMany({ where: { agencyId } }),
      prisma.zoneStreetMarketSnapshot.deleteMany({ where: { agencyId } }),
      prisma.zoneStreetWorkLog.deleteMany({ where: { agencyId } }),
      prisma.zoneGroupWorkLog.deleteMany({ where: { agencyId } }),
      prisma.zoneImportJob.deleteMany({ where: { agencyId } }),
      prisma.zoneAssignment.deleteMany({ where: { agencyId } }),
      prisma.zoneStreetGroupMember.deleteMany({ where: { group: { agencyId } } }),
      prisma.zoneStreetGroup.deleteMany({ where: { agencyId } }),
      prisma.zoneStreet.deleteMany({ where: { agencyId } }),
      prisma.agentZone.deleteMany({ where: { agencyId } }),

      // Matching / feedback
      prisma.matchFeedback.deleteMany({ where: { agencyId } }),
      prisma.propertyMatch.deleteMany({
        where: {
          OR: [
            { property: { agencyId } },
            { request: { agencyId } }
          ]
        }
      }),

      // CRM core
      prisma.notification.deleteMany({ where: { agencyId } }),
      prisma.activity.deleteMany({ where: { agencyId } }),
      prisma.appointment.deleteMany({ where: { agencyId } }),
      prisma.request.deleteMany({ where: { agencyId } }),
      prisma.ownerDocument.deleteMany({ where: { contact: { agencyId } } }),
      prisma.contact.deleteMany({ where: { agencyId } }),
      prisma.campaign.deleteMany({ where: { agencyId } }),
      prisma.apimoRecord.deleteMany({ where: { agencyId } }),
      prisma.property.deleteMany({ where: { agencyId } }),

      // Config per agenzia
      prisma.portalConfig.deleteMany({ where: { agencyId } })
    ]);

    res.json({ success: true, message: 'All data reset successfully' });
  } catch (error) {
    console.error('Error resetting data:', error);
    res.status(500).json({ success: false, message: 'Error resetting data' });
  }
});

const shouldStartHttpServer = !IS_VERCEL_RUNTIME;

if (shouldStartHttpServer) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Runtime: ${APP_RUNTIME || 'local'}`);
    console.log(`Database URL: ${process.env.DATABASE_URL}`);
    startProvisioner();
    startPortalSyncErrorMonitor();
    startAppointmentReminderMonitor();
  });
} else {
  console.log(`Serverless bootstrap ready (runtime=${APP_RUNTIME || 'vercel'})`);
}

export { app };
export default app;
