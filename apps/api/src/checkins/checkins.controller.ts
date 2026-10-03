import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CheckInsService } from './checkins.service';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { HistoryQuery, SubmitCheckInDto } from './checkins.dto';

@ApiTags('checkins')
@Controller('checkins')
export class CheckInsController {
  constructor(private readonly checkins: CheckInsService) {}

  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.checkins.today(user);
  }

  /** Submit (or update, while the day is open) today's check-in. One per user per date. */
  @Post()
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitCheckInDto) {
    return this.checkins.submit(user, dto);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query() q: HistoryQuery) {
    return this.checkins.history(user, q.limit);
  }
}
