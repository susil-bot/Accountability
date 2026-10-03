import { R2StorageDriver } from '../../src/evidence/r2-storage.driver';
import { LocalStorageDriver } from '../../src/evidence/local-storage.driver';
import { sniff } from '../../src/evidence/file-validation';

const KEY = 'ev/00000000-0000-4000-8000-000000000000/' + 'a'.repeat(48) + '.webp';

describe('R2 storage driver (offline signing)', () => {
  const r2 = new R2StorageDriver({ accountId: 'acc123', bucket: 'evidence', accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'secret' });

  it('presigns a PUT against the private bucket with SigV4 query auth and expiry', async () => {
    const url = new URL(await r2.presignPut(KEY, 'image/webp', 900));
    expect(url.host).toBe('acc123.r2.cloudflarestorage.com');
    expect(url.pathname).toBe(`/evidence/${KEY}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('presigns a GET with a safe content-disposition', async () => {
    const url = new URL(await r2.presignGet(KEY, 600, { filename: 'a"b\r\n.webp', contentType: 'image/webp' }));
    expect(url.searchParams.get('response-content-disposition')).toBe('inline; filename="ab.webp"');
  });

  it('refuses keys that are not ours', async () => {
    await expect(r2.presignPut('../etc/passwd', 'image/webp', 60)).rejects.toThrow('Invalid storage key');
  });
});

describe('Local storage driver signatures', () => {
  const local = new LocalStorageDriver('/tmp/acc-storage-test', 'sign-secret');

  it('accepts its own signature only for the same op, key and unexpired time', async () => {
    const url = new URL(await local.presignPut(KEY, 'image/webp', 60), 'http://x');
    const exp = Number(url.searchParams.get('exp'));
    const sig = url.searchParams.get('sig')!;
    expect(local.verify('put', KEY, exp, sig)).toBe(true);
    expect(local.verify('get', KEY, exp, sig)).toBe(false);
    expect(local.verify('put', KEY.replace('a', 'b'), exp, sig)).toBe(false);
    expect(local.verify('put', KEY, Math.floor(Date.now() / 1000) - 1, local.sign('put', KEY, Math.floor(Date.now() / 1000) - 1))).toBe(false);
  });
});

describe('content sniffing', () => {
  it('identifies real file types from magic bytes', () => {
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniff(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary'))).toBe('image/webp');
    expect(sniff(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(sniff(Buffer.from('<html>'))).toBeNull();
  });
});
