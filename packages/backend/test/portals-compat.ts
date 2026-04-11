import http from 'http';
import https from 'https';

type HttpResult = {
  statusCode: number;
  body: string;
};

const BASE_URL = process.env.COMPAT_BASE_URL || process.env.FEEDS_BASE_URL || `http://localhost:${process.env.PORT || 4001}`;
const COMPAT_EMAIL = process.env.COMPAT_EMAIL || '';
const COMPAT_PASSWORD = process.env.COMPAT_PASSWORD || '';
const requestTimeoutMs = 15000;
const failures: string[] = [];

function fail(message: string) {
  failures.push(message);
}

function httpRequest(
  method: 'GET' | 'POST',
  path: string,
  options?: { body?: any; headers?: Record<string, string> }
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const client = url.protocol === 'https:' ? https : http;
    const bodyString = options?.body != null ? JSON.stringify(options.body) : undefined;
    const headers: Record<string, string> = { ...(options?.headers || {}) };
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

async function login(): Promise<string | null> {
  if (!COMPAT_EMAIL || !COMPAT_PASSWORD) {
    fail('COMPAT_EMAIL / COMPAT_PASSWORD mancanti');
    return null;
  }
  const response = await httpRequest('POST', '/api/auth/login', { body: { email: COMPAT_EMAIL, password: COMPAT_PASSWORD } });
  if (response.statusCode !== 200) {
    fail(`Login failed HTTP ${response.statusCode}`);
    return null;
  }
  const json = JSON.parse(response.body);
  if (!json?.success || !json?.data?.token) {
    fail('Login payload invalido');
    return null;
  }
  return String(json.data.token);
}

async function testPortalList(token: string) {
  const response = await httpRequest('GET', '/api/portals', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.statusCode !== 200) {
    fail(`/api/portals HTTP ${response.statusCode}`);
    return;
  }
  const json = JSON.parse(response.body);
  if (!json?.success || !Array.isArray(json?.data?.portals)) {
    fail('/api/portals payload invalido');
    return;
  }
  const portals = json.data.portals;
  if (portals.length !== 1) {
    fail(`/api/portals expected 1 portal, got ${portals.length}`);
  }
  const oneclick = portals.find((p: any) => String(p.id) === 'ONECLICKANNUNCI');
  if (!oneclick) {
    fail('ONECLICKANNUNCI non presente in /api/portals');
    return;
  }
  if (String(oneclick.kind) !== 'FEED_PULL') {
    fail(`ONECLICKANNUNCI kind expected FEED_PULL, got ${oneclick.kind}`);
  }
  if (!String(oneclick.feedUrl || '').includes('/feeds/1clickannunci.xml')) {
    fail('ONECLICKANNUNCI feedUrl non valido');
  }
}

async function main() {
  console.log(`Running portals compatibility test against ${BASE_URL}`);
  try {
    const token = await login();
    if (token) await testPortalList(token);
  } catch (error: any) {
    fail(error?.message ? String(error.message) : 'Unexpected error');
  }

  if (failures.length > 0) {
    console.error('Portals compatibility tests failed:');
    for (const message of failures) console.error(`- ${message}`);
    process.exitCode = 1;
  } else {
    console.log('Portals compatibility tests passed');
  }
}

main();

