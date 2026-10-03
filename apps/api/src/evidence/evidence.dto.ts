import { IsIn, IsInt, IsOptional, IsString, IsUrl, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { ALLOWED_TYPES, MAX_EVIDENCE_BYTES, MAX_THUMBNAIL_BYTES } from './file-validation';
import { KEY_PATTERN } from './storage.types';

const TYPES = Object.keys(ALLOWED_TYPES);

/** Step 1: ask for signed upload URLs (the browser then PUTs bytes straight to storage). */
export class CreateUploadDto {
  @IsUUID()
  taskOccurrenceId: string;

  @IsIn(TYPES)
  contentType: string;

  @IsInt()
  @Min(1)
  @Max(MAX_EVIDENCE_BYTES)
  size: number;

  @IsOptional()
  @IsIn(TYPES.filter((t) => t.startsWith('image/')))
  thumbnailContentType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_THUMBNAIL_BYTES)
  thumbnailSize?: number;
}

/** Step 2: record evidence — confirm an uploaded file, or add a link / written note. */
export class CreateEvidenceDto {
  @IsUUID()
  taskOccurrenceId: string;

  @IsIn(['IMAGE', 'FILE', 'URL', 'TEXT'])
  type: 'IMAGE' | 'FILE' | 'URL' | 'TEXT';

  @IsOptional()
  @Matches(KEY_PATTERN)
  uploadKey?: string;

  @IsOptional()
  @Matches(KEY_PATTERN)
  thumbnailKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  originalName?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
