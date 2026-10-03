/**
 * Single source of truth for the web app's security headers.
 * Used by next.config (dev server) and written to public/_headers for Cloudflare Pages (production).
 */
export function securityHeaders({ prod }) {
  const csp = [
    "default-src 'self'",
    // 'unsafe-inline' scripts: nonce-based CSP needs per-request SSR, which the static export doesn't have.
    `script-src 'self' 'unsafe-inline'${prod ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    // blob: for local image previews; https: for signed evidence URLs served from R2.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // https: for direct uploads to signed R2 URLs.
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    ...(prod ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
  ];
}
