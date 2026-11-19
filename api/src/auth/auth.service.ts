import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PasswordService } from '../security/password.service.js';
import { TokenService } from '../security/token.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { UsersService } from '../users/users.service.js';
import type { LoginDto } from './auth.schemas.js';
import type { AccessToken } from './auth.views.js';

/** An access token for the response body, plus the refresh token for the cookie. */
export interface SignedIn extends AccessToken {
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionsService,
  ) {}

  async login(dto: LoginDto): Promise<SignedIn> {
    const user = await this.users.findActiveForLogin(dto.login);
    // Always verify, even with no user, so timing does not reveal accounts.
    const valid = await this.passwords.verify(user?.passwordHash, dto.password);
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.signIn(user._id);
  }

  /** Starts a new session: used by login and registration. */
  async signIn(userId: string): Promise<SignedIn> {
    return {
      id: userId,
      accessToken: await this.tokens.issue(userId),
      refreshToken: await this.sessions.start(userId),
    };
  }

  /** Exchanges a refresh token for a new access token and a rotated refresh token. */
  async refresh(refreshToken: string | undefined): Promise<SignedIn> {
    const rotated = refreshToken
      ? await this.sessions.rotate(refreshToken)
      : null;
    if (!rotated) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    // Deactivation deletes a user's tokens, so this is a second line of defence.
    const user = await this.users.findActiveById(rotated.userId);
    if (!user) {
      await this.sessions.endAllForUser(rotated.userId);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return {
      id: user._id,
      accessToken: await this.tokens.issue(user._id),
      refreshToken: rotated.refreshToken,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.sessions.end(refreshToken);
  }
}
