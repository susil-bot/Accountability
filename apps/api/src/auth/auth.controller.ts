import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthUser, CurrentUser, Public } from '../common/decorators/auth.decorators';
import { SESSION_COOKIE } from '../common/guards/auth.guard';

const AUTH_LIMIT = () => ({ default: { limit: Number(process.env.AUTH_RATE_LIMIT ?? 10), ttl: 60_000 } });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_LIMIT())
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.auth.register(dto);
    res.cookie(SESSION_COOKIE, token, this.auth.cookieOptions());
    return { user };
  }

  @Public()
  @Throttle(AUTH_LIMIT())
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.auth.login(dto);
    res.cookie(SESSION_COOKIE, token, this.auth.cookieOptions());
    return { user };
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    const { maxAge: _maxAge, ...opts } = this.auth.cookieOptions();
    res.clearCookie(SESSION_COOKIE, opts);
    return { loggedOut: true };
  }

  @HttpCode(200)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutEverywhere(user.id);
    const { maxAge: _maxAge, ...opts } = this.auth.cookieOptions();
    res.clearCookie(SESSION_COOKIE, opts);
    return { loggedOut: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  /** Anonymous-safe session probe for static pages: 200 with `null` when signed out (no 401 noise). */
  @Public()
  @Get('session')
  async session(@CurrentUser() user: AuthUser | undefined) {
    return user ? this.auth.me(user.id) : null;
  }
}
