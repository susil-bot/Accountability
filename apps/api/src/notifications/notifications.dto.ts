import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdatePreferencesDto {
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @IsOptional() @IsBoolean() pushEnabled?: boolean;
  @IsOptional() @IsBoolean() whatsappEnabled?: boolean;
  @IsOptional() @IsBoolean() taskReminderEnabled?: boolean;
  @IsOptional() @IsBoolean() checkinReminderEnabled?: boolean;
  @IsOptional() @IsBoolean() weeklyReviewEnabled?: boolean;
}

export class ListNotificationsQuery {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unread?: boolean;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  limit?: number;
}
