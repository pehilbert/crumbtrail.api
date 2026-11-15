import { Injectable } from '@nestjs/common';
import type { CookieSerializeOptions } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { Env } from '../config/env.js';

export const REFRESH_COOKIE = 'crumbtrail_refresh';

/** The browser sends the cookie only to the auth endpoints. */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** Sets and clears the httpOnly cookie that carries the refresh token. */
@Injectable()
export class RefreshCookie {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly config: ConfigService<Env, true>,
  ) {}

  set(response: unknown, token: string): void {
    this.adapterHost.httpAdapter.setCookie?.(response, REFRESH_COOKIE, token, {
      ...this.attributes(),
      maxAge: this.config.get('REFRESH_TOKEN_EXPIRES_IN', { infer: true }),
    });
  }

  clear(response: unknown): void {
    this.adapterHost.httpAdapter.clearCookie?.(
      response,
      REFRESH_COOKIE,
      this.attributes(),
    );
  }

  private attributes(): CookieSerializeOptions {
    return {
      path: REFRESH_COOKIE_PATH,
      httpOnly: true,
      secure: this.config.get('REFRESH_COOKIE_SECURE', { infer: true }),
      sameSite: this.config.get('REFRESH_COOKIE_SAME_SITE', { infer: true }),
    };
  }
}
