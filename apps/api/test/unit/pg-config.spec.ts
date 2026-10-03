import { pgConfigFromUrl } from '../../src/database/pg-config';

describe('pgConfigFromUrl', () => {
  it('keeps local URLs unchanged apart from Prisma-only parameters', () => {
    const c = pgConfigFromUrl('postgresql://u:p@localhost:5432/db?schema=public');
    expect(c).toEqual({ pool: { connectionString: 'postgresql://u:p@localhost:5432/db', ssl: undefined, max: 10 }, schema: undefined });
  });

  it('maps a Supabase pooler URL: custom schema, TLS without CA verification, small pool', () => {
    const c = pgConfigFromUrl('postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?schema=app&sslmode=require&connection_limit=5');
    expect(c.schema).toBe('app');
    expect(c.pool).toEqual({ connectionString: 'postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres', ssl: { rejectUnauthorized: false }, max: 5 });
  });

  it('verifies certificates when asked', () => {
    expect(pgConfigFromUrl('postgresql://u:p@h/db?sslmode=verify-full').pool.ssl).toBe(true);
  });
});
