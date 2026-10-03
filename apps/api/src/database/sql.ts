import { Prisma } from '@prisma/client';
import { pgConfigFromUrl } from './pg-config';

let cachedSchema: string | undefined | null = null;

/**
 * A table name for hand-written SQL, qualified with the configured schema (`?schema=` in DATABASE_URL),
 * so raw queries hit the same tables as Prisma's generated ones without relying on search_path.
 */
export function table(name: string): Prisma.Sql {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid table name ${name}`);
  if (cachedSchema === null) cachedSchema = process.env.DATABASE_URL ? pgConfigFromUrl(process.env.DATABASE_URL).schema : undefined;
  return Prisma.raw(cachedSchema ? `"${cachedSchema.replace(/"/g, '')}"."${name}"` : `"${name}"`);
}
