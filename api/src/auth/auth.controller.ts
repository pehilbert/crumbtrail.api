import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type LoginDto, loginSchema } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';
import { AUTH_THROTTLE } from './throttle.js';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body({ schema: loginSchema }) dto: LoginDto,
  ): Promise<{ id: string; accessToken: string }> {
    return this.auth.login(dto);
  }
}
