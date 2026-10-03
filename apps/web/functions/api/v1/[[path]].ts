/**
 * Cloudflare Pages Function: proxies /api/v1/* to the API so the browser stays same-origin and the session
 * cookie stays first-party.
 *
 * Pages project settings → Environment variables (Production):
 *   API_ORIGIN     https origin of the API server, e.g. https://141-147-1-2.sslip.io
 *   ORIGIN_SECRET  same value as the API's ORIGIN_SECRET (encrypt it); the API rejects requests without it
 */
interface Env {
  API_ORIGIN: string;
  ORIGIN_SECRET?: string;
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (!env.API_ORIGIN) return new Response(JSON.stringify({ success: false, error: { code: 'MISCONFIGURED', message: 'API_ORIGIN is not set.' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, env.API_ORIGIN);
  const headers = new Headers(request.headers);
  // Never let a browser supply the trust headers itself.
  headers.delete('X-Origin-Secret');
  headers.delete('X-Client-IP');
  headers.set('X-Forwarded-Host', url.host);
  headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) headers.set('X-Client-IP', ip);
  if (env.ORIGIN_SECRET) headers.set('X-Origin-Secret', env.ORIGIN_SECRET);
  const init: RequestInit = { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' };
  // Streaming request bodies need duplex in the Workers runtime.
  (init as RequestInit & { duplex?: string }).duplex = 'half';
  try {
    return await fetch(target, init);
  } catch {
    return new Response(JSON.stringify({ success: false, error: { code: 'API_UNREACHABLE', message: 'The service is temporarily unavailable. Please try again in a minute.' } }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
