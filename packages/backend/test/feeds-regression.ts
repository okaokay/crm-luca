import http from 'http';
import https from 'https';

type HttpResult = {
  statusCode: number;
  body: string;
};

const BASE_URL = process.env.FEEDS_BASE_URL || `http://localhost:${process.env.PORT || 4001}`;
const requestTimeoutMs = 15000;
const failures: string[] = [];

function fail(message: string) {
  failures.push(message);
}

function httpGet(path: string): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const client = url.protocol === 'https:' ? https : http;

    const req = client.get(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        timeout: requestTimeoutMs
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout after ${requestTimeoutMs}ms`));
    });
  });
}

function assertIncludes(body: string, expected: string, label: string) {
  if (!body.includes(expected)) {
    fail(`${label}: expected body to include "${expected}"`);
  }
}

async function testOneClickFeed() {
  const result = await httpGet('/feeds/1clickannunci.xml?all=1');
  if (result.statusCode !== 200) {
    fail(`1click feed status expected 200, got ${result.statusCode}`);
    return;
  }

  const body = result.body.trim();
  if (!body) {
    fail('1click feed is empty');
    return;
  }

  assertIncludes(body, '<?xml version="1.0"', 'xml declaration');
  assertIncludes(body, '<annunci>', 'root open');
  assertIncludes(body, '</annunci>', 'root close');
  assertIncludes(body, '<annuncio>', 'at least one annuncio');

  const annuncioEnd = body.indexOf('</annuncio>');
  if (annuncioEnd > 0) {
    const first = body.slice(0, annuncioEnd);
    assertIncludes(first, '<idtipologiaimmobile>', 'required idtipologiaimmobile');
    assertIncludes(first, '<idtipologiaannuncio>', 'required idtipologiaannuncio');
    assertIncludes(first, '<comune_istat>', 'required comune_istat');
    assertIncludes(first, '<riferimento>', 'required riferimento');
    assertIncludes(first, '<descrizione>', 'required descrizione');
    assertIncludes(first, '<data_inserimento>', 'required data_inserimento');
    assertIncludes(first, '<data_aggiornamento>', 'required data_aggiornamento');
  }
}

async function testLegacyFeedsAreGone() {
  const endpoints = [
    '/feeds/trovit.xml',
    '/feeds/meta_catalog.csv',
    '/feeds/gestionaleimmobiliare.xml',
    '/feeds/gestionale_sync.tar.gz'
  ];
  for (const endpoint of endpoints) {
    const result = await httpGet(endpoint);
    if (result.statusCode !== 410) {
      fail(`${endpoint} expected 410, got ${result.statusCode}`);
    }
  }
}

async function main() {
  console.log(`Running feed regression tests against ${BASE_URL}`);
  try {
    await testOneClickFeed();
    await testLegacyFeedsAreGone();
  } catch (error: any) {
    fail(error?.message ? String(error.message) : 'Unexpected error');
  }

  if (failures.length > 0) {
    console.error('Feed regression tests failed:');
    for (const message of failures) console.error(`- ${message}`);
    process.exitCode = 1;
  } else {
    console.log('Feed regression tests passed');
  }
}

main();

