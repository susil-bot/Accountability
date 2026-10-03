import { Global, Module } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { JobQueueService } from './job-queue.service';
import { JobHandlers } from './job-handlers';
import { JobRunnerService } from './job-runner.service';
import { EvidenceCleanupService } from '../evidence/evidence-cleanup.service';
import { StorageModule } from '../evidence/storage.module';
import { MentoringModule } from '../mentoring/mentoring.module';

@Global()
@Module({
  imports: [StorageModule, MentoringModule],
  providers: [MaintenanceService, JobQueueService, JobHandlers, JobRunnerService, EvidenceCleanupService],
  exports: [MaintenanceService, JobQueueService, JobRunnerService],
})
export class JobsModule {}
