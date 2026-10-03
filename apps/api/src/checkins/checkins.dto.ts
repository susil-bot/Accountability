import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { BLOCKER_REASONS } from '../domain/checkin';

export class CheckInItemDto {
  @IsUUID()
  occurrenceId: string;

  @IsIn(['COMPLETED', 'PARTIAL', 'MISSED'])
  status: 'COMPLETED' | 'PARTIAL' | 'MISSED';

  /** Optional precise value for PARTIAL (e.g. 20 of 30 minutes) or weekly counts. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  actualValue?: number;
}

export class SubmitCheckInDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CheckInItemDto)
  items: CheckInItemDto[];

  /** "What got in the way?" */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsIn(BLOCKER_REASONS as unknown as string[], { each: true })
  blockers?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  blockerNote?: string;

  /** "How confident are you about tomorrow?" 1–5 */
  @IsInt()
  @Min(1)
  @Max(5)
  confidence: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  mood?: number;

  /** "What went well today?" */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reflection?: string;

  /** "Keep this private": the reflection is never shown to the client's mentor. */
  @IsOptional()
  @IsBoolean()
  reflectionPrivate?: boolean;
}

export class HistoryQuery {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(90)
  limit?: number;
}
