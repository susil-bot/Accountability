import { Global, Module } from '@nestjs/common';
import { AccountabilityService } from './accountability.service';
import { OccurrenceGeneratorService } from './occurrence-generator.service';
import { CompletionService } from './completion.service';

@Global()
@Module({
  providers: [AccountabilityService, OccurrenceGeneratorService, CompletionService],
  exports: [AccountabilityService, OccurrenceGeneratorService, CompletionService],
})
export class AccountabilityModule {}
