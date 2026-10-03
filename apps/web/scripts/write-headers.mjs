// Writes out/_headers for Cloudflare Pages from the shared security header policy.
import { writeFileSync, existsSync } from 'node:fs';
import { securityHeaders } from '../security-headers.mjs';

if (!existsSync('out')) {
  console.error('out/ not found — run next build first');
  process.exit(1);
}
const lines = ['/*', ...securityHeaders({ prod: true }).map((h) => `  ${h.key}: ${h.value}`), '', '/_next/static/*', '  Cache-Control: public, max-age=31536000, immutable', ''];
writeFileSync('out/_headers', lines.join('\n'));
console.log('wrote out/_headers');
