import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../common/decorators/auth.decorators';
import { ClientInsightsService } from './client-insights.service';
import { NotesService } from './notes.service';
import { ActionsService } from './actions.service';
import { SessionsService } from './sessions.service';
import { NudgesService } from './nudges.service';
import { PrepService } from './prep.service';
import { ReportsService } from './reports.service';
import { DirectoryService } from './directory.service';
import {
  ActionDto, ActionsQuery, MentorProfileDto, ArchiveDto, DateQuery, NoteDto, NotesQuery, NudgeDto, PinDto, PrepQuery, RefreshReportDto, ReportUpdateDto, ReviewedDto, RuleDto,
  SessionDto, SessionsQuery, TimelineQuery, UpdateActionDto, UpdateNoteDto, UpdateRuleDto, UpdateSessionDto, WhatsappLinkQuery,
} from './mentoring.dto';

/**
 * Mentor workspace. Every route needs the MENTOR or ADMIN role (re-read from the database per request),
 * and every per-client route goes through MentorAccessService (ACTIVE assignment, or admin).
 */
@ApiTags('mentor')
@Roles('MENTOR', 'ADMIN')
@Controller('mentor')
export class MentorController {
  constructor(
    private readonly insights: ClientInsightsService,
    private readonly notes: NotesService,
    private readonly actions: ActionsService,
    private readonly sessions: SessionsService,
    private readonly nudges: NudgesService,
    private readonly prepSheet: PrepService,
    private readonly reports: ReportsService,
    private readonly directory: DirectoryService,
  ) {}

  // Directory profile (what clients see when choosing a mentor)
  @Roles('MENTOR')
  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.directory.profile(user);
  }

  @Roles('MENTOR')
  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: MentorProfileDto) {
    return this.directory.updateProfile(user, dto);
  }

  // Board and "My day"
  @Roles('MENTOR')
  @Get('clients')
  board(@CurrentUser() user: AuthUser) {
    return this.insights.board(user);
  }

  @Roles('MENTOR')
  @Get('my-day')
  myDay(@CurrentUser() user: AuthUser) {
    return this.insights.myDay(user);
  }

  // Client page
  @Get('clients/:id')
  overview(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.insights.overview(user, id);
  }

  @Get('clients/:id/day/:date')
  day(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('date') date: string) {
    return this.insights.day(user, id, date);
  }

  @Get('clients/:id/week')
  week(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: DateQuery) {
    return this.insights.week(user, id, q.date);
  }

  @Get('clients/:id/timeline')
  timeline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: TimelineQuery) {
    return this.insights.timeline(user, id, q);
  }

  @Roles('MENTOR')
  @Put('clients/:id/reviewed')
  reviewed(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewedDto) {
    return this.insights.markReviewed(user, id, dto.reviewed);
  }

  @Roles('MENTOR')
  @Get('clients/:id/whatsapp-link')
  whatsapp(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: WhatsappLinkQuery) {
    return this.insights.whatsapp(user, id, q.text);
  }

  // Notes
  @Get('clients/:id/notes')
  listNotes(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: NotesQuery) {
    return this.notes.list(user, id, q);
  }

  @Post('clients/:id/notes')
  createNote(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto) {
    return this.notes.create(user, id, dto);
  }

  @Get('notes/:noteId')
  getNote(@CurrentUser() user: AuthUser, @Param('noteId', ParseUUIDPipe) noteId: string) {
    return this.notes.get(user, noteId);
  }

  @Patch('notes/:noteId')
  updateNote(@CurrentUser() user: AuthUser, @Param('noteId', ParseUUIDPipe) noteId: string, @Body() dto: UpdateNoteDto) {
    return this.notes.update(user, noteId, dto);
  }

  @Get('notes/:noteId/history')
  noteHistory(@CurrentUser() user: AuthUser, @Param('noteId', ParseUUIDPipe) noteId: string) {
    return this.notes.history(user, noteId);
  }

  @Put('notes/:noteId/pin')
  pin(@CurrentUser() user: AuthUser, @Param('noteId', ParseUUIDPipe) noteId: string, @Body() dto: PinDto) {
    return this.notes.setPinned(user, noteId, dto.pinned);
  }

  @Put('notes/:noteId/archive')
  archive(@CurrentUser() user: AuthUser, @Param('noteId', ParseUUIDPipe) noteId: string, @Body() dto: ArchiveDto) {
    return this.notes.archive(user, noteId, dto.archived);
  }

  // Action items
  @Get('clients/:id/actions')
  listActions(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: ActionsQuery) {
    return this.actions.list(user, id, q.status);
  }

  @Roles('MENTOR')
  @Post('clients/:id/actions')
  createAction(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ActionDto) {
    return this.actions.create(user, id, dto);
  }

  @Roles('MENTOR')
  @Patch('actions/:actionId')
  updateAction(@CurrentUser() user: AuthUser, @Param('actionId', ParseUUIDPipe) actionId: string, @Body() dto: UpdateActionDto) {
    return this.actions.update(user, actionId, dto);
  }

  // Sessions
  @Get('sessions')
  listSessions(@CurrentUser() user: AuthUser, @Query() q: SessionsQuery) {
    return this.sessions.listForMentor(user, q);
  }

  @Roles('MENTOR')
  @Post('sessions')
  createSession(@CurrentUser() user: AuthUser, @Body() dto: SessionDto) {
    return this.sessions.create(user, dto);
  }

  @Get('sessions/:sessionId')
  getSession(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.sessions.get(user, sessionId);
  }

  @Roles('MENTOR')
  @Patch('sessions/:sessionId')
  updateSession(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sessionId: string, @Body() dto: UpdateSessionDto) {
    return this.sessions.update(user, sessionId, dto);
  }

  @Get('sessions/:sessionId/note')
  sessionNote(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.notes.forSession(user, sessionId);
  }

  // Prep sheet
  @Get('prep')
  prep(@CurrentUser() user: AuthUser, @Query() q: PrepQuery) {
    return this.prepSheet.prep(user, q);
  }

  // Nudges and rules
  @Get('nudge-templates')
  templates() {
    return this.nudges.templates();
  }

  @Get('clients/:id/nudges')
  listNudges(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.nudges.list(user, id);
  }

  @Roles('MENTOR')
  @Post('clients/:id/nudges')
  nudge(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NudgeDto) {
    return this.nudges.send(user, id, dto);
  }

  @Get('clients/:id/rules')
  rules(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.nudges.rules(user, id);
  }

  @Roles('MENTOR')
  @Post('clients/:id/rules')
  createRule(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RuleDto) {
    return this.nudges.createRule(user, id, dto);
  }

  @Roles('MENTOR')
  @Patch('rules/:ruleId')
  updateRule(@CurrentUser() user: AuthUser, @Param('ruleId', ParseUUIDPipe) ruleId: string, @Body() dto: UpdateRuleDto) {
    return this.nudges.updateRule(user, ruleId, dto);
  }

  // Weekly reports
  @Get('clients/:id/reports')
  listReports(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.list(user, id);
  }

  @HttpCode(200)
  @Post('clients/:id/reports/refresh')
  refreshReport(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RefreshReportDto) {
    return this.reports.refresh(user, id, dto.weekStart);
  }

  @Roles('MENTOR')
  @Patch('reports/:reportId')
  updateReport(@CurrentUser() user: AuthUser, @Param('reportId', ParseUUIDPipe) reportId: string, @Body() dto: ReportUpdateDto) {
    return this.reports.update(user, reportId, dto);
  }
}
