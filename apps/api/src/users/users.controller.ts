import { Body, Controller, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { UpdateProfileDto } from './users.dto';

@ApiTags('users')
@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.update(user.id, dto);
  }

  @HttpCode(200)
  @Post('onboarded')
  onboarded(@CurrentUser() user: AuthUser) {
    return this.users.markOnboarded(user.id);
  }
}
