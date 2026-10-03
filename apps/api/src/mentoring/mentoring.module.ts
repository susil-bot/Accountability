import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { MentorAccessService } from './mentor-access.service';
import { AssignmentsService } from './assignments.service';
import { InvitesService } from './invites.service';
import { ClientInsightsService } from './client-insights.service';
import { NotesService } from './notes.service';
import { ActionsService } from './actions.service';
import { SessionsService } from './sessions.service';
import { NudgesService } from './nudges.service';
import { PrepService } from './prep.service';
import { ReportsService } from './reports.service';
import { ClientUpdatesService } from './client-updates.service';
import { AdminService } from './admin.service';
import { DirectoryService } from './directory.service';
import { MentoringJobsService } from './mentoring-jobs.service';
import { MentorController } from './mentor.controller';
import { AdminController } from './admin.controller';
import { ClientMentorController } from './client-mentor.controller';
import { InvitesController } from './invites.controller';

/** Mentors, admins and the client's side of mentoring. See docs/architecture.md → Mentoring. */
@Module({
  imports: [AuthModule, DashboardModule, EvidenceModule],
  controllers: [MentorController, AdminController, ClientMentorController, InvitesController],
  providers: [
    MentorAccessService,
    AssignmentsService,
    InvitesService,
    ClientInsightsService,
    NotesService,
    ActionsService,
    SessionsService,
    NudgesService,
    PrepService,
    ReportsService,
    ClientUpdatesService,
    AdminService,
    DirectoryService,
    MentoringJobsService,
  ],
  exports: [MentoringJobsService, SessionsService, AssignmentsService],
})
export class MentoringModule {}
