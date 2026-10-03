import { Controller, Get, HttpCode, Inject, Put, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AppError } from '../common/errors/app-error';
import { Public, RawResponse } from '../common/decorators/auth.decorators';
import { ProxiedStorageDriver } from './proxied-storage.driver';
import { STORAGE_DRIVER, StorageDriver } from './storage.types';
import { MAX_EVIDENCE_BYTES } from './file-validation';

const TYPES: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };

/**
 * Signed object endpoint for proxied drivers (local disk, S3 proxy); mirrors R2 presigned URLs.
 * The signature is the capability: no session, short expiry, one key, one operation.
 */
@ApiExcludeController()
@Controller('storage')
export class StorageController {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  private local(): ProxiedStorageDriver {
    if (!(this.driver instanceof ProxiedStorageDriver)) throw new AppError('NOT_FOUND', 'Not found.', 404);
    return this.driver;
  }

  @Public()
  @SkipThrottle()
  @RawResponse()
  @HttpCode(200)
  @Put('object')
  async put(@Query('key') key: string, @Query('exp') exp: string, @Query('sig') sig: string, @Req() req: Request) {
    const local = this.local();
    if (!local.verify('put', key, Number(exp), sig)) throw new AppError('LINK_EXPIRED', 'This upload link is invalid or has expired.', 403);
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > MAX_EVIDENCE_BYTES) throw new AppError('PAYLOAD_TOO_LARGE', 'Files must be 10 MB or smaller.', 413);
    try {
      const bytes = await local.write(key, req, MAX_EVIDENCE_BYTES, TYPES[key.split('.').pop() ?? '']);
      return { ok: true, bytes };
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'TOO_LARGE') throw new AppError('PAYLOAD_TOO_LARGE', 'Files must be 10 MB or smaller.', 413);
      if (code === 'EEXIST') throw new AppError('CONFLICT', 'This upload link was already used.', 409);
      throw e;
    }
  }

  @Public()
  @SkipThrottle()
  @Get('object')
  async get(@Query('key') key: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res({ passthrough: true }) res: Response) {
    const local = this.local();
    if (!local.verify('get', key, Number(exp), sig)) throw new AppError('LINK_EXPIRED', 'This link has expired.', 403);
    if (!(await local.head(key))) throw new AppError('NOT_FOUND', 'Not found.', 404);
    res.set({
      'Content-Type': TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-site',
    });
    return new StreamableFile(await local.openStream(key));
  }
}
