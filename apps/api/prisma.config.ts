import { defineConfig } from 'prisma/config';

// Env vars are loaded by dotenv-cli in package.json scripts (root .env).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },
});
