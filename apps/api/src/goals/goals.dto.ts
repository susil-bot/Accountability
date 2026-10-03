import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
  Validate, ValidateNested, Equals,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { GoalCategory, GoalStatus, TargetUnit } from '@prisma/client';
import { IsLocalDate, IsTimeOfDay } from '../common/validation';
import { CommitmentInputDto } from '../commitments/commitments.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateGoalDto {
  @IsString() @IsNotEmpty() @MaxLength(140) @Transform(trim) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  /** Why is this important? */
  @IsOptional() @IsString() @MaxLength(2000) motivation?: string;
  /** How will you measure success? */
  @IsOptional() @IsString() @MaxLength(500) successMeasure?: string;
  @IsIn(Object.values(GoalCategory)) category: GoalCategory;
  @IsOptional() @Validate(IsLocalDate) startDate?: string;
  @IsOptional() @Validate(IsLocalDate) targetDate?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) targetValue?: number;
  @IsOptional() @IsIn(Object.values(TargetUnit)) targetUnit?: TargetUnit;

  /** Index into `commitments` whose actual values count towards targetValue. */
  @IsOptional() @IsInt() @Min(0) @Max(19) progressCommitmentIndex?: number;

  /** Activate immediately (default) or save as a draft. */
  @IsOptional() @IsBoolean() activate?: boolean;

  /** Also sets the user's daily check-in time. */
  @IsOptional() @Validate(IsTimeOfDay) checkInTime?: string;

  /** Also sets the user's rest days (ISO weekdays 1–7), so onboarding is one atomic request. */
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true }) restDays?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CommitmentInputDto)
  commitments?: CommitmentInputDto[];
}

export class UpdateGoalDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(140) @Transform(trim) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(2000) motivation?: string;
  @IsOptional() @IsString() @MaxLength(500) successMeasure?: string;
  @IsOptional() @IsIn(Object.values(GoalCategory)) category?: GoalCategory;
  @IsOptional() @Validate(IsLocalDate) targetDate?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) targetValue?: number | null;
  @IsOptional() @IsIn(Object.values(TargetUnit)) targetUnit?: TargetUnit | null;
  @IsOptional() @IsUUID() progressCommitmentId?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class CompleteGoalDto {
  /** Explicit user confirmation — goals are never completed automatically. */
  @Equals(true, { message: 'confirm must be true to complete a goal' })
  confirm: boolean;

  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class ListGoalsQuery {
  @IsOptional() @IsIn(Object.values(GoalStatus)) status?: GoalStatus;
}
