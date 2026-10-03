/**
 * Evidence file rules (spec §37): jpg/jpeg/png/webp/pdf only, ≤ 10 MB, declared type must match
 * the file's real bytes (magic numbers) — checked AFTER upload, on the stored object.
 */
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 1024 * 1024;
export const MAX_EVIDENCE_PER_TASK = 5;
export const USER_STORAGE_QUOTA_BYTES = Number(process.env.USER_STORAGE_QUOTA_MB ?? 200) * 1024 * 1024;

export const ALLOWED_TYPES = {
  'image/webp': { ext: 'webp', kind: 'IMAGE' },
  'image/jpeg': { ext: 'jpg', kind: 'IMAGE' },
  'image/png': { ext: 'png', kind: 'IMAGE' },
  'application/pdf': { ext: 'pdf', kind: 'FILE' },
} as const;
export type AllowedType = keyof typeof ALLOWED_TYPES;

export const isAllowedType = (t: string): t is AllowedType => t in ALLOWED_TYPES;

/** Detect the real type from the first bytes. */
export function sniff(buf: Buffer): AllowedType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

export function safeFileName(name: string | undefined, fallbackExt: string) {
  const cleaned = (name ?? '').replace(/[^\w.\- ]+/g, '_').trim().slice(0, 120);
  return cleaned || `evidence.${fallbackExt}`;
}
