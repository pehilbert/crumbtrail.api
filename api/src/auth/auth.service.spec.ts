import { UnauthorizedException } from '@nestjs/common';
import type { PasswordService } from '../security/password.service.js';
import type { TokenService } from '../security/token.service.js';
import type { User } from '../users/user.schema.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const user = { _id: 'user-1', passwordHash: 'hash' } as User;
  let users: { findActiveForLogin: ReturnType<typeof vi.fn> };
  let passwords: { verify: ReturnType<typeof vi.fn> };
  let tokens: { issue: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    users = { findActiveForLogin: vi.fn() };
    passwords = { verify: vi.fn() };
    tokens = { issue: vi.fn().mockResolvedValue('token') };
    service = new AuthService(
      users as unknown as UsersService,
      passwords as unknown as PasswordService,
      tokens as unknown as TokenService,
    );
  });

  it('returns the user id and a token for valid credentials', async () => {
    users.findActiveForLogin.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(true);

    await expect(
      service.login({ login: 'johnny', password: 'pw' }),
    ).resolves.toEqual({ id: 'user-1', accessToken: 'token' });
    expect(tokens.issue).toHaveBeenCalledWith('user-1');
  });

  it('rejects a wrong password', async () => {
    users.findActiveForLogin.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ login: 'johnny', password: 'bad' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('still verifies a password when no user matches, then rejects', async () => {
    users.findActiveForLogin.mockResolvedValue(null);
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ login: 'nobody', password: 'pw' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(passwords.verify).toHaveBeenCalledWith(undefined, 'pw');
  });
});
