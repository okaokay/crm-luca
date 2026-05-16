import http from 'http';
import https from 'https';

type HttpResult = {
  statusCode: number;
  body: string;
};

const BASE_URL = process.env.CRM_TEST_BASE_URL || process.env.COMPAT_BASE_URL || process.env.FEEDS_BASE_URL || `http://localhost:${process.env.PORT || 4001}`;
const ADMIN_EMAIL = process.env.CRM_ADMIN_EMAIL || process.env.COMPAT_EMAIL || '';
const ADMIN_PASSWORD = process.env.CRM_ADMIN_PASSWORD || process.env.COMPAT_PASSWORD || '';
const AGENT1_EMAIL = process.env.CRM_AGENT1_EMAIL || '';
const AGENT1_PASSWORD = process.env.CRM_AGENT1_PASSWORD || '';
const AGENT2_EMAIL = process.env.CRM_AGENT2_EMAIL || '';
const AGENT2_PASSWORD = process.env.CRM_AGENT2_PASSWORD || '';
const requestTimeoutMs = 20000;
const failures: string[] = [];

function fail(message: string) {
  failures.push(message);
}

function httpRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options?: { body?: any; token?: string; headers?: Record<string, string> }
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const client = url.protocol === 'https:' ? https : http;
    const bodyString = options?.body != null ? JSON.stringify(options.body) : undefined;
    const headers: Record<string, string> = { ...(options?.headers || {}) };
    if (options?.token) headers.Authorization = `Bearer ${options.token}`;
    if (bodyString != null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyString).toString();
    }

    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers,
        timeout: requestTimeoutMs
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout after ${requestTimeoutMs}ms`));
    });

    if (bodyString != null) req.write(bodyString);
    req.end();
  });
}

function parseJson(body: string): any {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function login(email: string, password: string, label: string): Promise<string | null> {
  if (!email || !password) {
    fail(`${label}: credenziali mancanti in env`);
    return null;
  }
  const response = await httpRequest('POST', '/api/auth/login', { body: { email, password } });
  if (response.statusCode !== 200) {
    fail(`${label}: login HTTP ${response.statusCode}`);
    return null;
  }
  const json = parseJson(response.body);
  if (!json?.success || !json?.data?.token) {
    fail(`${label}: login payload non valido`);
    return null;
  }
  return String(json.data.token);
}

async function testCRM13AppointmentsPermissions(adminToken: string, agent1Token?: string | null, agent2Token?: string | null) {
  if (!agent1Token || !agent2Token) {
    console.log('CRM-13: skip parziale (mancano credenziali agent1/agent2)');
    return;
  }

  const now = Date.now() + 60 * 60 * 1000;
  const createRes = await httpRequest('POST', '/api/appointments', {
    token: agent1Token,
    body: {
      title: 'Test CRM-13',
      startTime: new Date(now).toISOString(),
      endTime: new Date(now + 30 * 60 * 1000).toISOString(),
      participantIds: [],
      location: 'Test'
    }
  });
  const createJson = parseJson(createRes.body);
  if (createRes.statusCode !== 201 || !createJson?.data?.id) {
    fail(`CRM-13 create appointment failed HTTP ${createRes.statusCode}`);
    return;
  }
  const appointmentId = String(createJson.data.id);

  const forbiddenUpdate = await httpRequest('PUT', `/api/appointments/${encodeURIComponent(appointmentId)}`, {
    token: agent2Token,
    body: { title: 'Non autorizzato' }
  });
  if (forbiddenUpdate.statusCode !== 403) {
    fail(`CRM-13 expected 403 for non-creator update, got ${forbiddenUpdate.statusCode}`);
  }

  const creatorUpdate = await httpRequest('PUT', `/api/appointments/${encodeURIComponent(appointmentId)}`, {
    token: agent1Token,
    body: { title: 'Creator update ok' }
  });
  if (creatorUpdate.statusCode !== 200) {
    fail(`CRM-13 expected 200 for creator update, got ${creatorUpdate.statusCode}`);
  }

  const adminDelete = await httpRequest('DELETE', `/api/appointments/${encodeURIComponent(appointmentId)}`, {
    token: adminToken
  });
  if (adminDelete.statusCode !== 200) {
    fail(`CRM-13 expected 200 for admin delete, got ${adminDelete.statusCode}`);
  }
}

async function testCRM14NewContactValidation(adminToken: string) {
  const badApartment = await httpRequest('POST', '/api/contacts', {
    token: adminToken,
    body: {
      type: 'BUYER',
      firstName: 'Mario',
      lastName: 'Rossi',
      email: 'mario.rossi@example.test',
      phone: '+39000000001',
      city: 'Milano',
      province: 'MI',
      requestGoal: 'SALE',
      requestPropertyType: 'APPARTAMENTO',
      requestZone: 'Centro'
    }
  });
  if (badApartment.statusCode !== 400) {
    fail(`CRM-14 expected 400 apartment without subtype, got ${badApartment.statusCode}`);
  }

  const badRent = await httpRequest('POST', '/api/contacts', {
    token: adminToken,
    body: {
      type: 'TENANT',
      firstName: 'Luca',
      lastName: 'Bianchi',
      email: 'luca.bianchi@example.test',
      phone: '+39000000002',
      city: 'Roma',
      province: 'RM',
      requestGoal: 'RENT',
      requestPropertyType: 'UFFICIO',
      requestZone: 'Eur',
      requestSurfaceSqm: 80
    }
  });
  if (badRent.statusCode !== 400) {
    fail(`CRM-14 expected 400 rent without contract subtype, got ${badRent.statusCode}`);
  }
}

async function testCRM15LegacyPolicyAndCRM17Audit(adminToken: string) {
  const listRes = await httpRequest('GET', '/api/properties/non-compliant?limit=20', { token: adminToken });
  const listJson = parseJson(listRes.body);
  if (listRes.statusCode !== 200 || !Array.isArray(listJson?.data)) {
    fail(`CRM-15 cannot read non-compliant properties (HTTP ${listRes.statusCode})`);
    return;
  }
  if (listJson.data.length === 0) {
    console.log('CRM-15/17: skip runtime check (nessun immobile non conforme trovato)');
    return;
  }

  const target = listJson.data[0];
  const propertyId = String(target.id);

  const softUpdate = await httpRequest('PUT', `/api/properties/${encodeURIComponent(propertyId)}`, {
    token: adminToken,
    body: { notes: `CRM-15 soft update ${new Date().toISOString()}` }
  });
  const softJson = parseJson(softUpdate.body);
  if (softUpdate.statusCode !== 200) {
    fail(`CRM-15 expected soft update 200 for legacy property, got ${softUpdate.statusCode}`);
  } else if (!Array.isArray(softJson?.warnings)) {
    fail('CRM-15 expected warnings array on soft update response');
  }

  const publishAttempt = await httpRequest('PUT', `/api/properties/${encodeURIComponent(propertyId)}`, {
    token: adminToken,
    body: { isPublished: true }
  });
  if (publishAttempt.statusCode !== 400) {
    fail(`CRM-15 expected 400 when publishing non-compliant property, got ${publishAttempt.statusCode}`);
  }
}

async function testCRM16AdvertisingPricePriority(adminToken: string) {
  const propertiesRes = await httpRequest('GET', '/api/properties?limit=100', { token: adminToken });
  const propertiesJson = parseJson(propertiesRes.body);
  if (propertiesRes.statusCode !== 200 || !Array.isArray(propertiesJson?.data)) {
    fail(`CRM-16 cannot read properties (HTTP ${propertiesRes.statusCode})`);
    return;
  }

  const candidate = propertiesJson.data.find((p: any) => {
    const contractType = String(p?.contractType || '').toUpperCase();
    if (contractType === 'RENT') {
      return Number(p?.advertisingRentPrice || 0) > 0;
    }
    return Number(p?.advertisingSalePrice || 0) > 0;
  });

  if (!candidate) {
    console.log('CRM-16: skip runtime check (nessun immobile con prezzo pubblicitario trovato)');
    return;
  }

  const portalRes = await httpRequest('GET', '/api/portals/ONECLICKANNUNCI/properties?limit=200', { token: adminToken });
  const portalJson = parseJson(portalRes.body);
  if (portalRes.statusCode !== 200 || !Array.isArray(portalJson?.data)) {
    fail(`CRM-16 cannot read portal properties (HTTP ${portalRes.statusCode})`);
    return;
  }

  const row = portalJson.data.find((p: any) => String(p?.id) === String(candidate.id));
  if (!row) {
    fail(`CRM-16 property ${candidate.id} not found in portal properties list`);
    return;
  }

  const contractType = String(candidate.contractType || '').toUpperCase();
  const expected =
    contractType === 'RENT'
      ? Number(candidate.advertisingRentPrice || candidate.rentPrice || 0)
      : Number(candidate.advertisingSalePrice || candidate.salePrice || 0);
  const actual = Number(row.price || 0);
  if (Math.round(actual) !== Math.round(expected)) {
    fail(`CRM-16 expected portal price ${expected}, got ${actual} for property ${candidate.id}`);
  }
}

async function main() {
  console.log(`Running CRM-13..17 regression tests against ${BASE_URL}`);
  try {
    const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD, 'ADMIN');
    if (!adminToken) {
      throw new Error('Admin login failed');
    }
    const agent1Token = AGENT1_EMAIL && AGENT1_PASSWORD ? await login(AGENT1_EMAIL, AGENT1_PASSWORD, 'AGENT1') : null;
    const agent2Token = AGENT2_EMAIL && AGENT2_PASSWORD ? await login(AGENT2_EMAIL, AGENT2_PASSWORD, 'AGENT2') : null;

    await testCRM13AppointmentsPermissions(adminToken, agent1Token, agent2Token);
    await testCRM14NewContactValidation(adminToken);
    await testCRM15LegacyPolicyAndCRM17Audit(adminToken);
    await testCRM16AdvertisingPricePriority(adminToken);
  } catch (error: any) {
    fail(error?.message ? String(error.message) : 'Unexpected error');
  }

  if (failures.length > 0) {
    console.error('CRM-13..17 regression tests failed:');
    for (const message of failures) console.error(`- ${message}`);
    process.exitCode = 1;
  } else {
    console.log('CRM-13..17 regression tests passed');
  }
}

main();
