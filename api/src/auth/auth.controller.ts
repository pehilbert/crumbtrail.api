import {
  Body,
  Controller,
  Cookies,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ApiErrors,
  CLEARS_REFRESH_COOKIE,
  REFRESH_COOKIE_AUTH,
  SETS_REFRESH_COOKIE,
} from '../openapi/openapi.js';
import { REFRESH_COOKIE, RefreshCookie } from '../sessions/refresh-cookie.js';
import { type LoginDto, loginSchema } from './auth.schemas.js';
import { AuthService, type SignedIn } from './auth.service.js';
import { type AccessToken, accessTokenSchema } from './auth.views.js';
import { Public } from './public.decorator.js';
import { AUTH_THROTTLE } from './throttle.js';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly refreshCookie: RefreshCookie,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in',
    description:
      '"login" is treated as an email if it contains "@", otherwise as a username; both match case-insensitively. ' +
      'Returns an access token (expires after JWT_EXPIRES_IN, default 15m) and sets the refresh cookie. Rate limited.',
  })
  @ApiOkResponse({
    description: 'Logged in',
    standardSchema: accessTokenSchema,
    headers: SETS_REFRESH_COOKIE,
  })
  @ApiErrors(
    400,
    {
      401: 'Incorrect credentials or deactivated user (same response either way)',
    },
    429,
  )
  async login(
    @Body({ schema: loginSchema }) dto: LoginDto,
    @Res({ passthrough: true }) response: unknown,
  ): Promise<AccessToken> {
    return this.respond(response, await this.auth.login(dto));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE_AUTH)
  @ApiOperation({
    summary: 'Get a new access token',
    description:
      'Reads the refresh cookie (no body or Authorization header needed), returns a new access token and ' +
      'rotates the cookie. Reusing an already spent refresh token ends the session, except within 10 seconds ' +
      'of it being spent (two tabs refreshing at once). Rate limited.',
  })
  @ApiOkResponse({
    description: 'New access token; the refresh cookie was rotated',
    standardSchema: accessTokenSchema,
    headers: SETS_REFRESH_COOKIE,
  })
  @ApiErrors(
    {
      401: 'Missing, unknown, expired or reused refresh token, or deactivated user. The cookie is cleared; log in again.',
    },
    429,
  )
  async refresh(
    @Cookies(REFRESH_COOKIE) refreshToken: string | undefined,
    @Res({ passthrough: true }) response: unknown,
  ): Promise<AccessToken> {
    try {
      return this.respond(response, await this.auth.refresh(refreshToken));
    } catch (error) {
      this.refreshCookie.clear(response);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE_AUTH)
  @ApiOperation({
    summary: 'Log out',
    description:
      'Ends the session the refresh cookie belongs to and clears the cookie. No Authorization header needed. ' +
      'Succeeds even without a valid cookie. Discard the access token too.',
  })
  @ApiNoContentResponse({
    description: 'Logged out',
    headers: CLEARS_REFRESH_COOKIE,
  })
  async logout(
    @Cookies(REFRESH_COOKIE) refreshToken: string | undefined,
    @Res({ passthrough: true }) response: unknown,
  ): Promise<void> {
    await this.auth.logout(refreshToken);
    this.refreshCookie.clear(response);
  }

  private respond(response: unknown, signedIn: SignedIn): AccessToken {
    this.refreshCookie.set(response, signedIn.refreshToken);
    return { id: signedIn.id, accessToken: signedIn.accessToken };
  }
}
