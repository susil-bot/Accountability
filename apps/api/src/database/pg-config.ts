import type { PoolConfig } from 'pg';

/**
 * Turns DATABASE_URL into a pg pool config the same way libpq and the Prisma CLI read it:
 *  - `schema=<name>` → Prisma's schema option (tables live in that schema)
 *  - `sslmode=require|prefer` → TLS without certificate verification (libpq semantics; managed poolers such as
 *    Supabase's use their own CA), `sslmode=verify-full` → full verification, `disable` → no TLS
 *  - `connection_limit=<n>` → pool size (default 10)
 * Prisma-only parameters are removed before the URL reaches node-postgres.
 */
export function pgConfigFromUrl(databaseUrl: string): { pool: PoolConfig; schema: string | undefined } {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema') ?? undefined;
  const sslmode = url.searchParams.get('sslmode');
  const max = Number(url.searchParams.get('connection_limit') ?? 10);
  for (const p of ['schema', 'sslmode', 'connection_limit', 'pgbouncer', 'sslaccept']) url.searchParams.delete(p);
  const ssl = sslmode === 'verify-full' || sslmode === 'verify-ca' ? true : sslmode === 'require' || sslmode === 'prefer' ? { rejectUnauthorized: false } : undefined;
  return { pool: { connectionString: url.toString(), ssl, max: Number.isFinite(max) && max > 0 ? max : 10 }, schema: schema === 'public' ? undefined : schema };
}
