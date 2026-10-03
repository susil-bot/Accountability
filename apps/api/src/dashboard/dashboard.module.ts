import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AnalyticsController } from '../analytics/analytics.controller';
import { TasksModule } from '../tasks/tasks.module';
import { GoalsModule } from '../goals/goals.module';

@Module({
  imports: [TasksModule, GoalsModule],
  controllers: [DashboardController, AnalyticsController],
  providers: [DashboardService, AnalyticsService],
  exports: [AnalyticsService],
})
export class DashboardModule {}
