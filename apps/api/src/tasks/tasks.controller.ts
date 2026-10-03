import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { CompleteDto, NoteDto, ProgressDto, TasksByDateQuery } from './tasks.dto';

@ApiTags('tasks')
@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('tasks/today')
  today(@CurrentUser() user: AuthUser) {
    return this.tasks.today(user);
  }

  @Get('tasks')
  byDate(@CurrentUser() user: AuthUser, @Query() q: TasksByDateQuery) {
    return this.tasks.forDate(user, q.date);
  }

  @Get('task-occurrences/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.get(user, id);
  }

  /** Record progress (e.g. 20 of 30 minutes, or +1 for a weekly count). */
  @Patch('task-occurrences/:id')
  progress(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProgressDto) {
    return this.tasks.progress(user, id, dto.actualValue, dto.note);
  }

  @HttpCode(200)
  @Post('task-occurrences/:id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteDto) {
    return this.tasks.complete(user, id, dto.actualValue, dto.note);
  }

  @HttpCode(200)
  @Post('task-occurrences/:id/partial')
  partial(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProgressDto) {
    return this.tasks.partial(user, id, dto.actualValue, dto.note);
  }

  @HttpCode(200)
  @Post('task-occurrences/:id/miss')
  miss(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto) {
    return this.tasks.miss(user, id, dto.note);
  }

  @HttpCode(200)
  @Post('task-occurrences/:id/reset')
  reset(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.reset(user, id);
  }
}
