import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../common/decorators/auth.decorators';
import { AdminService } from './admin.service';
import { AssignmentsService } from './assignments.service';
import { InvitesService } from './invites.service';
import { ActiveDto, AssignDto, AuditQuery, CapacityDto, ClientsQuery, InviteMentorDto } from './mentoring.dto';

/** Admin-only. The role is re-read from the database on every request by the global AuthGuard. */
@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly assignments: AssignmentsService,
    private readonly invites: InvitesService,
  ) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.admin.overview(user);
  }

  @Get('mentors')
  mentors() {
    return this.admin.mentors();
  }

  @Get('mentors/:id/activity')
  activity(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.mentorActivity(id);
  }

  @Patch('mentors/:id/capacity')
  capacity(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CapacityDto) {
    return this.admin.setCapacity(user, id, dto.capacity);
  }

  @Get('invites')
  listInvites() {
    return this.invites.list();
  }

  @Post('mentors/invite')
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteMentorDto) {
    return this.invites.create(user, dto);
  }

  @HttpCode(200)
  @Post('invites/:id/revoke')
  revokeInvite(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.invites.revoke(user, id);
  }

  @Get('clients')
  clients(@Query() q: ClientsQuery) {
    return this.admin.clients(q);
  }

  @Get('clients/:id/assignments')
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.clientHistory(id);
  }

  @Post('assignments')
  assign(@CurrentUser() user: AuthUser, @Body() dto: AssignDto) {
    return this.assignments.assign(user, dto);
  }

  @HttpCode(200)
  @Post('assignments/:id/end')
  end(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.endByAdmin(user, id);
  }

  @HttpCode(200)
  @Post('users/:id/active')
  setActive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ActiveDto) {
    return this.admin.setActive(user, id, dto.active);
  }

  @Get('audit')
  audit(@Query() q: AuditQuery) {
    return this.admin.auditLog(q);
  }

  @Get('people')
  people() {
    return this.admin.people();
  }
}
