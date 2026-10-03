import { ArrayMaxSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, MaxLength, Min, Validate } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsTimeOfDay, IsTimezone } from '../common/validation';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @Validate(IsTimezone)
  timezone?: string;

  /** Local check-in time HH:mm */
  @IsOptional()
  @Validate(IsTimeOfDay)
  checkInTime?: string;

  /** ISO weekdays 1 (Mon) … 7 (Sun) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  restDays?: number[];

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  avatarUrl?: string;
}
