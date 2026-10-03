import { Module } from '@nestjs/common';
import { CommitmentsController } from './commitments.controller';
import { CommitmentsService } from './commitments.service';
import { CommitmentsRepository } from './commitments.repository';

@Module({
  controllers: [CommitmentsController],
  providers: [CommitmentsService, CommitmentsRepository],
  exports: [CommitmentsService, CommitmentsRepository],
})
export class CommitmentsModule {}
