/**
 * Runs before `npm run dev` so a fresh pull never starts with stale dependencies:
 *  1. if any dependency listed in a package.json isn't installed → `npm install`
 *  2. if prisma/schema.prisma changed since the client was generated → `prisma generate`
 * Both steps are skipped when everything is already up to date (fast path).
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const root = process.cwd();
const workspaces = ['.', 'apps/api', 'apps/web'];

const missing = [];
for (const ws of workspaces) {
  const pkg = JSON.parse(readFileSync(join(root, ws, 'package.json'), 'utf8'));
  const req = createRequire(join(root, ws, 'package.json'));
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
    try {
      req.resolve(`${name}/package.json`);
    } catch {
      if (!existsSync(join(root, ws, 'node_modules', name)) && !existsSync(join(root, 'node_modules', name))) missing.push(`${name} (${ws})`);
    }
  }
}
if (missing.length) {
  console.log(`\n▶ New dependencies found: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' …' : ''}\n  Running npm install…\n`);
  execSync('npm install', { stdio: 'inherit' });
}

const schema = join(root, 'apps/api/prisma/schema.prisma');
const stamp = join(root, 'node_modules/.prisma/.schema-hash');
const hash = createHash('sha256').update(readFileSync(schema)).digest('hex');
const generated = existsSync(join(root, 'node_modules/.prisma/client/index.d.ts'));
if (!generated || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== hash) {
  console.log('\n▶ Database schema changed — regenerating the Prisma client…\n');
  execSync('npx prisma generate', { stdio: 'inherit', cwd: join(root, 'apps/api') });
  writeFileSync(stamp, hash);
  console.log('\n  If you pulled new migrations, also run: npm run db:migrate\n');
}
