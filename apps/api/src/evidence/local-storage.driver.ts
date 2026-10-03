import { createReadStream, createWriteStream, promises as fs, type ReadStream } from 'node:fs';
import * as path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { KEY_PATTERN, ObjectInfo } from './storage.types';
import { ProxiedStorageDriver } from './proxied-storage.driver';

/**
 * Local-disk driver that behaves like R2 presigned URLs: the API exposes `/api/v1/storage/object`
 * accepting PUT/GET only with a valid HMAC signature + expiry. Used in development, tests and single-VM installs.
 */
export class LocalStorageDriver extends ProxiedStorageDriver {
  constructor(
    private readonly root: string,
    secret: string,
  ) {
    super(secret);
  }

  async init() {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
  }

  private file(key: string) {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    const p = path.join(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Invalid storage key');
    return p;
  }

  /** Stream an upload body to disk, aborting past `maxBytes`. Never overwrites an existing object. */
  async write(key: string, body: Readable, maxBytes: number) {
    const target = this.file(key);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    let seen = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        seen += chunk.length;
        if (seen > maxBytes) cb(Object.assign(new Error('Upload exceeds the size limit'), { code: 'TOO_LARGE' }));
        else cb(null, chunk);
      },
    });
    try {
      await pipeline(body, limit, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
    } catch (e) {
      // Never delete an object we didn't create (a second PUT on a used link fails with EEXIST).
      if ((e as { code?: string }).code !== 'EEXIST') await fs.rm(target, { force: true });
      throw e;
    }
    return seen;
  }

  open(key: string): ReadStream {
    return createReadStream(this.file(key));
  }

  async openStream(key: string) {
    return this.open(key);
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const st = await fs.stat(this.file(key));
      return { size: st.size };
    } catch {
      return null;
    }
  }

  async readStart(key: string, bytes: number) {
    let fh: fs.FileHandle | undefined;
    try {
      fh = await fs.open(this.file(key), 'r');
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fh.read(buf, 0, bytes, 0);
      return buf.subarray(0, bytesRead);
    } catch {
      return null;
    } finally {
      await fh?.close();
    }
  }

  async delete(key: string) {
    await fs.rm(this.file(key), { force: true });
  }
}
