import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EvidenceService } from './evidence.service';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { CreateEvidenceDto, CreateUploadDto } from './evidence.dto';

@ApiTags('evidence')
@Controller()
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  /** Signed upload URL(s) for a photo or PDF. Bytes go straight to storage, never through the API. */
  @Post('evidence/uploads')
  createUpload(@CurrentUser() user: AuthUser, @Body() dto: CreateUploadDto) {
    return this.evidence.createUpload(user, dto);
  }

  /** Confirm an uploaded file, or add link / text evidence. */
  @Post('evidence')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEvidenceDto) {
    return this.evidence.create(user, dto);
  }

  @Get('task-occurrences/:id/evidence')
  list(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.evidence.listForOccurrence(user, id);
  }

  @Delete('evidence/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.evidence.remove(user, id);
  }
}
