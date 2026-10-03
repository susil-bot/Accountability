import { createHmac, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { KEY_PATTERN, ObjectInfo, StorageDriver } from './storage.types';

/**
 * Base for drivers whose bytes flow through the API (`/api/v1/storage/object`) instead of going straight to the
 * object store: the API hands out HMAC-signed, short-lived URLs to itself, verifies them, and streams to/from the
 * backing store. Used by the local-disk driver and by the S3 proxy driver (hosts without browser-CORS control).
 */
export abstract class ProxiedStorageDriver implements StorageDriver {
  constructor(protected readonly secret: string) {}

  async init(): Promise<void> {}

  sign(op: 'put' | 'get', key: string, exp: number) {
    return createHmac('sha256', this.secret).update(`${op}\n${key}\n${exp}`).digest('base64url');
  }

  verify(op: 'put' | 'get', key: string, exp: number, sig: string) {
    if (!KEY_PATTERN.test(key) || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const a = Buffer.from(this.sign(op, key, exp));
    const b = Buffer.from(String(sig ?? ''));
    return a.length === b.length && timingSafeEqual(a, b);
  }

  protected url(op: 'put' | 'get', key: string, expiresSec: number) {
    const exp = Math.floor(Date.now() / 1000) + expiresSec;
    return `/api/v1/storage/object?op=${op}&key=${encodeURIComponent(key)}&exp=${exp}&sig=${this.sign(op, key, exp)}`;
  }

  async presignPut(key: string, _contentType: string, expiresSec: number) {
    return this.url('put', key, expiresSec);
  }

  async presignGet(key: string, expiresSec: number) {
    return this.url('get', key, expiresSec);
  }

  /** Store an upload, aborting past `maxBytes` (error code TOO_LARGE). Never overwrites (error code EEXIST). */
  abstract write(key: string, body: Readable, maxBytes: number, contentType?: string): Promise<number>;
  /** Stream an object's bytes. */
  abstract openStream(key: string): Promise<Readable>;
  abstract head(key: string): Promise<ObjectInfo | null>;
  abstract readStart(key: string, bytes: number): Promise<Buffer | null>;
  abstract delete(key: string): Promise<void>;
}

/** Read a request body into memory with a hard size cap (uploads are ≤ 10 MB). */
export async function readCapped(body: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let seen = 0;
  for await (const chunk of body) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    seen += b.length;
    if (seen > maxBytes) throw Object.assign(new Error('Upload exceeds the size limit'), { code: 'TOO_LARGE' });
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}
