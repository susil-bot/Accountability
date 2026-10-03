import { Injectable } from '@nestjs/common';
import { MentorNote, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { badRequest, conflict, forbidden, notFound } from '../common/errors/app-error';
import { toDbDate, fromDbDate } from '../domain/dates';
import { MentorAccessService } from './mentor-access.service';

export const NOTE_TAGS = ['motivation', 'skills', 'health', 'personal', 'admin'] as const;
export const SECTION_KEYS = ['howTheyAreDoing', 'wins', 'challenges', 'agreed', 'nextSession'] as const;
export type Sections = Partial<Record<(typeof SECTION_KEYS)[number], string>>;
const SECTION_LABELS: Record<(typeof SECTION_KEYS)[number], string> = {
  howTheyAreDoing: 'How they’re doing',
  wins: 'Wins',
  challenges: 'Challenges',
  agreed: 'What we agreed',
  nextSession: 'Next session',
};

export interface NoteInput {
  kind?: 'SESSION' | 'QUICK';
  sessionId?: string;
  sections?: Sections;
  text?: string;
  tags?: string[];
  pinned?: boolean;
  isDraft?: boolean;
  sharedSummary?: string | null;
  actions?: { owner: 'CLIENT' | 'MENTOR'; title: string; dueDate?: string | null }[];
}

function cleanSections(s: Sections | undefined): Sections {
  const out: Sections = {};
  for (const k of SECTION_KEYS) {
    const v = s?.[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

/** Searchable plain text of a note: the quick-note text, or the template sections with their headings. */
export function noteText(kind: 'SESSION' | 'QUICK', sections: Sections, text?: string) {
  if (kind === 'QUICK') return (text ?? '').trim();
  return SECTION_KEYS.filter((k) => sections[k])
    .map((k) => `${SECTION_LABELS[k]}: ${sections[k]}`)
    .join('\n');
}

/**
 * Private mentor notes. Visible to the client's current mentor and admins (never to the client — only the
 * separate `sharedSummary` is). Only the author edits; every edit after publishing keeps the previous version.
 * Drafts autosave without versions. Notes are archived, never deleted.
 */
@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentorAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(actor: AuthUser, clientId: string, opts: { q?: string; tag?: string; archived?: boolean } = {}) {
    await this.access.client(actor, clientId);
    const where: Prisma.MentorNoteWhereInput = {
      clientId,
      archivedAt: opts.archived ? { not: null } : null,
      ...(opts.tag ? { tags: { has: opts.tag } } : {}),
      ...(opts.q ? { OR: [{ text: { contains: opts.q, mode: 'insensitive' } }, { sharedSummary: { contains: opts.q, mode: 'insensitive' } }] } : {}),
      // Someone else's unfinished draft is not shown.
      NOT: { isDraft: true, authorId: { not: actor.id } },
    };
    const notes = await this.prisma.mentorNote.findMany({ where, orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 200 });
    const authors = await this.names(notes.map((n) => n.authorId));
    const actionRows = await this.prisma.actionItem.findMany({ where: { noteId: { in: notes.map((n) => n.id) } } });
    return notes.map((n) => this.present(n, actor, authors, actionRows.filter((a) => a.noteId === n.id)));
  }

  async create(actor: AuthUser, clientId: string, input: NoteInput) {
    const { assignment } = await this.access.client(actor, clientId);
    const kind = input.kind ?? (input.sessionId ? 'SESSION' : 'QUICK');
    const sections = cleanSections(input.sections);
    const text = noteText(kind, sections, input.text);
    if (!text && !input.isDraft) throw badRequest('NOTE_EMPTY', 'Write something before saving the note.');
    if (input.sessionId) {
      const session = await this.prisma.mentorSession.findFirst({ where: { id: input.sessionId, clientId } });
      if (!session) throw notFound('Session');
      if (await this.prisma.mentorNote.findUnique({ where: { sessionId: input.sessionId } })) {
        throw conflict('SESSION_NOTE_EXISTS', 'This session already has notes. Open them to edit.');
      }
    }
    if (input.actions?.length && !assignment) throw forbidden('Action items need an assigned mentor.');
    const now = new Date();
    const shared = input.sharedSummary?.trim() || null;
    const note = await this.prisma.tx(async (tx) => {
      const n = await tx.mentorNote.create({
        data: {
          clientId,
          authorId: actor.id,
          sessionId: input.sessionId ?? null,
          kind,
          sections,
          text,
          tags: input.tags ?? [],
          pinned: input.pinned ?? false,
          isDraft: input.isDraft ?? false,
          sharedSummary: shared,
          sharedAt: shared && !input.isDraft ? now : null,
        },
      });
      if (input.actions?.length && assignment) {
        await tx.actionItem.createMany({
          data: input.actions.map((a) => ({ clientId, mentorId: assignment.mentorId, owner: a.owner, title: a.title.trim(), dueDate: a.dueDate ? toDbDate(a.dueDate) : null, noteId: n.id })),
        });
      }
      await this.audit.record({ userId: clientId, actorId: actor.id, action: 'NOTE_CREATED', entityType: 'MentorNote', entityId: n.id, metadata: { kind, draft: n.isDraft } }, tx);
      if (n.sharedAt) await this.notifyShared(tx, actor, clientId, n.id);
      return n;
    });
    return this.get(actor, note.id);
  }

  async update(actor: AuthUser, noteId: string, input: NoteInput & { expectedVersion?: number }) {
    const note = await this.editable(actor, noteId);
    if (input.expectedVersion !== undefined && input.expectedVersion !== note.version) {
      throw conflict('NOTE_CHANGED', 'This note was changed somewhere else. Reload it to see the latest version.');
    }
    const sections = input.sections !== undefined ? cleanSections(input.sections) : (note.sections as Sections);
    const text = input.sections !== undefined || input.text !== undefined ? noteText(note.kind, sections, input.text ?? note.text) : note.text;
    const isDraft = input.isDraft ?? note.isDraft;
    if (!text && !isDraft) throw badRequest('NOTE_EMPTY', 'Write something before saving the note.');
    const shared = input.sharedSummary === undefined ? note.sharedSummary : input.sharedSummary?.trim() || null;
    const contentChanged = text !== note.text || JSON.stringify(sections) !== JSON.stringify(note.sections) || shared !== note.sharedSummary || JSON.stringify(input.tags ?? note.tags) !== JSON.stringify(note.tags);
    const now = new Date();
    const becomesShared = !!shared && !isDraft && (shared !== note.sharedSummary || note.isDraft || !note.sharedAt);

    await this.prisma.tx(async (tx) => {
      // Published notes keep history: snapshot the current content before overwriting it.
      const versioned = !note.isDraft && contentChanged;
      if (versioned) {
        await tx.mentorNoteVersion.create({
          data: { noteId: note.id, version: note.version, sections: note.sections as Prisma.InputJsonValue, text: note.text, tags: note.tags, sharedSummary: note.sharedSummary, editedById: actor.id },
        });
      }
      const res = await tx.mentorNote.updateMany({
        where: { id: note.id, version: note.version },
        data: {
          sections,
          text,
          tags: input.tags ?? note.tags,
          pinned: input.pinned ?? note.pinned,
          isDraft,
          sharedSummary: shared,
          sharedAt: becomesShared ? now : shared ? note.sharedAt : null,
          version: versioned ? note.version + 1 : note.version,
        },
      });
      if (res.count === 0) throw conflict('NOTE_CHANGED', 'This note was changed somewhere else. Reload it to see the latest version.');
      if (input.actions?.length) {
        const a = await tx.mentorAssignment.findFirst({ where: { clientId: note.clientId, status: 'ACTIVE', mentorId: actor.id } });
        if (!a) throw forbidden('Action items need an assigned mentor.');
        await tx.actionItem.createMany({
          data: input.actions.map((x) => ({ clientId: note.clientId, mentorId: actor.id, owner: x.owner, title: x.title.trim(), dueDate: x.dueDate ? toDbDate(x.dueDate) : null, noteId: note.id })),
        });
      }
      if (versioned || (note.isDraft && !isDraft)) {
        await this.audit.record({ userId: note.clientId, actorId: actor.id, action: 'NOTE_EDITED', entityType: 'MentorNote', entityId: note.id, metadata: { version: versioned ? note.version + 1 : note.version } }, tx);
      }
      if (becomesShared) await this.notifyShared(tx, actor, note.clientId, note.id);
    });
    return this.get(actor, note.id);
  }

  async setPinned(actor: AuthUser, noteId: string, pinned: boolean) {
    const note = await this.editable(actor, noteId);
    await this.prisma.mentorNote.update({ where: { id: note.id }, data: { pinned } });
    return this.get(actor, note.id);
  }

  async archive(actor: AuthUser, noteId: string, archived: boolean) {
    const note = await this.editable(actor, noteId);
    await this.prisma.mentorNote.update({ where: { id: note.id }, data: { archivedAt: archived ? new Date() : null } });
    await this.audit.record({ userId: note.clientId, actorId: actor.id, action: 'NOTE_ARCHIVED', entityType: 'MentorNote', entityId: note.id, metadata: { archived } });
    return { id: note.id, archived };
  }

  async get(actor: AuthUser, noteId: string) {
    const note = await this.prisma.mentorNote.findUnique({ where: { id: noteId } });
    if (!note) throw notFound('Note');
    await this.access.client(actor, note.clientId);
    if (note.isDraft && note.authorId !== actor.id) throw notFound('Note');
    const [authors, actions] = await Promise.all([this.names([note.authorId]), this.prisma.actionItem.findMany({ where: { noteId: note.id } })]);
    return this.present(note, actor, authors, actions);
  }

  async forSession(actor: AuthUser, sessionId: string) {
    const note = await this.prisma.mentorNote.findUnique({ where: { sessionId } });
    return note ? this.get(actor, note.id) : null;
  }

  async history(actor: AuthUser, noteId: string) {
    const note = await this.prisma.mentorNote.findUnique({ where: { id: noteId } });
    if (!note) throw notFound('Note');
    await this.access.client(actor, note.clientId);
    const versions = await this.prisma.mentorNoteVersion.findMany({ where: { noteId }, orderBy: { version: 'desc' } });
    const editors = await this.names(versions.map((v) => v.editedById));
    return {
      currentVersion: note.version,
      versions: versions.map((v) => ({ version: v.version, text: v.text, sections: v.sections, tags: v.tags, sharedSummary: v.sharedSummary, replacedBy: editors.get(v.editedById) ?? 'Unknown', replacedAt: v.editedAt })),
    };
  }

  /** Only the author can change a note, and only while they can still see the client. */
  private async editable(actor: AuthUser, noteId: string): Promise<MentorNote> {
    const note = await this.prisma.mentorNote.findUnique({ where: { id: noteId } });
    if (!note) throw notFound('Note');
    await this.access.client(actor, note.clientId);
    if (note.authorId !== actor.id) throw forbidden('Only the person who wrote this note can change it.');
    return note;
  }

  private async notifyShared(tx: Prisma.TransactionClient, actor: AuthUser, clientId: string, noteId: string) {
    await this.audit.record({ userId: clientId, actorId: actor.id, action: 'SUMMARY_SHARED', entityType: 'MentorNote', entityId: noteId }, tx);
    await this.notifications.createOnce(tx, {
      userId: clientId,
      type: 'MENTOR_UPDATE',
      dedupeKey: `SUMMARY:${noteId}:${Date.now()}`,
      title: `${actor.name} shared a summary with you`,
      body: 'Open “From your mentor” to read it.',
      scheduledAt: new Date(),
      link: '/app/dashboard#from-mentor',
    });
  }

  private async names(ids: string[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private present(n: MentorNote, actor: AuthUser, authors: Map<string, string>, actions: { id: string; owner: string; title: string; status: string; dueDate: Date | null }[]) {
    return {
      id: n.id,
      clientId: n.clientId,
      kind: n.kind,
      sessionId: n.sessionId,
      sections: n.sections as Sections,
      text: n.text,
      tags: n.tags,
      pinned: n.pinned,
      isDraft: n.isDraft,
      sharedSummary: n.sharedSummary,
      sharedAt: n.sharedAt,
      archived: !!n.archivedAt,
      version: n.version,
      author: { id: n.authorId, name: authors.get(n.authorId) ?? 'Unknown' },
      canEdit: n.authorId === actor.id,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      actions: actions.map((a) => ({ id: a.id, owner: a.owner, title: a.title, status: a.status, dueDate: a.dueDate && fromDbDate(a.dueDate) })),
    };
  }
}
