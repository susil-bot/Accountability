import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../common/decorators/auth.decorators';
import { SESSION_COOKIE } from '../common/guards/auth.guard';
import { AuthService } from '../auth/auth.service';
import { InvitesService } from './invites.service';
import { AcceptInviteDto, InviteTokenQuery } from './mentoring.dto';

const INVITE_LIMIT = () => ({ default: { limit: Number(process.env.AUTH_RATE_LIMIT ?? 10), ttl: 60_000 } });

/** Public invite endpoints, rate-limited like login (tokens are 256-bit random, so guessing is futile anyway). */
@ApiTags('auth')
@Controller('auth')
export class InvitesController {
  constructor(
    private readonly invites: InvitesService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Throttle(INVITE_LIMIT())
  @Get('invite')
  preview(@Query() q: InviteTokenQuery) {
    return this.invites.preview(q.token);
  }

  @Public()
  @Throttle(INVITE_LIMIT())
  @Post('accept-invite')
  async accept(@Body() dto: AcceptInviteDto, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.invites.accept(dto);
    res.cookie(SESSION_COOKIE, token, this.auth.cookieOptions());
    return { user };
  }
}
