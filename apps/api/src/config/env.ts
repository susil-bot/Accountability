/** Centralised, validated configuration. Fails fast on boot when required values are missing. */
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProd: boolean;
  port: number;
  appUrl: string;
  databaseUrl: string;
  jobsEnabled: boolean;
  jwtSecret: string;
  sessionTtlDays: number;
  authRateLimit: number;
  storageDriver: 'local' | 'r2' | 's3';
  storageLocalDir: string;
  storageSigningSecret: string;
  r2: { accountId: string; bucket: string; accessKeyId: string; secretAccessKey: string } | null;
  /** Any S3-compatible store, proxied through the API (e.g. Supabase Storage). */
  s3: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string } | null;
  /** Trust Cloudflare's CF-Connecting-IP header for client IPs (only when traffic always arrives via Cloudflare). */
  trustCloudflare: boolean;
  /** Shared secret the Cloudflare Pages proxy sends; when set, requests without it are rejected. */
  originSecret: string | undefined;
  swaggerEnabled: boolean;
  /** Web Push (VAPID). Push is disabled when the keys are not set; in-app notifications still work. */
  push: { publicKey: string; privateKey: string; subject: string } | null;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export function loadConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];
  const isProd = nodeEnv === 'production';
  const jwtSecret = required('JWT_SECRET');
  if (isProd && (jwtSecret.length < 32 || jwtSecret.startsWith('change-me'))) {
    throw new Error('JWT_SECRET must be a strong random value (≥ 32 chars) in production');
  }
  if (isProd && process.env.ORIGIN_SECRET !== undefined && process.env.ORIGIN_SECRET.length < 32) {
    throw new Error('ORIGIN_SECRET must be at least 32 random characters');
  }
  const storageDriver = (process.env.STORAGE_DRIVER ?? 'local') as AppConfig['storageDriver'];
  if (!['local', 'r2', 's3'].includes(storageDriver)) throw new Error('STORAGE_DRIVER must be "local", "r2" or "s3"');
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  if (!Number.isInteger(port) || port <= 0) throw new Error('API_PORT must be a positive integer');
  return {
    nodeEnv,
    isProd,
    port,
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
    databaseUrl: required('DATABASE_URL'),
    jobsEnabled: (process.env.JOBS_ENABLED ?? 'true') !== 'false',
    jwtSecret,
    sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 7),
    authRateLimit: Number(process.env.AUTH_RATE_LIMIT ?? 10),
    storageDriver,
    storageLocalDir: process.env.STORAGE_LOCAL_DIR ?? './storage',
    storageSigningSecret: process.env.STORAGE_SIGNING_SECRET ?? jwtSecret,
    r2:
      storageDriver === 'r2'
        ? { accountId: required('R2_ACCOUNT_ID'), bucket: required('STORAGE_BUCKET'), accessKeyId: required('STORAGE_ACCESS_KEY'), secretAccessKey: required('STORAGE_SECRET_KEY') }
        : null,
    s3:
      storageDriver === 's3'
        ? { endpoint: required('S3_ENDPOINT'), region: process.env.S3_REGION || 'us-east-1', bucket: required('STORAGE_BUCKET'), accessKeyId: required('STORAGE_ACCESS_KEY'), secretAccessKey: required('STORAGE_SECRET_KEY') }
        : null,
    trustCloudflare: process.env.TRUST_CLOUDFLARE === 'true',
    originSecret: process.env.ORIGIN_SECRET || undefined,
    swaggerEnabled: !isProd || process.env.SWAGGER_ENABLED === 'true',
    push:
      process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
        ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject: process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com' }
        : null,
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
