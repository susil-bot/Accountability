import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUrl, IsUUID, Matches, Max, MaxLength, Min, MinLength,
  Validate, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { IsLocalDate, IsTimeOfDay, IsTimezone } from '../common/validation';
import { NUDGE_TEMPLATE_KEYS } from '../domain/mentoring';
import { GoalCategory } from '@prisma/client';
import { NOTE_TAGS } from './notes.service';
import { REMINDER_LEADS } from './sessions.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);
const toInt = ({ value }: { value: unknown }) => (value === undefined || value === '' ? undefined : Number(value));

// ── Admin ─────────────────────────────────────────────────────────────

export class InviteMentorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Transform(trim)
  name: string;

  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;
}

export class AssignDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  mentorId: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  /** Assign even when the mentor is at capacity (the UI asks first). */
  @IsOptional()
  @IsBoolean()
  overrideCapacity?: boolean;
}

export class CapacityDto {
  @IsInt()
  @Min(1)
  @Max(100)
  capacity: number;
}

export class ActiveDto {
  @IsBoolean()
  active: boolean;
}

export class ClientsQuery {
  @IsOptional()
  @IsIn(['all', 'unassigned', 'attention', 'pending'])
  filter?: 'all' | 'unassigned' | 'attention' | 'pending';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AuditQuery {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  action?: string;

  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

// ── Invites (public) ──────────────────────────────────────────────────

export class InviteTokenQuery {
  @IsString()
  @MaxLength(200)
  token: string;
}

export class AcceptInviteDto {
  @IsString()
  @MaxLength(200)
  token: string;

  /** At least 8 characters with a letter and a number. */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'password must contain at least one letter and one number' })
  password: string;

  @Validate(IsTimezone)
  timezone: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Transform(trim)
  name?: string;
}

// ── Mentor ────────────────────────────────────────────────────────────

export class ReviewedDto {
  @IsBoolean()
  reviewed: boolean;
}

export class TimelineQuery {
  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class DateQuery {
  @IsOptional()
  @Validate(IsLocalDate)
  date?: string;
}

export class SectionsDto {
  @IsOptional() @IsString() @MaxLength(4000) howTheyAreDoing?: string;
  @IsOptional() @IsString() @MaxLength(4000) wins?: string;
  @IsOptional() @IsString() @MaxLength(4000) challenges?: string;
  @IsOptional() @IsString() @MaxLength(4000) agreed?: string;
  @IsOptional() @IsString() @MaxLength(4000) nextSession?: string;
}

export class NewActionDto {
  @IsIn(['CLIENT', 'MENTOR'])
  owner: 'CLIENT' | 'MENTOR';

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(trim)
  title: string;

  @IsOptional()
  @Validate(IsLocalDate)
  dueDate?: string | null;
}

export class NoteDto {
  @IsOptional()
  @IsIn(['SESSION', 'QUICK'])
  kind?: 'SESSION' | 'QUICK';

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SectionsDto)
  sections?: SectionsDto;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsIn(NOTE_TAGS as unknown as string[], { each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;

  /** Short summary the client will see. Empty or null = nothing shared. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sharedSummary?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => NewActionDto)
  actions?: NewActionDto[];
}

export class UpdateNoteDto extends NoteDto {
  /** Optimistic concurrency: the version the editor started from. */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class NotesQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(NOTE_TAGS as unknown as string[])
  tag?: string;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  archived?: boolean;
}

export class PinDto {
  @IsBoolean()
  pinned: boolean;
}

export class ArchiveDto {
  @IsBoolean()
  archived: boolean;
}

export class ActionDto extends NewActionDto {}

export class UpdateActionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(trim)
  title?: string;

  @IsOptional()
  @Validate(IsLocalDate)
  dueDate?: string | null;

  @IsOptional()
  @IsIn(['OPEN', 'DONE', 'DROPPED'])
  status?: 'OPEN' | 'DONE' | 'DROPPED';
}

export class ActionsQuery {
  @IsOptional()
  @IsIn(['OPEN', 'DONE', 'DROPPED'])
  status?: 'OPEN' | 'DONE' | 'DROPPED';
}

const CHANNELS = ['WHATSAPP', 'PHONE', 'VIDEO', 'IN_PERSON'] as const;

export class SessionDto {
  @IsUUID()
  clientId: string;

  @IsISO8601()
  startsAt: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(240)
  durationMin?: number;

  @IsOptional()
  @IsIn(CHANNELS as unknown as string[])
  channel?: (typeof CHANNELS)[number];

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  link?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  repeatWeeks?: number;

  @IsOptional()
  @IsIn(REMINDER_LEADS as unknown as number[])
  reminderLeadMin?: number;
}

export class AgendaItemDto {
  @IsString()
  @MaxLength(80)
  id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  text: string;

  @IsBoolean()
  done: boolean;
}

export class UpdateSessionDto {
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(240)
  durationMin?: number;

  @IsOptional()
  @IsIn(CHANNELS as unknown as string[])
  channel?: (typeof CHANNELS)[number];

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  link?: string | null;

  @IsOptional()
  @IsIn(['SCHEDULED', 'DONE', 'NO_SHOW', 'CANCELLED'])
  status?: 'SCHEDULED' | 'DONE' | 'NO_SHOW' | 'CANCELLED';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AgendaItemDto)
  agenda?: AgendaItemDto[];

  @IsOptional()
  @IsIn(REMINDER_LEADS as unknown as number[])
  reminderLeadMin?: number;
}

export class SessionsQuery {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;
}

export class PrepQuery {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;
}

export class NudgeDto {
  @IsIn(NUDGE_TEMPLATE_KEYS as unknown as string[])
  template: (typeof NUDGE_TEMPLATE_KEYS)[number];

  /** The (possibly edited) message; required for CUSTOM. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  body?: string;
}

export class WhatsappLinkQuery {
  @IsString()
  @MaxLength(500)
  text: string;
}

export class RuleDto {
  @IsIn(['NO_CHECKIN_BY', 'MISSED_TASK_DAYS', 'INACTIVE_DAYS'])
  condition: 'NO_CHECKIN_BY' | 'MISSED_TASK_DAYS' | 'INACTIVE_DAYS';

  @IsOptional()
  @Validate(IsTimeOfDay)
  time?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(14)
  days?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message: string;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Validate(IsTimeOfDay)
  time?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(14)
  days?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message?: string;
}

export class ReportUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  mentorComment?: string | null;

  @IsOptional()
  @IsBoolean()
  share?: boolean;
}

export class RefreshReportDto {
  @Validate(IsLocalDate)
  weekStart: string;
}

// ── Client ────────────────────────────────────────────────────────────

export class WhatsappOptInDto {
  @IsBoolean()
  optIn: boolean;

  /** International format, e.g. +919876543210. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value))
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'phone must be in international format, e.g. +919876543210' })
  phone?: string | null;
}

export class MyActionDto {
  @IsIn(['OPEN', 'DONE'])
  status: 'OPEN' | 'DONE';
}

export class ChooseMentorDto {
  @IsUUID()
  mentorId: string;

  /** Optional intro for the mentor: "What would you like help with?" */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class MentorProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  headline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsIn(Object.values(GoalCategory), { each: true })
  focusAreas?: GoalCategory[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  languages?: string[];

  @IsOptional()
  @IsBoolean()
  acceptingClients?: boolean;
}
