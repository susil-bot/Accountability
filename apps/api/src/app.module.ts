import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClientIpThrottlerGuard } from './common/guards/throttler.guard';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AccountabilityModule } from './accountability/accountability.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GoalsModule } from './goals/goals.module';
import { CommitmentsModule } from './commitments/commitments.module';
import { TasksModule } from './tasks/tasks.module';
import { CheckInsModule } from './checkins/checkins.module';
import { EvidenceModule } from './evidence/evidence.module';
import { StorageModule } from './evidence/storage.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthModule } from './health/health.module';
import { MentoringModule } from './mentoring/mentoring.module';
import { AuthGuard } from './common/guards/auth.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: Number(process.env.API_RATE_LIMIT ?? 300) }]),
    AuditModule,
    NotificationsModule,
    AccountabilityModule,
    AuthModule,
    UsersModule,
    GoalsModule,
    CommitmentsModule,
    TasksModule,
    CheckInsModule,
    StorageModule,
    EvidenceModule,
    DashboardModule,
    JobsModule,
    HealthModule,
    MentoringModule,
  ],
  providers: [
    // Order matters: rate limit → CSRF → authentication/authorization.
    { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
  ],
})
export class AppModule {}
