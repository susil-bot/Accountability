import { AwsClient } from 'aws4fetch';
import { KEY_PATTERN, ObjectInfo, StorageDriver } from './storage.types';

/**
 * Cloudflare R2 driver via the S3-compatible API (presigned URLs signed with SigV4 by aws4fetch).
 * The bucket stays private; the browser uploads and views through short-lived signed URLs.
 * The R2 bucket needs a CORS rule allowing PUT/GET from the web origin with the Content-Type header.
 */
export class R2StorageDriver implements StorageDriver {
  private readonly client: AwsClient;
  private readonly base: string;

  constructor(cfg: { accountId: string; bucket: string; accessKeyId: string; secretAccessKey: string }) {
    this.client = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, service: 's3', region: 'auto' });
    this.base = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}`;
  }

  private objectUrl(key: string) {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    return `${this.base}/${key}`;
  }

  private async presign(method: 'PUT' | 'GET', key: string, expiresSec: number, query: Record<string, string> = {}) {
    const url = new URL(this.objectUrl(key));
    url.searchParams.set('X-Amz-Expires', String(expiresSec));
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const signed = await this.client.sign(new Request(url, { method }), { aws: { signQuery: true } });
    return signed.url;
  }

  presignPut(key: string, _contentType: string, expiresSec: number) {
    return this.presign('PUT', key, expiresSec);
  }

  presignGet(key: string, expiresSec: number, opts: { filename?: string; contentType?: string } = {}) {
    const q: Record<string, string> = {};
    if (opts.filename) q['response-content-disposition'] = `inline; filename="${opts.filename.replace(/["\\\r\n]/g, '')}"`;
    if (opts.contentType) q['response-content-type'] = opts.contentType;
    return this.presign('GET', key, expiresSec, q);
  }

  async head(key: string): Promise<ObjectInfo | null> {
    const res = await this.client.fetch(this.objectUrl(key), { method: 'HEAD' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 HEAD failed: ${res.status}`);
    return { size: Number(res.headers.get('content-length') ?? 0) };
  }

  async readStart(key: string, bytes: number) {
    const res = await this.client.fetch(this.objectUrl(key), { headers: { Range: `bytes=0-${bytes - 1}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 GET failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string) {
    const res = await this.client.fetch(this.objectUrl(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE failed: ${res.status}`);
  }
}
