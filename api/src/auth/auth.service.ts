import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PasswordService } from '../security/password.service.js';
import { TokenService } from '../security/token.service.js';
import { UsersService } from '../users/users.service.js';
import type { LoginDto } from './auth.schemas.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async login(dto: LoginDto): Promise<{ id: string; accessToken: string }> {
    const user = await this.users.findActiveForLogin(dto.login);
    // Always verify, even with no user, so timing does not reveal accounts.
    const valid = await this.passwords.verify(user?.passwordHash, dto.password);
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { id: user._id, accessToken: await this.tokens.issue(user._id) };
  }
}
