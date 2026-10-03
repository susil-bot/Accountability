import { Body, Controller, Delete, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthUser, CurrentUser, Public } from '../common/decorators/auth.decorators';
import { PushService } from './push.service';

class PushKeysDto {
  @IsString()
  @MaxLength(200)
  p256dh: string;

  @IsString()
  @MaxLength(100)
  auth: string;
}

export class PushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: false })
  @MaxLength(1000)
  endpoint: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

export class PushUnsubscribeDto {
  @IsString()
  @MaxLength(1000)
  endpoint: string;
}

@ApiTags('push')
@Controller()
export class PushController {
  constructor(private readonly push: PushService) {}

  /** The VAPID public key the browser needs to subscribe (not secret). */
  @Public()
  @Get('push/public-key')
  publicKey() {
    return this.push.publicKey();
  }

  @Post('me/push-subscriptions')
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: PushSubscriptionDto, @Req() req: Request) {
    return this.push.subscribe(user.id, { endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth, userAgent: req.headers['user-agent'] });
  }

  @HttpCode(200)
  @Delete('me/push-subscriptions')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: PushUnsubscribeDto) {
    return this.push.unsubscribe(user.id, dto.endpoint);
  }
}
