import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiErrors } from '../openapi/openapi.js';
import { type LoginDto, loginSchema } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { type AccessToken, accessTokenSchema } from './auth.views.js';
import { Public } from './public.decorator.js';
import { AUTH_THROTTLE } from './throttle.js';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in',
    description:
      '"login" is treated as an email if it contains "@", otherwise as a username; both match case-insensitively. ' +
      'Tokens expire after JWT_EXPIRES_IN (default 1h). Rate limited.',
  })
  @ApiOkResponse({
    description: 'Logged in',
    standardSchema: accessTokenSchema,
  })
  @ApiErrors(
    400,
    {
      401: 'Incorrect credentials or deactivated user (same response either way)',
    },
    429,
  )
  login(@Body({ schema: loginSchema }) dto: LoginDto): Promise<AccessToken> {
    return this.auth.login(dto);
  }
}
