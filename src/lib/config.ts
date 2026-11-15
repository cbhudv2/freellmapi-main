const DEFAULT_RPM = 120;
const DEFAULT_REQUEST_BODY_LIMIT_MB = 25;

function nonNegativeInteger(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export interface Config {
  port: number | string;
  host: string;
  dbPath: string | null;
  proxyRateLimitRpm: number;
  requestBodyLimitBytes: number;
  nodeEnv: string;
  trustProxy: boolean | number | string[];
  allowedHosts: string[];
}

export function loadConfig(): Config {
  return {
    port: process.env.PORT ?? 3001,
    host: process.env.HOST ?? '::',
    dbPath: process.env.FREEAPI_DB_PATH?.trim() || null,
    proxyRateLimitRpm: nonNegativeInteger(process.env.PROXY_RATE_LIMIT_RPM, DEFAULT_RPM),
    requestBodyLimitBytes:
      Math.max(1, nonNegativeInteger(process.env.REQUEST_BODY_LIMIT_MB, DEFAULT_REQUEST_BODY_LIMIT_MB)) *
      1024 *
      1024,
    nodeEnv: process.env.NODE_ENV ?? 'development',
    trustProxy: parseTrustProxy(),
    allowedHosts: (process.env.ALLOWED_HOSTS ?? '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  };
}

function parseTrustProxy(): boolean | number | string[] {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw || raw.toLowerCase() === 'false' || raw.toLowerCase() === 'no') return false;
  if (raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes') return true;
  if (/^\d+$/.test(raw)) return Number(raw) || false;
  return raw.split(',').map(value => value.trim()).filter(Boolean);
}
