type SecretManagerConfig = {
  baseUrl: string | null;
  apiKey: string | null;
  requestTimeoutMs: number;
  maxRetries: number;
};

const config: SecretManagerConfig = {
  baseUrl: (process.env.SECRET_MANAGER_BASE_URL || '').trim() || null,
  apiKey: (process.env.SECRET_MANAGER_API_KEY || '').trim() || null,
  requestTimeoutMs: Number(process.env.SECRET_MANAGER_TIMEOUT_MS || 5000),
  maxRetries: Number(process.env.SECRET_MANAGER_MAX_RETRIES || 3)
};

function hasRemoteBackend() {
  return !!config.baseUrl;
}

const inMemorySecrets = new Map<string, string>();

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestWithRetry(
  path: string,
  options: { method: 'GET' | 'PUT'; body?: any }
): Promise<any> {
  if (!config.baseUrl) {
    return null;
  }

  const url = new URL(path.startsWith('/') ? path : `/${path}`, config.baseUrl);

  let lastError: any = null;
  for (let attempt = 0; attempt < config.maxRetries; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      };

      if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(url.toString(), {
        method: options.method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      } as any);

      clearTimeout(timeout);

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
        const message = json?.message || text || `Secret manager error ${response.status}`;
        throw new Error(String(message));
      }

      return json;
    } catch (error: any) {
      lastError = error;
      if (attempt < config.maxRetries - 1) {
        await delay(200 * (attempt + 1));
        continue;
      }
      throw lastError;
    }
  }

  return null;
}

export async function saveSecret(key: string, value: Record<string, string>): Promise<void> {
  const payload = {
    key,
    value
  };

  if (hasRemoteBackend()) {
    await requestWithRetry('/secrets', {
      method: 'PUT',
      body: payload
    });
    return;
  }

  inMemorySecrets.set(key, JSON.stringify(value));
}

export async function getSecret(key: string): Promise<Record<string, string> | null> {
  if (hasRemoteBackend()) {
    const json = await requestWithRetry(`/secrets/${encodeURIComponent(key)}`, {
      method: 'GET'
    });
    if (!json || typeof json !== 'object' || json.value == null) {
      return null;
    }
    const value = json.value;
    if (typeof value === 'object' && value !== null) {
      return value as Record<string, string>;
    }
    return null;
  }

  const stored = inMemorySecrets.get(key);
  if (!stored) {
    return null;
  }
  try {
    const parsed = JSON.parse(stored);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, string>;
    }
  } catch {
    return null;
  }
  return null;
}
