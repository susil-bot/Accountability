import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CommitmentsService } from './commitments.service';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { CommitmentInputDto, PauseCommitmentDto, UpdateCommitmentDto } from './commitments.dto';

@ApiTags('commitments')
@Controller()
export class CommitmentsController {
  constructor(private readonly commitments: CommitmentsService) {}

  @Get('goals/:goalId/commitments')
  list(@CurrentUser() user: AuthUser, @Param('goalId', ParseUUIDPipe) goalId: string) {
    return this.commitments.list(user, goalId);
  }

  @Post('goals/:goalId/commitments')
  create(@CurrentUser() user: AuthUser, @Param('goalId', ParseUUIDPipe) goalId: string, @Body() dto: CommitmentInputDto) {
    return this.commitments.create(user, goalId, dto);
  }

  @Patch('commitments/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommitmentDto) {
    return this.commitments.update(user, id, dto);
  }

  @Delete('commitments/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.commitments.remove(user, id);
  }

  @HttpCode(200)
  @Post('commitments/:id/pause')
  pause(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PauseCommitmentDto) {
    return this.commitments.pause(user, id, dto);
  }

  @HttpCode(200)
  @Post('commitments/:id/resume')
  resume(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.commitments.resume(user, id);
  }
}
