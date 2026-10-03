import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { DashboardService } from '../dashboard/dashboard.service';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly dashboard: DashboardService,
  ) {}

  @Get('today')
  async today(@CurrentUser() user: AuthUser) {
    const d = await this.dashboard.get(user);
    return d.today;
  }

  @Get('week')
  week(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.analytics.week(user, date);
  }

  @Get('month')
  month(@CurrentUser() user: AuthUser, @Query('month') month?: string) {
    return this.analytics.month(user, month);
  }

  @Get('day/:date')
  day(@CurrentUser() user: AuthUser, @Param('date') date: string) {
    return this.analytics.day(user, date);
  }

  @Get('goal/:goalId')
  goal(@CurrentUser() user: AuthUser, @Param('goalId', ParseUUIDPipe) goalId: string) {
    return this.analytics.goal(user, goalId);
  }
}
