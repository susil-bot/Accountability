/**
 * Thin client for the REST API. The browser calls same-origin /api/v1/* (proxied by Next),
 * so the httpOnly session cookie flows automatically. Mutations carry the CSRF header.
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

const CSRF = { 'X-Requested-With': 'accountability-web' };

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function api<T>(path: string, opts: { method?: Method; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body || opts.form ? 'POST' : 'GET');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') Object.assign(headers, CSRF);
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { method, headers, body, credentials: 'same-origin', signal: opts.signal, cache: 'no-store' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('NETWORK_ERROR', 'You appear to be offline. Check your connection and try again.', 0);
  }

  let json: { success?: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || !json?.success) {
    const err = json?.error;
    throw new ApiError(err?.code ?? 'HTTP_ERROR', err?.message ?? 'Something went wrong. Please try again.', res.status, err?.details);
  }
  return json.data as T;
}

export const get = <T,>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const patch = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: body ?? {} });
export const put = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body: body ?? {} });
export const del = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });

export function errorMessage(e: unknown) {
  if (e instanceof ApiError) {
    if (e.code === 'VALIDATION_ERROR' && Array.isArray(e.details) && e.details.length) return String(e.details[0]);
    return e.message;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * PUT a file to a pre-signed storage URL (R2 in production, the API's signed blob endpoint locally).
 * Uses XHR for upload progress. Bytes never pass through our API server in production.
 */
export function putToSignedUrl(url: string, body: Blob, contentType: string, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    if (url.startsWith('/')) xhr.setRequestHeader('X-Requested-With', 'accountability-web');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError('UPLOAD_FAILED', 'The upload didn’t finish. Please try again.', xhr.status)));
    xhr.onerror = () => reject(new ApiError('NETWORK_ERROR', 'You appear to be offline. Check your connection and try again.', 0));
    xhr.send(body);
  });
}
