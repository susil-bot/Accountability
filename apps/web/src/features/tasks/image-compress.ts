/**
 * Client-side image preparation before upload (spec §37 + plan "Image uploads"):
 *  - resize to ≤ 1600 px on the long edge and make a 320 px thumbnail
 *  - re-encode as WebP (JPEG where the browser can't encode WebP)
 *  - re-encoding drops EXIF metadata, including GPS location
 *  - honours EXIF orientation so photos aren't sideways
 * A 3–5 MB phone photo typically becomes 200–400 KB.
 */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf';

export interface PreparedUpload {
  main: Blob;
  mainType: string;
  thumb: Blob | null;
  thumbType: string | null;
  name: string;
}

async function encode(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const toBlob = (type: string): Promise<Blob | null> =>
    canvas instanceof HTMLCanvasElement
      ? new Promise((r) => canvas.toBlob(r, type, quality))
      : (canvas as OffscreenCanvas).convertToBlob({ type, quality });
  const webp = await toBlob('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob('image/jpeg');
  if (!jpeg) throw new Error('Could not encode the image');
  return jpeg;
}

export async function prepareUpload(file: File): Promise<PreparedUpload> {
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Files must be 10 MB or smaller.');
  if (file.type === 'application/pdf') return { main: file, mainType: file.type, thumb: null, thumbType: null, name: file.name };
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) throw new Error('Allowed file types: jpg, png, webp or pdf.');

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const [main, thumb] = await Promise.all([encode(bitmap, 1600, 0.8), encode(bitmap, 320, 0.7)]);
    const ext = main.type === 'image/webp' ? 'webp' : 'jpg';
    return { main, mainType: main.type, thumb, thumbType: thumb.type, name: file.name.replace(/\.[^.]+$/, '') + '.' + ext };
  } finally {
    bitmap.close();
  }
}
