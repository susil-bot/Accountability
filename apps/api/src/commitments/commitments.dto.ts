import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
  Validate, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TargetUnit } from '@prisma/client';
import { IsLocalDate, IsTimeOfDay } from '../common/validation';
import { WEEKDAYS } from '../domain/recurrence';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RecurrenceDto {
  @IsIn(['DAILY', 'WEEKLY_DAYS', 'TIMES_PER_WEEK', 'MONTHLY'])
  type: 'DAILY' | 'WEEKLY_DAYS' | 'TIMES_PER_WEEK' | 'MONTHLY';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsIn(WEEKDAYS as unknown as string[], { each: true })
  days?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  timesPerWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;
}

export class CommitmentInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Transform(trim)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence: RecurrenceDto;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  targetValue: number;

  @IsIn(Object.values(TargetUnit))
  targetUnit: TargetUnit;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  customUnitLabel?: string;

  @IsOptional()
  @Validate(IsTimeOfDay)
  preferredTime?: string;

  @IsOptional()
  @IsBoolean()
  evidenceRequired?: boolean;

  @IsOptional()
  @Validate(IsLocalDate)
  startDate?: string;

  @IsOptional()
  @Validate(IsLocalDate)
  endDate?: string;
}

export class UpdateCommitmentDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) @Transform(trim) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @ValidateNested() @Type(() => RecurrenceDto) recurrence?: RecurrenceDto;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) targetValue?: number;
  @IsOptional() @IsIn(Object.values(TargetUnit)) targetUnit?: TargetUnit;
  @IsOptional() @IsString() @MaxLength(30) customUnitLabel?: string;
  /** null clears the preferred time */
  @IsOptional() @Validate(IsTimeOfDay) preferredTime?: string | null;
  @IsOptional() @IsBoolean() evidenceRequired?: boolean;
  @IsOptional() @Validate(IsLocalDate) endDate?: string | null;
}

export class PauseCommitmentDto {
  @IsOptional()
  @Validate(IsLocalDate)
  resumeAt?: string;
}
