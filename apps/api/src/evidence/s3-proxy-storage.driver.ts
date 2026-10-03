import { Readable } from 'node:stream';
import { AwsClient } from 'aws4fetch';
import { KEY_PATTERN, ObjectInfo } from './storage.types';
import { ProxiedStorageDriver, readCapped } from './proxied-storage.driver';

export interface S3ProxyConfig {
  /** S3 endpoint without the bucket, e.g. https://<ref>.supabase.co/storage/v1/s3 */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Any S3-compatible store (Supabase Storage, Backblaze B2, MinIO, R2…) behind the API. The browser only ever
 * talks to our own signed `/api/v1/storage/object` URLs, so the bucket stays private and needs no CORS rules.
 * Path-style addressing: <endpoint>/<bucket>/<key>.
 */
export class S3ProxyStorageDriver extends ProxiedStorageDriver {
  private readonly client: AwsClient;
  private readonly base: string;

  constructor(cfg: S3ProxyConfig, signingSecret: string) {
    super(signingSecret);
    this.client = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, service: 's3', region: cfg.region });
    this.base = `${cfg.endpoint.replace(/\/$/, '')}/${cfg.bucket}`;
  }

  private objectUrl(key: string) {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    return `${this.base}/${key}`;
  }

  async write(key: string, body: Readable, maxBytes: number, contentType = 'application/octet-stream') {
    const url = this.objectUrl(key);
    // Signed links are single-use: refuse to overwrite an existing object.
    if (await this.head(key)) throw Object.assign(new Error('Object exists'), { code: 'EEXIST' });
    const bytes = await readCapped(body, maxBytes);
    const res = await this.client.fetch(url, { method: 'PUT', body: bytes, headers: { 'Content-Type': contentType, 'Content-Length': String(bytes.length) } });
    if (!res.ok) throw new Error(`S3 PUT failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return bytes.length;
  }

  async openStream(key: string): Promise<Readable> {
    const res = await this.client.fetch(this.objectUrl(key));
    if (!res.ok || !res.body) throw Object.assign(new Error(`S3 GET failed: ${res.status}`), { code: res.status === 404 ? 'ENOENT' : 'EIO' });
    return Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
  }

  async head(key: string): Promise<ObjectInfo | null> {
    const res = await this.client.fetch(this.objectUrl(key), { method: 'HEAD' });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`S3 HEAD failed: ${res.status}`);
    return { size: Number(res.headers.get('content-length') ?? 0) };
  }

  async readStart(key: string, bytes: number) {
    const res = await this.client.fetch(this.objectUrl(key), { headers: { Range: `bytes=0-${bytes - 1}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 GET failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer()).subarray(0, bytes);
  }

  async delete(key: string) {
    const res = await this.client.fetch(this.objectUrl(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE failed: ${res.status}`);
  }
}
