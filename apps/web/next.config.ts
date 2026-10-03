import type { NextConfig } from 'next';
import { securityHeaders } from './security-headers.mjs';

/**
 * Rendering: every route is pre-rendered (SSG) and `next build` emits a static site in `out/`
 * (served by Cloudflare Pages). Signed-in data is fetched client-side. See docs/architecture.md → Rendering.
 *
 * In `next dev` the same app runs with a dev-only rewrite that proxies /api/v1 to the API, mirroring the
 * Cloudflare Pages Function (`functions/api/v1/[[path]].ts`) used in production. The browser therefore always
 * talks to its own origin: first-party cookies, no CORS.
 */
const isBuild = process.env.NODE_ENV === 'production';
const api = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: isBuild ? 'export' : undefined,
  ...(isBuild
    ? {}
    : {
        async rewrites() {
          return [{ source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` }];
        },
        async headers() {
          return [{ source: '/:path*', headers: securityHeaders({ prod: false }) }];
        },
      }),
};

export default nextConfig;
