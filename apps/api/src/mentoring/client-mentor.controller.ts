import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../common/decorators/auth.decorators';
import { AssignmentsService } from './assignments.service';
import { ActionsService } from './actions.service';
import { SessionsService } from './sessions.service';
import { ClientUpdatesService } from './client-updates.service';
import { DirectoryService } from './directory.service';
import { ChooseMentorDto, MyActionDto, WhatsappOptInDto } from './mentoring.dto';

/** The client's side of mentoring: consent, stop sharing, sessions, action items and shared updates. */
@ApiTags('me')
@Roles('USER')
@Controller('me')
export class ClientMentorController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly actions: ActionsService,
    private readonly sessions: SessionsService,
    private readonly updates: ClientUpdatesService,
    private readonly directory: DirectoryService,
  ) {}

  /** Mentors the client can choose from, best matches first. */
  @Get('mentors')
  mentors(@CurrentUser() user: AuthUser) {
    return this.directory.list(user);
  }

  /** Choose (or switch to) a mentor. Choosing is consent, so sharing starts straight away. */
  @HttpCode(200)
  @Post('mentor/choose')
  choose(@CurrentUser() user: AuthUser, @Body() dto: ChooseMentorDto) {
    return this.directory.choose(user, dto);
  }

  @Get('mentor')
  mentor(@CurrentUser() user: AuthUser) {
    return this.assignments.mine(user);
  }

  @HttpCode(200)
  @Post('mentor/accept')
  accept(@CurrentUser() user: AuthUser) {
    return this.assignments.accept(user);
  }

  @HttpCode(200)
  @Post('mentor/decline')
  decline(@CurrentUser() user: AuthUser) {
    return this.assignments.decline(user);
  }

  @HttpCode(200)
  @Post('mentor/stop')
  stop(@CurrentUser() user: AuthUser) {
    return this.assignments.stopSharing(user);
  }

  @Put('mentor/whatsapp')
  whatsapp(@CurrentUser() user: AuthUser, @Body() dto: WhatsappOptInDto) {
    return this.assignments.setWhatsapp(user, dto);
  }

  @Get('mentor-updates')
  mentorUpdates(@CurrentUser() user: AuthUser) {
    return this.updates.forClient(user);
  }

  @Get('sessions')
  mySessions(@CurrentUser() user: AuthUser) {
    return this.sessions.mine(user);
  }

  @Get('actions')
  myActions(@CurrentUser() user: AuthUser) {
    return this.actions.mine(user);
  }

  @Patch('actions/:id')
  setAction(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MyActionDto) {
    return this.actions.setMine(user, id, dto.status);
  }
}
