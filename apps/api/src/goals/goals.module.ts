import { Module } from '@nestjs/common';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { GoalsRepository } from './goals.repository';
import { CommitmentsModule } from '../commitments/commitments.module';

@Module({
  imports: [CommitmentsModule],
  controllers: [GoalsController],
  providers: [GoalsService, GoalsRepository],
  exports: [GoalsRepository],
})
export class GoalsModule {}
