import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { STORAGE_DRIVER, StorageDriver } from './storage.types';
import { log } from '../common/logging/logger';

/** Deletes objects for upload tickets that were never confirmed (abandoned uploads). Idempotent. */
@Injectable()
export class EvidenceCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async removeExpired(now: Date = new Date(), batch = 200) {
    const stale = await this.prisma.evidenceUpload.findMany({
      where: { confirmedAt: null, expiresAt: { lt: new Date(now.getTime() - 60 * 60_000) } },
      take: batch,
      orderBy: { expiresAt: 'asc' },
    });
    for (const t of stale) {
      await Promise.allSettled([this.storage.delete(t.key), t.thumbnailKey ? this.storage.delete(t.thumbnailKey) : null]);
      await this.prisma.evidenceUpload.delete({ where: { key: t.key } }).catch(() => undefined);
    }
    // Confirmed tickets are only bookkeeping once the Evidence row exists.
    await this.prisma.evidenceUpload.deleteMany({ where: { confirmedAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } } });
    if (stale.length) log.info('uploads_cleaned', { count: stale.length });
    return { removed: stale.length };
  }
}
