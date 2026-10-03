import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Evidence } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AppError, badRequest, notFound } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { AccountabilityService } from '../accountability/accountability.service';
import { CompletionService } from '../accountability/completion.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { fromDbDate, todayIn } from '../domain/dates';
import { log } from '../common/logging/logger';
import { CreateEvidenceDto, CreateUploadDto } from './evidence.dto';
import { STORAGE_DRIVER, StorageDriver } from './storage.types';
import {
  ALLOWED_TYPES, isAllowedType, MAX_EVIDENCE_BYTES, MAX_EVIDENCE_PER_TASK, MAX_THUMBNAIL_BYTES, safeFileName, sniff, USER_STORAGE_QUOTA_BYTES,
} from './file-validation';

export const UPLOAD_TTL_SEC = 15 * 60;
export const VIEW_TTL_SEC = 10 * 60;

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    private readonly audit: AuditService,
    private readonly accountability: AccountabilityService,
    private readonly completion: CompletionService,
  ) {}

  private async ownedEditableOccurrence(user: AuthUser, occurrenceId: string) {
    const occ = await this.prisma.taskOccurrence.findFirst({ where: { id: occurrenceId, userId: user.id } });
    if (!occ) throw notFound('Task');
    this.completion.assertEditable(occ, new Date());
    return occ;
  }

  /** Step 1: validate limits, then hand out signed PUT URLs with random keys. */
  async createUpload(user: AuthUser, dto: CreateUploadDto) {
    await this.ownedEditableOccurrence(user, dto.taskOccurrenceId);
    if (!isAllowedType(dto.contentType)) throw new AppError('INVALID_FILE', 'Allowed file types: jpg, png, webp or pdf.', 415);
    const [perTask, used] = await Promise.all([
      this.prisma.evidence.count({ where: { taskOccurrenceId: dto.taskOccurrenceId, deletedAt: null } }),
      this.prisma.evidence.aggregate({ where: { userId: user.id, deletedAt: null }, _sum: { sizeBytes: true } }),
    ]);
    if (perTask >= MAX_EVIDENCE_PER_TASK) throw new AppError('EVIDENCE_LIMIT', `A task can have up to ${MAX_EVIDENCE_PER_TASK} pieces of evidence.`, 409);
    if ((used._sum.sizeBytes ?? 0) + dto.size > USER_STORAGE_QUOTA_BYTES) throw new AppError('STORAGE_QUOTA', 'You have reached your storage limit. Delete older evidence to add more.', 409);

    const id = randomBytes(24).toString('hex');
    const key = `ev/${user.id}/${id}.${ALLOWED_TYPES[dto.contentType].ext}`;
    const thumbType = dto.thumbnailContentType && isAllowedType(dto.thumbnailContentType) ? dto.thumbnailContentType : null;
    const thumbnailKey = thumbType ? `ev/${user.id}/${id}.thumb.${ALLOWED_TYPES[thumbType].ext}` : null;
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_SEC * 1000);

    await this.prisma.evidenceUpload.create({
      data: { key, thumbnailKey, userId: user.id, taskOccurrenceId: dto.taskOccurrenceId, contentType: dto.contentType, thumbnailContentType: thumbType, maxBytes: MAX_EVIDENCE_BYTES, expiresAt },
    });
    const [uploadUrl, thumbnailUploadUrl] = await Promise.all([
      this.storage.presignPut(key, dto.contentType, UPLOAD_TTL_SEC),
      thumbnailKey && thumbType ? this.storage.presignPut(thumbnailKey, thumbType, UPLOAD_TTL_SEC) : Promise.resolve(null),
    ]);
    return { key, uploadUrl, thumbnailKey, thumbnailUploadUrl, expiresAt };
  }

  /** Step 2: confirm an uploaded file (size + real bytes checked on the stored object), or add a link / note. */
  async create(user: AuthUser, dto: CreateEvidenceDto) {
    const occ = await this.ownedEditableOccurrence(user, dto.taskOccurrenceId);
    let data: Partial<Evidence> & { type: Evidence['type'] };

    if (dto.type === 'URL') {
      if (!dto.url) throw badRequest('URL_REQUIRED', 'Add the link that shows your work.');
      data = { type: 'URL', url: dto.url };
    } else if (dto.type === 'TEXT') {
      if (!dto.description?.trim()) throw badRequest('DESCRIPTION_REQUIRED', 'Describe what you did.');
      data = { type: 'TEXT' };
    } else {
      if (!dto.uploadKey) throw badRequest('UPLOAD_REQUIRED', 'Upload a file first.');
      data = await this.verifyUpload(user, dto);
    }

    const ev = await this.prisma.tx(async (tx) => {
      if (data.storageKey) {
        const claimed = await tx.evidenceUpload.updateMany({ where: { key: data.storageKey, userId: user.id, confirmedAt: null }, data: { confirmedAt: new Date() } });
        if (claimed.count === 0) throw new AppError('UPLOAD_NOT_FOUND', 'This upload has already been used or has expired.', 409);
      }
      const created = await tx.evidence.create({
        data: { userId: user.id, taskOccurrenceId: occ.id, description: dto.description, ...data },
      });
      await this.audit.record({ userId: user.id, action: 'EVIDENCE_UPLOADED', entityType: 'Evidence', entityId: created.id, metadata: { type: created.type, occurrenceId: occ.id } }, tx);
      const date = occ.period === 'WEEK' ? todayIn(user.timezone) : fromDbDate(occ.scheduledDate);
      await this.accountability.refresh(tx, user.id, date);
      return created;
    });
    log.info('evidence_added', { userId: user.id, evidenceId: ev.id, type: ev.type, bytes: ev.sizeBytes });
    return this.present(ev);
  }

  private async verifyUpload(user: AuthUser, dto: CreateEvidenceDto) {
    const ticket = await this.prisma.evidenceUpload.findFirst({
      where: { key: dto.uploadKey, userId: user.id, taskOccurrenceId: dto.taskOccurrenceId, confirmedAt: null, expiresAt: { gt: new Date(Date.now() - 5 * 60_000) } },
    });
    if (!ticket) throw new AppError('UPLOAD_NOT_FOUND', 'This upload has expired. Please try again.', 404);
    const reject = async (reason: string) => {
      await Promise.allSettled([this.storage.delete(ticket.key), ticket.thumbnailKey ? this.storage.delete(ticket.thumbnailKey) : null]);
      await this.prisma.evidenceUpload.delete({ where: { key: ticket.key } }).catch(() => undefined);
      throw new AppError('INVALID_FILE', reason, 415);
    };

    const info = await this.storage.head(ticket.key);
    if (!info) throw new AppError('UPLOAD_INCOMPLETE', 'The file hasn’t finished uploading. Please try again.', 409);
    if (info.size === 0 || info.size > ticket.maxBytes) return reject('Files must be between 1 byte and 10 MB.');
    const real = sniff((await this.storage.readStart(ticket.key, 16)) ?? Buffer.alloc(0));
    if (real !== ticket.contentType) return reject('File contents do not match its type.');
    const kind = ALLOWED_TYPES[real].kind;
    if (kind !== dto.type) return reject('File type does not match the evidence type.');

    // The thumbnail is optional: an invalid one is discarded, never fatal.
    let thumbnailKey: string | null = null;
    if (ticket.thumbnailKey && dto.thumbnailKey === ticket.thumbnailKey) {
      const t = await this.storage.head(ticket.thumbnailKey);
      const tReal = t && t.size <= MAX_THUMBNAIL_BYTES ? sniff((await this.storage.readStart(ticket.thumbnailKey, 16)) ?? Buffer.alloc(0)) : null;
      if (tReal && tReal === ticket.thumbnailContentType) thumbnailKey = ticket.thumbnailKey;
      else await this.storage.delete(ticket.thumbnailKey).catch(() => undefined);
    }
    return {
      type: kind,
      storageKey: ticket.key,
      thumbnailKey,
      mimeType: real,
      sizeBytes: info.size,
      originalName: safeFileName(dto.originalName, ALLOWED_TYPES[real].ext),
    } as Partial<Evidence> & { type: Evidence['type'] };
  }

  async listForOccurrence(user: AuthUser, occurrenceId: string) {
    const occ = await this.prisma.taskOccurrence.findFirst({ where: { id: occurrenceId, userId: user.id }, select: { id: true } });
    if (!occ) throw notFound('Task');
    const items = await this.prisma.evidence.findMany({ where: { taskOccurrenceId: occurrenceId, userId: user.id, deletedAt: null }, orderBy: { submittedAt: 'asc' } });
    return Promise.all(items.map((e) => this.present(e)));
  }

  async remove(user: AuthUser, id: string) {
    const ev = await this.prisma.evidence.findFirst({ where: { id, userId: user.id, deletedAt: null }, include: { occurrence: true } });
    if (!ev) throw notFound('Evidence');
    await this.prisma.tx(async (tx) => {
      await tx.evidence.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record({ userId: user.id, action: 'EVIDENCE_DELETED', entityType: 'Evidence', entityId: id }, tx);
      const date = ev.occurrence.period === 'WEEK' ? todayIn(user.timezone) : fromDbDate(ev.occurrence.scheduledDate);
      await this.accountability.refresh(tx, user.id, date);
    });
    await Promise.allSettled([ev.storageKey && this.storage.delete(ev.storageKey), ev.thumbnailKey && this.storage.delete(ev.thumbnailKey)]);
    return { id, deleted: true };
  }

  async present(e: Evidence) {
    const [url, thumbnailUrl] = await Promise.all([
      e.storageKey ? this.storage.presignGet(e.storageKey, VIEW_TTL_SEC, { filename: e.originalName ?? undefined, contentType: e.mimeType ?? undefined }) : Promise.resolve(e.type === 'URL' ? e.url : null),
      e.thumbnailKey ? this.storage.presignGet(e.thumbnailKey, VIEW_TTL_SEC) : Promise.resolve(null),
    ]);
    return {
      id: e.id,
      taskOccurrenceId: e.taskOccurrenceId,
      type: e.type,
      url,
      thumbnailUrl,
      description: e.description,
      mimeType: e.mimeType,
      sizeBytes: e.sizeBytes,
      originalName: e.originalName,
      verification: e.verification,
      submittedAt: e.submittedAt,
    };
  }
}
