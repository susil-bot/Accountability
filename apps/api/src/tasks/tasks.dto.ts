import { IsNumber, IsOptional, IsString, Max, MaxLength, Min, Validate } from 'class-validator';
import { IsLocalDate } from '../common/validation';

export class ProgressDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  actualValue: number;

  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class CompleteDto {
  /** Defaults to the target. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000) actualValue?: number;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class NoteDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class TasksByDateQuery {
  @Validate(IsLocalDate)
  date: string;
}
