/* Creates the integration-test database (if needed) and applies migrations to it. */
const { execSync } = require('node:child_process');
const { Client } = require('pg');

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set');
  const u = new URL(url);
  const dbName = u.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  admin.search = '';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
  await client.end();
  if (process.env.TEST_DB_SKIP_MIGRATE === '1') return;
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
