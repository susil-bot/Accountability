import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { APP_CONFIG, AppConfig } from '../config/env';
import { pgConfigFromUrl } from './pg-config';

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const { pool: poolConfig, schema } = pgConfigFromUrl(config.databaseUrl);
    // Raw SQL qualifies its tables with the same schema via database/sql.ts → table().
    const pool = new Pool(poolConfig);
    super({ adapter: new PrismaPg(pool, schema ? { schema } : undefined) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Multi-record mutations run here (spec §51). */
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 });
  }
}
